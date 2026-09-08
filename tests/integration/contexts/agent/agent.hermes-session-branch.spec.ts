import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { AgentLaunchArtifactScope } from '../../../../src/contexts/agent/application/services/AgentLaunchArtifactScope'
import { HermesAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/hermes/HermesAgentProviderContribution'

const run = promisify(execFile)
const parent = '20260908_123456_a1b2c3'
const branch = '20260908_123457_b1b2c3'
const secondBranch = '20260908_123458_c1b2c3'

describe('Hermes foreground branch recovery', () => {
  it.each([
    ['branch', branch],
    ['continue', branch],
    ['late-info', branch],
    ['second-branch', secondBranch],
    ['failed', parent],
    ['failed-with-info', parent],
    ['missing-info', null],
    ['malformed-info', null],
    ['new-after-branch', null],
    ['draft-info', null],
    ['return-parent', parent],
    ['late-branch', secondBranch],
    ['discarded-branch', parent],
    ['discarded-continue', parent],
    ['unrelated-close', parent],
    ['other-session-close', parent],
    ['two-branches-oldest-first', secondBranch],
    ['two-branches-newest-first', secondBranch],
    ['close-rejected', branch],
    ['background-info', branch]
  ] as const)('recovers the selected conversation after %s', async (mode, expected) => {
    const directory = await mkdtemp(join(tmpdir(), 'hermes-branch-test-'))
    const artifacts = new AgentLaunchArtifactScope()
    const reported = vi.fn()
    const provider = new HermesAgentProviderContribution()
    try {
      const plan = await provider.launcher.createLaunchPlan({
        artifacts,
        onProviderSessionIdentified: reported,
        onProviderSessionCleared: () => reported(null),
        workspaceDirectory: directory
      })
      artifacts.seal()
      const gateway = join(directory, 'gateway.mjs')
      await writeFile(
        gateway,
        `
import { createInterface } from 'node:readline';
const mode = ${JSON.stringify(mode)};
let branches = 0;
const branchReplies = [];
const send = packet => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...packet }) + '\\n');
const info = (id, key) => send({ method: 'event', params: { type: 'session.info', session_id: id, payload: { stored_session_id: key } } });
createInterface({ input: process.stdin }).on('line', line => {
  const q = JSON.parse(line);
  if (q.method === 'session.resume') send({ id: q.id, result: { session_id: q.params.session_id === ${JSON.stringify(parent)} ? 'aaaa1234' : 'dddd1234', resumed: q.params.session_id } });
  else if (q.method === 'session.create') {
    info('dddd1234', ${JSON.stringify(secondBranch)});
    send({ id: q.id, result: { session_id: 'dddd1234', stored_session_id: ${JSON.stringify(secondBranch)} } });
  }
  else if (q.method === 'session.branch') {
    if (mode === 'failed') { send({ id: q.id, error: { code: 5008 } }); return; }
    const id = ++branches === 1 ? 'bbbb1234' : 'cccc1234';
    const key = branches === 1 ? ${JSON.stringify(branch)} : ${JSON.stringify(secondBranch)};
    if (mode.startsWith('two-branches-')) {
      branchReplies.push([
        { method: 'event', params: { type: 'session.info', session_id: id, payload: { stored_session_id: key } } },
        { id: q.id, result: { session_id: id, parent: q.params.session_id, title: 'branch' } }
      ]);
      if (branches === 2) {
        if (mode.endsWith('newest-first')) branchReplies.reverse();
        process.stdout.write(branchReplies.flat().map(packet => JSON.stringify({ jsonrpc: '2.0', ...packet }) + '\\n').join(''));
      }
      return;
    }
    if (!['missing-info', 'late-info'].includes(mode)) info(id, mode === 'malformed-info' ? 'latest' : key);
    if (mode === 'failed-with-info') { send({ id: q.id, error: { code: 5008 } }); return; }
    send({ id: q.id, result: { session_id: id, parent: q.params.session_id, title: 'branch' } });
    if (mode === 'late-info') info(id, key);
  } else if (q.method === 'session.close') {
    send({ id: q.id, ...(mode === 'close-rejected' ? { error: { code: 5008 } } : { result: { closed: true } }) });
  } else {
    if (mode === 'background-info') info('aaaa1234', ${JSON.stringify(parent)});
    send({ id: q.id, result: { status: 'streaming' } });
  }
});
`
      )
      const script = join(directory, 'tui.mjs')
      await writeFile(
        script,
        `
import { spawn } from 'node:child_process';
import { writeFileSync, statSync, utimesSync } from 'node:fs';
import { createInterface } from 'node:readline';
const child = spawn(process.execPath, [${JSON.stringify(gateway)}, '-m', 'tui_gateway.entry'], { stdio: ['pipe', 'pipe', 'inherit'] });
const pending = new Map();
let sequence = 0;
createInterface({ input: child.stdout }).on('line', line => {
  const r = JSON.parse(line);
  pending.get(r.id)?.(r.result);
  pending.delete(r.id);
});
const request = (method, session_id) => new Promise(resolve => {
  const id = ++sequence;
  pending.set(id, resolve);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params: { session_id } }) + '\\n');
});
const active = process.env.HERMES_TUI_ACTIVE_SESSION_FILE;
const selectParent = () => writeFileSync(active, JSON.stringify({ session_id: ${JSON.stringify(parent)} }));
const mode = ${JSON.stringify(mode)};
await request('session.resume', ${JSON.stringify(parent)});
selectParent();
let sid = 'aaaa1234';
let slashFlight = 0;
const branchFromCurrent = async () => {
  const flight = ++slashFlight;
  const parentSid = sid;
  const result = await request('session.branch', parentSid);
  // Mirrors createSlashHandler.guarded and the /branch handler: close is sent
  // only when this result still belongs to the current slash command and sid.
  if (result?.session_id && flight === slashFlight && sid === parentSid) {
    void request('session.close', parentSid);
    sid = result.session_id;
  }
  return result;
};
const branching = mode === 'draft-info' ? Promise.resolve() : branchFromCurrent();
const nextBranch = mode.startsWith('two-branches-') ? branchFromCurrent() : undefined;
if (['discarded-branch', 'discarded-continue', 'unrelated-close', 'other-session-close'].includes(mode)) {
  // A local /help increments the command flight but does not write the selection file.
  slashFlight++;
}
if (mode === 'late-branch') {
  writeFileSync(active, JSON.stringify({ session_id: ${JSON.stringify(secondBranch)} }));
  sid = 'dddd1234';
  await request('session.resume', ${JSON.stringify(secondBranch)});
}
const result = await branching;
await nextBranch;
// The real /branch handler changes only the TUI sid; it leaves the selection file alone.
if (mode === 'return-parent') {
  const stamp = Number(statSync(active).mtimeMs) / 1000 + 1;
  selectParent();
  utimesSync(active, stamp, stamp);
}
if (mode === 'second-branch') await branchFromCurrent();
if (['continue', 'background-info'].includes(mode)) await request('prompt.submit', result.session_id);
if (mode === 'discarded-continue') await request('prompt.submit', sid);
if (mode === 'other-session-close') await request('session.close', 'dddd1234');
if (mode === 'unrelated-close') {
  // A later close must not be mistaken for acceptance of a discarded result.
  await new Promise(resolve => setImmediate(resolve));
  await request('session.close', sid);
}
if (['new-after-branch', 'draft-info'].includes(mode)) {
  const draft = await request('session.create');
  writeFileSync(active, JSON.stringify({ session_id: draft.session_id }));
}
child.stdin.end();
`
      )
      await run(process.execPath, [script], {
        env: {
          ...process.env,
          ...plan.env,
          HERMES_TUI_ACTIVE_SESSION_FILE: join(directory, 'active.json')
        },
        timeout: 10000
      })
      await artifacts.dispose()
      expect(reported).toHaveBeenLastCalledWith(
        expected === null ? null : { formatVersion: 1, kind: 'hermes-session', value: expected }
      )
      if (expected !== null) {
        expect(provider.resume?.createResumeArgs(reported.mock.lastCall![0])).toEqual([
          '--resume',
          expected,
          '--no-restore-cwd'
        ])
      }
    } finally {
      await artifacts.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
