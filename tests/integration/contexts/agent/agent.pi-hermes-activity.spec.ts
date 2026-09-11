import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'

import { AgentLaunchArtifactScope } from '../../../../src/contexts/agent/application/services/AgentLaunchArtifactScope'
import { PiAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/pi/PiAgentProviderContribution'
import { HermesAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/hermes/HermesAgentProviderContribution'
import { AgentHookGateway } from '../../../../src/contexts/agent/infrastructure/terminal-activity/AgentHookGateway'
import { TerminalAgentTelemetryAssetStore } from '../../../../src/contexts/agent/infrastructure/terminal-activity/TerminalAgentTelemetryAssetStore'

const execute = promisify(execFile)
const providers = ['pi', 'hermes'] as const
const entries = process.platform === 'win32' ? ['managed'] : ['managed', 'terminal', 'managed-shim']

describe.each(entries)('Pi and Hermes activity through %s', (entry) => {
  it.each(['running', 'working', 'waiting', 'idle', 'background-complete', 'unselected'])(
    'restores only an active foreground Hermes turn after activation: %s',
    async (state) => {
      const signals = await runScenario(entry!, 'hermes', 'activate-' + state)
      const active = ['running', 'working', 'waiting'].includes(state)
      expect(signals.filter((value) => value === 'completed')).toHaveLength(active ? 1 : 0)
      expect(signals.filter((value) => value === 'working')).toHaveLength(active ? 2 : 1)
    }
  )

  it.each([
    'input',
    'approval',
    'mixed',
    'answered',
    'approval-answered',
    'expired',
    'ended',
    'late-input',
    'late-approval'
  ])('restores unresolved Hermes waits after switching: %s', async (kind) => {
    const signals = await runScenario(entry!, 'hermes', 'wait-switch-' + kind)
    const visible = signals.filter((value) => value !== 'idle' && value !== 'unavailable')
    const waiting =
      kind.includes('approval') || kind === 'mixed' ? 'waiting_approval' : 'waiting_input'
    expect(visible).toEqual([
      'working',
      ...(kind === 'mixed' ? ['waiting_input'] : []),
      waiting,
      ...(kind === 'ended'
        ? []
        : [
            kind.endsWith('answered') || kind === 'expired' ? 'working' : waiting,
            ...(kind === 'mixed' ? ['waiting_input'] : []),
            ...(kind.endsWith('answered') || kind === 'expired' ? [] : ['working']),
            'completed'
          ])
    ])
  })

  it('continues notifying after Pi reloads its extension within the same launch', async () => {
    const signals = await runScenario(entry!, 'pi', 'reload')
    expect(signals.filter((value) => value === 'completed')).toHaveLength(2)
  })
  it('keeps Pi working through automatic retries until it settles', async () => {
    const signals = await runScenario(entry!, 'pi', 'retry')
    expect(signals.filter((value) => value === 'completed')).toHaveLength(1)
    expect(signals.slice(signals.indexOf('working'), signals.indexOf('completed'))).not.toContain(
      'idle'
    )
  })

  it('keeps Hermes waiting until all correlated input prompts are answered', async () => {
    const signals = await runScenario(entry!, 'hermes', 'input')
    expect(signals.filter((value) => value !== 'idle' && value !== 'unavailable')).toEqual([
      'working',
      'waiting_input',
      'working',
      'completed'
    ])
  })

  it('clears Hermes input waiting when the gateway expires the prompt', async () => {
    const signals = await runScenario(entry!, 'hermes', 'expired')
    expect(signals.filter((value) => value !== 'idle' && value !== 'unavailable')).toEqual([
      'working',
      'waiting_input',
      'working',
      'completed'
    ])
  })
  it.each(providers)('reports ordered waiting and one completion from %s', async (providerId) => {
    const signals = await runScenario(entry!, providerId, 'complete')
    expect(signals.filter((signal) => signal !== 'idle' && signal !== 'unavailable')).toEqual([
      'working',
      providerId === 'pi' ? 'waiting_input' : 'waiting_approval',
      'working',
      'completed'
    ])
  })

  it.each(providers)(
    'does not turn %s errors or cancellation into completion',
    async (providerId) => {
      for (const outcome of ['error', 'interrupted', 'switch']) {
        const signals = await runScenario(entry!, providerId, outcome)
        expect(signals).toContain('working')
        expect(signals).not.toContain('completed')
        // Registry treats working -> idle as completion too.
        expect(signals.slice(signals.indexOf('working') + 1)).not.toContain('idle')
      }
    }
  )
})

async function runScenario(entry: string, providerId: (typeof providers)[number], outcome: string) {
  const root = await mkdtemp(join(tmpdir(), 'cleancode-provider-activity-'))
  const artifacts = new AgentLaunchArtifactScope()
  const signals: string[] = []
  const gateway = await AgentHookGateway.start({
    authorize: (_identity, token) => token === 'test-token',
    onReport: ({ signal }) => {
      if (signal.type === 'turn_completed') signals.push('completed')
      else if (signal.type === 'status_changed') signals.push(signal.status)
    }
  })
  try {
    const script = join(root, 'provider.mjs')
    const sessionFile = join(root, 'session.jsonl')
    await writeFile(sessionFile, '{}')
    const activeFile = join(root, 'active.json')
    await writeFile(activeFile, JSON.stringify({ session_id: 'foreground' }))
    await writeFile(script, providerId === 'pi' ? piScript : hermesScript)
    await writeFile(join(root, 'gateway.mjs'), gatewayScript)
    const store = new TerminalAgentTelemetryAssetStore({
      runtimeExecutable: process.execPath,
      stateDirectory: root
    })
    const assets = await store.ensure()
    await store.publishGateway(gateway.url)
    const bin = join(root, 'bin')
    await mkdir(bin)
    const executable = join(bin, providerId)
    await writeFile(executable, `#!${process.execPath}\nimport(${JSON.stringify(script)});\n`)
    await chmod(executable, 0o700)
    const environment = {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
      TEST_ROOT: root,
      TEST_OUTCOME: outcome,
      HERMES_TUI_ACTIVE_SESSION_FILE: activeFile,
      CLEANCODE_AGENT_ACTIVITY_MANIFEST: assets.gatewayManifestPath,
      CLEANCODE_AGENT_ACTIVITY_TOKEN: 'test-token',
      CLEANCODE_AGENT_ACTIVITY_SCOPE: Buffer.from(
        JSON.stringify({
          blockId: 'block',
          generation: 1,
          projectDirectory: root,
          projectId: 'project',
          runId: 'run',
          sessionId: 'terminal',
          workspaceDirectory: root,
          workspaceId: 'workspace'
        })
      ).toString('base64url')
    }
    if (entry === 'terminal') {
      await execute(
        process.execPath,
        [join(assets.rootDirectory, 'assets-v1', 'shim-launcher.mjs'), providerId, providerId],
        { env: environment, timeout: 10000 }
      )
    } else {
      const provider =
        providerId === 'pi'
          ? new PiAgentProviderContribution()
          : new HermesAgentProviderContribution()
      const plan = await provider.launcher.createLaunchPlan({
        artifacts,
        onProviderSessionIdentified: () => {},
        onActivityChanged: (status) => signals.push(status),
        onTurnCompleted: () => signals.push('completed'),
        workspaceDirectory: root
      })
      artifacts.seal()
      const args =
        entry === 'managed-shim'
          ? [
              join(assets.rootDirectory, 'assets-v1', 'shim-launcher.mjs'),
              providerId,
              providerId,
              ...plan.args
            ]
          : [script, ...plan.args]
      await execute(process.execPath, args, {
        env: { ...environment, ...plan.env },
        timeout: 10000
      })
    }
    await artifacts.dispose()
    return signals
  } finally {
    await artifacts.dispose()
    await gateway.dispose()
    await rm(root, { recursive: true, force: true })
  }
}

const piScript = String.raw`
import { pathToFileURL } from 'node:url';
const args = process.argv;
const extensionPath = args[args.indexOf('--extension') + 1];
if (!args.includes('--extension')) process.exit(0);
const extension = (await import(pathToFileURL(extensionPath).href)).default;
const handlers = new Map();
extension({ on: (name, handler) => handlers.set(name, handler) });
let file = process.env.TEST_ROOT + '/session.jsonl';
const ctx = { sessionManager: { getSessionFile: () => file }, isIdle: () => true };
const emit = async (name, event = {}) => handlers.get(name)?.(event, ctx);
await emit('session_start');
await emit('agent_start');
await emit('ui_prompt_start', { kind: 'confirm' });
await emit('ui_prompt_end');
const outcome = process.env.TEST_OUTCOME;
if (outcome === 'retry') {
  await emit('agent_end', { messages: [{ role: 'assistant', stopReason: 'error' }] });
  await emit('agent_start');
}
await emit('agent_end', { messages: [{ role: 'assistant', stopReason: ['complete', 'retry', 'reload'].includes(outcome) ? 'stop' : outcome === 'error' ? 'error' : 'aborted' }] });
if (outcome === 'switch') {
  await emit('session_shutdown');
  file = process.env.TEST_ROOT + '/new.jsonl';
  await emit('session_start');
}
await emit('agent_settled');
await emit('agent_settled');
await emit('session_shutdown');
if (outcome === 'reload') {
  const reloaded = (await import(pathToFileURL(extensionPath).href + '?reload=1')).default;
  reloaded({ on: (name, handler) => handlers.set(name, handler) });
  await emit('session_start');
  await emit('agent_start');
  await emit('agent_end', { messages: [{ role: 'assistant', stopReason: 'stop' }] });
  await emit('agent_settled');
  await emit('session_shutdown');
}
`

const hermesScript = String.raw`
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';
const child = spawn(process.execPath, [process.env.TEST_ROOT + '/gateway.mjs', '-m', 'tui_gateway.entry'], { stdio: ['pipe', 'pipe', 'inherit'] });
let sequence = 0;
const pending = new Map();
createInterface({ input: child.stdout }).on('line', line => { const packet = JSON.parse(line); pending.get(packet.id)?.(packet.result); });
function request(method, params = {}) { return new Promise(resolve => { const id = ++sequence; pending.set(id, resolve); child.stdin.write(JSON.stringify({ id, method, params }) + '\n'); }); }
await request('session.create');
await request('prompt.submit', { session_id: 'foreground' });
const activation = process.env.TEST_OUTCOME.startsWith('activate-');
if (process.env.TEST_OUTCOME.startsWith('wait-switch-')) {
  const kind = process.env.TEST_OUTCOME.slice('wait-switch-'.length);
  await request('test.wait');
  writeFileSync(process.env.HERMES_TUI_ACTIVE_SESSION_FILE, JSON.stringify({ session_id: 'other' }));
  await request('test.barrier');
  if (kind === 'approval-answered') await request('approval.respond', { session_id: 'foreground', choice: 'once' });
  if (kind.startsWith('late-')) {
    const reply = request(kind === 'late-approval' ? 'approval.respond' : 'clarify.respond', { session_id: 'foreground', request_id: 'first', all: true, defer: true });
    await request('test.new-wait');
    await reply;
  }
  if (kind === 'answered') await request('clarify.respond', { request_id: 'first', answer: 'yes' });
  if (kind === 'expired') await request('test.expire');
  if (kind === 'ended') await request('test.complete');
  const result = await request('session.activate', { session_id: 'foreground' });
  writeFileSync(process.env.HERMES_TUI_ACTIVE_SESSION_FILE, JSON.stringify({ session_id: result.session_key }));
  await request('test.barrier');
  if (kind === 'approval' || kind === 'late-approval' || kind === 'mixed') await request('approval.respond', { session_id: 'foreground', choice: 'once' });
  if (kind === 'input' || kind === 'late-input' || kind === 'mixed') await request('clarify.respond', { request_id: 'first', answer: 'yes' });
} else if (activation) {
  writeFileSync(process.env.HERMES_TUI_ACTIVE_SESSION_FILE, JSON.stringify({ session_id: 'other' }));
  const result = await request('session.activate', { session_id: 'foreground' });
  if (process.env.TEST_OUTCOME === 'activate-background-complete') await request('test.complete');
  if (process.env.TEST_OUTCOME !== 'activate-unselected') {
    writeFileSync(process.env.HERMES_TUI_ACTIVE_SESSION_FILE, JSON.stringify({ session_id: result.session_key }));
  }
} else {
await request('test.wait');
if (process.env.TEST_OUTCOME === 'expired') await request('test.expire');
else if (process.env.TEST_OUTCOME === 'input') {
  await request('clarify.respond', { request_id: 'first', answer: 'yes' });
  await request('test.still-waiting');
  await request('clarify.respond', { request_id: 'invalid', answer: 'yes' });
  await request('clarify.respond', { request_id: 'second', answer: 'yes' });
} else await request('approval.respond', { session_id: 'foreground', choice: 'once' });
if (process.env.TEST_OUTCOME === 'switch') {
  writeFileSync(process.env.HERMES_TUI_ACTIVE_SESSION_FILE, JSON.stringify({ session_id: 'other' }));
  await request('session.create', { other: true });
}
}
await request('test.complete');
child.stdin.end();
await new Promise(resolve => child.once('close', resolve));
`

const gatewayScript = String.raw`
import { createInterface } from 'node:readline';
if ((process.env.NODE_OPTIONS ?? '').includes('--import=')) throw new Error('preload leaked to tools');
function event(type, payload = {}, session_id = 'foreground') { process.stdout.write(JSON.stringify({ method: 'event', params: { type, session_id, payload } }) + '\n'); }
let deferred;
createInterface({ input: process.stdin }).on('line', line => {
  const q = JSON.parse(line);
  let result = {};
  if (q.params.defer) { deferred = q; return; }
  if (q.method === 'test.new-wait') {
    event('message.complete', { status: 'complete' });
    event('message.start');
    event(process.env.TEST_OUTCOME.endsWith('approval') ? 'approval.request' : 'clarify.request', { request_id: 'first' });
    process.stdout.write(JSON.stringify({ id: deferred.id, result: { status: 'ok', resolved: 1 } }) + '\n');
  }
  if (q.method === 'session.create') result = { session_id: q.params.other ? 'other' : 'foreground', stored_session_id: q.params.other ? '20260908_123457_d4e5f6' : '20260908_123456_a1b2c3' };
  if (q.method === 'prompt.submit') { result = { status: 'streaming' }; event('message.start'); }
  if (q.method === 'session.activate') {
    const mode = process.env.TEST_OUTCOME;
    result = { session_id: 'foreground', session_key: '20260908_123456_a1b2c3', message_count: 1,
      running: (mode.startsWith('wait-switch-') && mode !== 'wait-switch-ended') || ['activate-running', 'activate-background-complete', 'activate-unselected'].includes(mode),
      status: mode === 'activate-working' ? 'working' : mode === 'activate-waiting' ? 'waiting' : 'idle' };
  }
  if (q.method === 'test.wait') {
    if (process.env.TEST_OUTCOME.startsWith('wait-switch-')) {
      const kind = process.env.TEST_OUTCOME.slice('wait-switch-'.length);
      if (kind === 'expired') event('secret.request', { request_id: 'secret' });
      else if (!kind.includes('approval')) event('clarify.request', { request_id: 'first' });
      if (kind.includes('approval') || kind === 'mixed') event('approval.request');
    } else if (process.env.TEST_OUTCOME === 'expired') event('secret.request', { request_id: 'secret' });
    else if (process.env.TEST_OUTCOME === 'input') { event('clarify.request', { request_id: 'first' }); event('clarify.request', { request_id: 'second' }); }
    else event('approval.request');
    event('message.complete', { status: 'complete' }, 'background');
  }
  if (q.method === 'approval.respond') result = { resolved: 1 };
  if (q.method === 'clarify.respond') result = { status: 'ok' };
  if (q.method === 'test.still-waiting') event('clarify.request', { request_id: 'second' });
  if (q.method === 'test.expire') event('secret.expire', { request_id: 'secret' });
  if (q.method === 'test.complete') {
    const status = (process.env.TEST_OUTCOME.startsWith('activate-') || process.env.TEST_OUTCOME.startsWith('wait-switch-') || ['switch', 'input', 'expired'].includes(process.env.TEST_OUTCOME)) ? 'complete' : process.env.TEST_OUTCOME;
    event('message.complete', { status }); event('message.complete', { status });
  }
  process.stdout.write(JSON.stringify({ id: q.id, result }) + '\n');
});
`
