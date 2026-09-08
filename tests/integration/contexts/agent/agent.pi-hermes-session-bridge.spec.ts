import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'

import { AgentLaunchArtifactScope } from '../../../../src/contexts/agent/application/services/AgentLaunchArtifactScope'
import { PiAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/pi/PiAgentProviderContribution'
import { HermesAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/hermes/HermesAgentProviderContribution'

const run = promisify(execFile)

describe('Pi and Hermes session bridges', () => {
  it.each(['resume', 'empty', 'first-message'] as const)(
    'follows the final Pi session for %s',
    async (mode) => {
      const directory = await mkdtemp(join(tmpdir(), 'pi-session-test-'))
      const artifacts = new AgentLaunchArtifactScope()
      const identified = vi.fn()
      const cleared = vi.fn()
      try {
        const provider = new PiAgentProviderContribution()
        const plan = await provider.launcher.createLaunchPlan({
          artifacts,
          onProviderSessionIdentified: identified,
          onProviderSessionCleared: cleared,
          workspaceDirectory: directory
        })
        artifacts.seal()
        const extension = plan.args[plan.args.indexOf('--extension') + 1]
        expect(extension).toBeDefined()
        const script = join(directory, 'pi.mjs')
        await writeFile(
          script,
          `
import extension from ${JSON.stringify(pathToFileURL(extension!).href)};
import { writeFileSync } from 'node:fs';
const handlers = new Map();
extension({ on: (name, handler) => handlers.set(name, handler) });
let file = ${JSON.stringify(join(directory, 'first.jsonl'))};
const ctx = { sessionManager: { getSessionFile: () => file } };
handlers.get('session_start')({}, ctx);
writeFileSync(file, '{}');
handlers.get('agent_end')({}, ctx);
file = ${JSON.stringify(join(directory, 'second.jsonl'))};
const mode = ${JSON.stringify(mode)};
if (mode === 'resume') writeFileSync(file, '{}');
handlers.get('session_start')({ reason: 'resume' }, ctx);
if (mode === 'first-message') {
  handlers.get('message_end')({ message: { role: 'assistant' } }, ctx);
  writeFileSync(file, '{}');
  await new Promise(resolve => setImmediate(resolve));
}
handlers.get('session_shutdown')({}, ctx);
`
        )
        await run(process.execPath, [script])
        await artifacts.dispose()
        if (mode === 'empty') expect(cleared).toHaveBeenCalled()
        else
          expect(identified).toHaveBeenLastCalledWith({
            formatVersion: 1,
            kind: 'pi-session',
            value: join(directory, 'second.jsonl')
          })
      } finally {
        await artifacts.dispose()
        await rm(directory, { force: true, recursive: true })
      }
    }
  )

  it.each([
    'prompt',
    'resume',
    'empty',
    'activate',
    'background',
    'failed-resume',
    'new-after-prompt',
    'rejected-prompt',
    'fragmented',
    'gateway-restart'
  ] as const)('maps Hermes live IDs to durable IDs for %s', async (mode) => {
    const directory = await mkdtemp(join(tmpdir(), 'hermes-session-test-'))
    const artifacts = new AgentLaunchArtifactScope()
    const identified = vi.fn()
    const cleared = vi.fn()
    try {
      const plan = await new HermesAgentProviderContribution().launcher.createLaunchPlan({
        artifacts,
        onProviderSessionIdentified: identified,
        onProviderSessionCleared: cleared,
        workspaceDirectory: directory
      })
      artifacts.seal()
      expect(plan.env.NODE_OPTIONS).toContain('--import=')
      const activeFile = join(directory, 'active.json')
      await writeFile(activeFile, '')
      const gateway = join(directory, 'gateway.mjs')
      await writeFile(
        gateway,
        `
import { createInterface } from 'node:readline';
const mode = ${JSON.stringify(mode)};
if ((process.env.NODE_OPTIONS ?? '').includes('--import=')) throw new Error('session preload leaked to gateway');
createInterface({ input: process.stdin }).on('line', line => {
 const q = JSON.parse(line);
 let result;
 if (q.method === 'session.create') result = q.id === '3' ? { session_id: 'ffff1234', stored_session_id: '20260908_123458_c1b2c3' } : { session_id: 'abcd1234', stored_session_id: '20260908_123456_a1b2c3' };
 else if (q.method === 'session.resume') result = { session_id: 'eeee1234', resumed: '20260908_123457_b1b2c3' };
 else if (q.method === 'session.activate') result = { session_id: 'eeee1234', session_key: '20260908_123457_b1b2c3', message_count: 2 };
 else result = { status: 'streaming' };
 const error = (mode === 'failed-resume' && q.method === 'session.resume') || mode === 'rejected-prompt' && q.method === 'prompt.submit';
 const response = JSON.stringify({ jsonrpc: '2.0', id: q.id, ...(error ? { error: { code: 4007 } } : { result }) }) + '\\n';
 if (mode === 'fragmented') {
   process.stdout.write(response.slice(0, 17));
   setImmediate(() => process.stdout.write(response.slice(17)));
 } else process.stdout.write(response);
});
`
      )
      const script = join(directory, 'tui.mjs')
      await writeFile(
        script,
        `
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
let child;
const mode = ${JSON.stringify(mode)};
const send = (id, method, params = {}) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\\n');
let restarted = false;
function start() {
child = spawn(process.execPath, [${JSON.stringify(gateway)}, '-m', 'tui_gateway.entry'], { stdio: ['pipe','pipe','inherit'] });
createInterface({ input: child.stdout }).on('line', line => {
 const r = JSON.parse(line);
 if (r.id === '1') {
   writeFileSync(process.env.HERMES_TUI_ACTIVE_SESSION_FILE, JSON.stringify({ session_id: 'abcd1234' }));
   if (mode === 'gateway-restart') { child.stdin.end(); return; }
   if (['prompt', 'failed-resume', 'new-after-prompt', 'rejected-prompt'].includes(mode)) send('2', 'prompt.submit', { session_id: 'abcd1234' });
   else if (mode === 'activate') send('2', 'session.activate', { session_id: 'eeee1234' });
   else if (mode !== 'empty') send('2', 'session.resume', { session_id: '20260908_123457_b1b2c3' });
   else child.stdin.end();
 } else if (r.id === '2') {
   if (['resume', 'background', 'fragmented', 'activate', 'gateway-restart'].includes(mode)) writeFileSync(process.env.HERMES_TUI_ACTIVE_SESSION_FILE, JSON.stringify({ session_id: r.result.resumed ?? r.result.session_key }));
   if (mode === 'background') send('3', 'prompt.submit', { session_id: 'abcd1234' });
   else if (mode === 'new-after-prompt') send('3', 'session.create');
   else if (mode === 'failed-resume') send('3', 'session.resume', { session_id: '20260908_123457_b1b2c3' });
   else child.stdin.end();
 } else {
   if (mode === 'new-after-prompt') writeFileSync(process.env.HERMES_TUI_ACTIVE_SESSION_FILE, JSON.stringify({ session_id: r.result.session_id }));
   child.stdin.end();
 }
});
child.on('close', () => { if (mode === 'gateway-restart' && !restarted) { restarted = true; start(); } });
send(restarted ? '2' : '1', restarted ? 'session.resume' : 'session.create', restarted ? { session_id: '20260908_123457_b1b2c3' } : {});
}
start();
`
      )
      await run(process.execPath, [script], {
        env: { ...process.env, ...plan.env, HERMES_TUI_ACTIVE_SESSION_FILE: activeFile },
        timeout: 10000
      })
      await artifacts.dispose()
      if (['empty', 'new-after-prompt', 'rejected-prompt'].includes(mode)) {
        if (mode !== 'new-after-prompt') expect(identified).not.toHaveBeenCalled()
        expect(cleared).toHaveBeenCalled()
      } else
        expect(identified).toHaveBeenLastCalledWith({
          formatVersion: 1,
          kind: 'hermes-session',
          value: ['prompt', 'failed-resume'].includes(mode)
            ? '20260908_123456_a1b2c3'
            : '20260908_123457_b1b2c3'
        })
    } finally {
      await artifacts.dispose()
      await rm(directory, { force: true, recursive: true })
    }
  })
})
