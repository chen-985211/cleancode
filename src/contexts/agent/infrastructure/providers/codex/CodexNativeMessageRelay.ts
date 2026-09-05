/** Runs inside the existing PTY, so the TUI, server and queue inherit the same shell environment. */
export const codexNativeMessageRelay = String.raw`
import { spawn, execFile } from 'node:child_process';
import { readFile, writeFile, rename, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { dirname, join } from 'node:path';
import { createConnection } from 'node:net';

const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
const directory = dirname(process.argv[2]);
const socketPath = join(directory, 's');
const endpoint = 'unix://' + socketPath;
const requestPath = join(directory, 'request');
const responsePath = join(directory, 'response');
let closing = false;
let tui;
let queued;
let lastRequest;
const children = new Set();
const exits = new Map();
const spawnOwned = (args, stdio) => {
  const child = spawn(config.executable, args, { cwd: config.cwd, env: process.env, stdio });
  children.add(child);
  exits.set(child, new Promise(resolve => {
    child.once('error', () => resolve(1));
    child.once('exit', code => { children.delete(child); resolve(code ?? 1); });
  }));
  return child;
};
const answer = async value => {
  const temporary = responsePath + '.tmp';
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
  await rename(temporary, responsePath);
};
const shutdown = async () => {
  if (closing) return;
  closing = true;
  watcher.close();
  queued?.kill('SIGKILL');
  for (const child of children) child.kill('SIGTERM');
  const force = setTimeout(() => { for (const child of children) child.kill('SIGKILL'); }, 1000);
  await Promise.all([...exits.values()]);
  clearTimeout(force);
  await writeFile(join(directory, 'closed'), '', { mode: 0o600 }).catch(() => {});
};
const receive = async () => {
  let request;
  try { request = JSON.parse(await readFile(requestPath, 'utf8')); } catch { return; }
  if (request.kind === 'close') { await shutdown(); return; }
  if (request.kind === 'cancel') { queued?.kill('SIGKILL'); return; }
  if (closing || queued || request.id === lastRequest || request.kind !== 'notify') return;
  if (typeof request.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(request.threadId)) return;
  lastRequest = request.id;
  const result = await new Promise(resolve => {
    queued = execFile(config.executable, ['queue', '--remote', endpoint, '--thread', request.threadId, '--message', config.reminder],
      { cwd: config.cwd, env: process.env, timeout: 10000, killSignal: 'SIGKILL', maxBuffer: 65536 },
      error => resolve({ id: request.id, ok: !error }));
  });
  queued = undefined;
  if (!closing) await answer(result).catch(() => {});
};
const watcher = watch(directory, (_event, filename) => {
  if (filename === 'request') void receive();
  // An owner removing its artifacts also revokes this launch.
  if (filename === 'config.json') void stat(process.argv[2]).catch(() => shutdown());
});
watcher.on('error', () => void shutdown());
for (const signal of ['SIGTERM', 'SIGHUP', 'SIGINT']) process.on(signal, () => void shutdown());
await writeFile(join(directory, 'started'), '', { mode: 0o600 });
const server = spawnOwned(['app-server', '--listen', endpoint, ...config.serverArgs], ['ignore', 'ignore', 'ignore']);
const serverExit = exits.get(server).then(async () => { if (!closing) await shutdown(); });
const connected = async () => new Promise(resolve => {
  const socket = createConnection(socketPath);
  socket.setTimeout(100);
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => { socket.destroy(); resolve(false); });
  socket.once('timeout', () => { socket.destroy(); resolve(false); });
});
const deadline = Date.now() + 10000;
while (!closing && !(await connected())) {
  if (Date.now() >= deadline) { process.stderr.write('CleanCode: native Codex server did not start.\n'); await shutdown(); break; }
  await new Promise(resolve => setTimeout(resolve, 50));
}
if (!closing) {
  tui = spawnOwned([...config.tuiArgs, '--remote', endpoint, ...(config.initialPrompt ? ['--', config.initialPrompt] : [])], 'inherit');
  await receive();
  const code = await exits.get(tui);
  await shutdown();
  process.exitCode = code;
} else process.exitCode = 1;
await serverExit;
`
