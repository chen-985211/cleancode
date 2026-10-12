import { codexWindowsInvocation } from './CodexWindowsInvocation'
import { codexNativeMessageFiles } from './CodexNativeMessageFiles'

/** Runs inside the existing PTY; probes, TUI, server and queue share its real environment. */
export const codexNativeMessageRelay = String.raw`
${codexWindowsInvocation}
import { spawn, execFile } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { readFile, writeFile, rename, stat, unlink } from 'node:fs/promises';
import { watch, writeFileSync, unlinkSync, fstatSync, openSync, closeSync } from 'node:fs';
import { isatty } from 'node:tty';
import { dirname, join } from 'node:path';

const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
const windowsCommand = process.platform === 'win32'
  ? resolveCodexWindowsInvocation(config.executable, config.cwd, process.env) : null;
const directory = dirname(process.argv[2]);
const socketPath = join(directory, ...config.socketPathSegments);
const endpoint = 'unix://' + socketPath;
let invocationId = 0;
const requestPath = join(directory, 'request');
const responsePath = join(directory, 'response');
let closing = false;
let nativeReady = false;
let shutdownPromise;
let queued;
let lastRequest;
const accepted = new Set();
const children = new Set();
const groups = new Set();
const exits = new Map();
const encode = value => Buffer.from(value, 'utf8').toString('base64');
// Keep npm shim discovery in the PTY's environment; data never becomes shell syntax.
const invocation = args => {
  if (windowsCommand) return { executable: windowsCommand.executable, args: [...windowsCommand.prefix, ...args] };
  if (process.platform !== 'win32' || /\.(exe|com)$/i.test(config.executable))
    return { executable: config.executable, args };
  const decode = value => "[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + encode(value) + "'))";
  // Keep the PowerShell command short even when the native argv contains long instructions.
  const argsPath = join(directory, 'argv-' + (++invocationId) + '.json');
  writeFileSync(argsPath, JSON.stringify({executable:config.executable,args}), {mode:0o600});
  const script = '$ErrorActionPreference="Stop"\n$spec=Get-Content -LiteralPath (' + decode(argsPath) +
    ') -Raw -Encoding UTF8 | ConvertFrom-Json\n$cli=(Get-Command -Name $spec.executable -ErrorAction Stop | Select-Object -First 1).Path\n' +
    // Preserve the foreground launcher’s PowerShell companion selection for npm/custom shims.
    'if ([IO.Path]::GetExtension($cli) -eq ".cmd") {\n' +
    '  $companion=[IO.Path]::ChangeExtension($cli,".ps1")\n' +
    '  if (Test-Path -LiteralPath $companion -PathType Leaf) { $cli=$companion }\n}\n' +
    '$argv=@($spec.args)\n& $cli @argv\nexit $LASTEXITCODE';
  return { executable: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], argsPath };
};
const stopChild = (child, force = false) => {
  if (!child?.pid || !children.has(child)) return;
  if (process.platform === 'win32') {
    execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
  } else if (groups.has(child)) {
    try { process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM'); } catch { /* Group already exited. */ }
  } else child.kill(force ? 'SIGKILL' : 'SIGTERM');
};
const spawnOwned = (args, stdio) => {
  const command = invocation(args);
  // Background npm shims and their native children share a private process group.
  // The interactive TUI retains the original terminal/session semantics.
  const detached = process.platform !== 'win32' && stdio !== 'inherit';
  // Electron's RouteStdioToConsole reconnects stdout/stderr but can leave stdin at NUL.
  // Reopen only that interactive console case; redirected pipes/files keep their original input.
  const consoleInput = stdio === 'inherit' && process.platform === 'win32' &&
    process.versions.electron && isatty(1) && !isatty(0) && fstatSync(0).isCharacterDevice()
    // The device namespace also prevents Electron's fs wrapper from resolving it under cwd.
    ? openSync('\\\\.\\CONIN$', 'r+') : null;
  let child;
  try {
    child = spawn(command.executable, command.args, { cwd: config.cwd, env: process.env,
      stdio: consoleInput === null ? stdio : [consoleInput, 1, 2], windowsHide: stdio !== 'inherit', detached });
  } finally {
    // spawn duplicates the inherited handle; the relay must not keep an extra console reader.
    if (consoleInput !== null) closeSync(consoleInput);
  }
  if (detached) groups.add(child);
  children.add(child);
  if (command.argsPath) child.once('close', () => { try { unlinkSync(command.argsPath); } catch {} });
  exits.set(child, new Promise(resolve => {
    child.once('error', () => { children.delete(child); resolve(1); });
    child.once('close', code => { if (groups.has(child)) stopChild(child, true); groups.delete(child); children.delete(child); resolve(code ?? 1); });
  }));
  return child;
};
const capture = async args => {
  if (closing) return '';
  const child = spawnOwned(args, ['ignore', 'pipe', 'pipe']);
  let output = '';
  const collect = chunk => { if (output.length < 65536) output += chunk.toString(); else stopChild(child, true); };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  const timeout = setTimeout(() => stopChild(child, true), 10000);
  const code = await exits.get(child);
  clearTimeout(timeout);
  exits.delete(child);
  return code === 0 ? output : '';
};
${codexNativeMessageFiles}
const shutdown = () => {
  if (shutdownPromise) return shutdownPromise;
  closing = true;
  nativeReady = false;
  shutdownPromise = (async () => {
    watcher.close();
    for (const child of children) stopChild(child);
    const force = setTimeout(() => { for (const child of children) stopChild(child, true); }, 1000);
    await Promise.all([...exits.values()]);
    clearTimeout(force);
    await writeFile(join(directory, 'closed'), '', { mode: 0o600 }).catch(() => {});
  })();
  return shutdownPromise;
};
const remoteArgs = () => ['--remote', endpoint];
const receive = async () => {
  let request;
  try { request = JSON.parse(await readFile(requestPath, 'utf8')); } catch { return; }
  if (request.kind === 'close') { await shutdown(); return; }
  if (request.kind === 'cancel') { if (request.id === lastRequest) stopChild(queued, true); return; }
  if (closing || !nativeReady || queued || request.kind !== 'notify') return;
  if (typeof request.id !== 'string' || typeof request.notificationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(request.threadId)) return;
  const messageKey = request.threadId + ':' + request.notificationId;
  if (accepted.has(messageKey)) {
    // A persistent filesystem error fails this attempt by timeout; it must not kill the TUI.
    await publish(responsePath, {id:request.id,ok:true}).catch(() => {});
    return;
  }
  lastRequest = request.id;
  queued = spawnOwned(['queue', ...remoteArgs(), '--thread', request.threadId, '--message', config.reminder], ['ignore', 'ignore', 'ignore']);
  const child = queued;
  const timeout = setTimeout(() => stopChild(child, true), 10000);
  const code = await exits.get(child);
  clearTimeout(timeout);
  exits.delete(child);
  queued = undefined;
  if (code === 0) { accepted.add(messageKey); if (accepted.size > 4096) accepted.delete(accepted.values().next().value); }
  if (!closing) await publish(responsePath, { id: request.id, ok: code === 0 }).catch(() => {});
};
const watcher = watch(directory, (_event, filename) => {
  if (filename === 'request') void receive();
  if (filename === 'config.json') void stat(process.argv[2]).catch(() => shutdown());
});
watcher.on('error', () => void shutdown());
for (const signal of ['SIGTERM', 'SIGHUP', 'SIGINT']) process.on(signal, () => void shutdown());
await writeFile(join(directory, 'started'), '', { mode: 0o600 });
const [queueHelp, serverHelp, tuiHelp, proxyHelp] = await Promise.all([
  capture(['queue', '--help']), capture(['app-server', '--help']), capture(['--help']), capture(['app-server', 'proxy', '--help'])
]);
const has = (text, words) => words.every(word => text.includes(word));
const supported = has(queueHelp, ['--thread', '--message', '--remote']) &&
  has(serverHelp, ['--listen']) && has(tuiHelp, ['--remote']) &&
  has(serverHelp, ['unix://']) && has(proxyHelp, ['--sock']);
let serverExit;
let serverExited = false;
let remoteTuiStarted = false;
let serverErrors = '';
const reportServerStartupFailure = () => {
  for (const name of ['CLEANCODE_MCP_TOKEN', 'CLEANCODE_CODEX_NOTIFY_TOKEN']) {
    const value = process.env[name];
    if (value) serverErrors = serverErrors.replaceAll(value, '<redacted>');
  }
  if (!closing) process.stderr.write(serverErrors || 'CleanCode: native Codex server did not start.\n');
};
if (supported && !closing) {
  const server = spawnOwned(['app-server', '--listen', endpoint, ...config.serverArgs], ['ignore', 'ignore', 'pipe']);
  server.stderr.on('data', chunk => {
    serverErrors += chunk.toString().slice(0, Math.max(0, 65536 - serverErrors.length));
  });
  serverExit = exits.get(server).then(async () => {
    serverExited = true;
    if (remoteTuiStarted && !closing) await shutdown();
  });
  // The official proxy owns AF_UNIX on Windows. Node's path sockets are named
  // pipes there; checking a socket file or opening a Node socket is not readiness.
  const connected = async () => {
    if (closing || serverExited) return false;
    const proxy = spawnOwned(['app-server', 'proxy', '--sock', socketPath], ['pipe', 'pipe', 'ignore']);
    const accepted = await new Promise(resolve => {
      let output = '';
      const key = randomBytes(16).toString('base64');
      const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
      let settled = false;
      const finish = value => { if (settled) return; settled = true; clearTimeout(timeout); resolve(value); };
      const timeout = setTimeout(() => finish(false), 1500);
      proxy.stdout.on('data', chunk => {
        output += chunk.toString();
        if (output.length > 65536) { finish(false); return; }
        if (!output.includes('\r\n\r\n')) return;
        const lines = output.split('\r\n');
        finish(/^HTTP\/1\.[01] 101(?: |$)/.test(lines[0]) && lines.some(line => { const colon = line.indexOf(':'); return line.slice(0,colon).toLowerCase() === 'sec-websocket-accept' && line.slice(colon+1).trim() === accept; }));
      });
      proxy.once('error', () => finish(false));
      proxy.once('close', () => finish(false));
      void exits.get(server).then(() => finish(false));
      proxy.stdin.on('error', () => finish(false));
      // proxy forwards bytes; the control socket itself speaks WebSocket, not JSONL.
      proxy.stdin.write('GET / HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ' + key + '\r\n\r\n');
    });
    stopChild(proxy, true);
    await exits.get(proxy);
    exits.delete(proxy);
    return accepted;
  };
  const deadline = Date.now() + 10000;
  while (!closing && !serverExited) {
    if (await connected()) { nativeReady = !closing && !serverExited; break; }
    if (Date.now() >= deadline) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  if (!nativeReady && !closing) {
    // The optional server may fail independently of the user's interactive CLI.
    // Reap it before launching the ordinary TUI; explicit shutdown never falls back.
    stopChild(server);
    const force = setTimeout(() => stopChild(server, true), 1000);
    await exits.get(server);
    clearTimeout(force);
    exits.delete(server);
    reportServerStartupFailure();
  }
}
if (!closing) {
  await publish(join(directory, 'capability'), { supported: nativeReady });
  // Publishing readiness is asynchronous; the server can exit or shutdown can win meanwhile.
  if (serverExited && nativeReady) {
    nativeReady = false;
    await publish(join(directory, 'capability'), { supported: false });
    reportServerStartupFailure();
  }
  if (!closing) {
    remoteTuiStarted = nativeReady;
    const tui = spawnOwned([...config.tuiArgs, ...(nativeReady ? remoteArgs() : []), ...(config.initialPrompt ? ['--', config.initialPrompt] : [])], 'inherit');
    if (nativeReady) await receive();
    process.exitCode = await exits.get(tui);
    await shutdown();
  }
}
await serverExit;
await shutdownPromise;
`
