import { join, posix } from 'node:path'
import { pathToFileURL } from 'node:url'

export interface TerminalAgentTelemetryScriptPaths {
  readonly assetDirectory: string
  readonly hookRelayLauncherPath: string
  readonly hookRelayPath: string
  readonly openCodePluginPath: string
  readonly runtimeExecutable: string
}

export function createTerminalAgentLaunchSpecs(paths: TerminalAgentTelemetryScriptPaths) {
  const relay = [paths.hookRelayLauncherPath]
  const claudeSettingsPath = join(paths.assetDirectory, 'claude-settings.json')
  const geminiSettingsPath = join(paths.assetDirectory, 'gemini-settings.json')
  return {
    providers: {
      'claude-code': {
        appendArgs: ['--settings', claudeSettingsPath],
        commandName: 'claude',
        statusTracking: 'full'
      },
      codex: {
        appendArgs: ['--config', `notify=${serializeTomlArray([...relay, 'codex'])}`],
        commandName: 'codex',
        statusTracking: 'completion_only',
        windowsConsoleThemeProbe: true
      },
      gemini: {
        commandName: 'gemini',
        mergeJsonFileEnvironment: {
          basePath: geminiSettingsPath,
          variable: 'GEMINI_CLI_SYSTEM_SETTINGS_PATH'
        },
        statusTracking: 'full'
      },
      opencode: {
        commandName: 'opencode',
        mergeJsonEnvironment: {
          append: { plugin: [pathToFileURL(paths.openCodePluginPath).href] },
          variable: 'OPENCODE_CONFIG_CONTENT'
        },
        statusTracking: 'full'
      }
    }
  }
}

export function createClaudeSettings(hookRelayLauncherPath: string) {
  const handler = createHookHandler(hookRelayLauncherPath, 'claude-code')
  return {
    hooks: {
      Notification: [handler],
      PermissionRequest: [handler],
      PreToolUse: [handler],
      SessionEnd: [handler],
      SessionStart: [handler],
      Stop: [handler],
      UserPromptSubmit: [handler]
    }
  }
}

export function createGeminiSettings(hookRelayLauncherPath: string) {
  const handler = createHookHandler(hookRelayLauncherPath, 'gemini')
  return {
    hooks: {
      AfterAgent: [handler],
      BeforeAgent: [handler],
      SessionEnd: [handler],
      SessionStart: [handler]
    }
  }
}

export function createPosixShim(input: {
  readonly commandName: string
  readonly providerId: string
  readonly runtimeExecutable: string
  readonly shimLauncherPath: string
}): string {
  return [
    '#!/bin/sh',
    `exec env ELECTRON_RUN_AS_NODE=1 ${quotePosix(input.runtimeExecutable)} ${quotePosix(input.shimLauncherPath)} ${quotePosix(input.providerId)} ${quotePosix(input.commandName)} "$@"`,
    ''
  ].join('\n')
}

export function createPosixHookRelayLauncher(
  runtimeExecutable: string,
  hookRelayPath: string
): string {
  return [
    '#!/bin/sh',
    `exec env ELECTRON_RUN_AS_NODE=1 ${quotePosix(runtimeExecutable)} ${quotePosix(hookRelayPath)} "$@"`,
    ''
  ].join('\n')
}

/**
 * Starts the user's real interactive shell through private startup files. The private files source
 * the user's normal rc first and only then restore the shim directory to the front of PATH.
 */
export const terminalAgentPosixShellLauncherScript = [
  '#!/bin/sh',
  'real_shell=${CLEANCODE_AGENT_ACTIVITY_REAL_SHELL:-${SHELL:-/bin/sh}}',
  'shell_name=${real_shell##*/}',
  'case "$shell_name" in',
  '  bash)',
  '    exec "$real_shell" --noprofile --rcfile "$CLEANCODE_AGENT_ACTIVITY_BASH_RC" -i "$@"',
  '    ;;',
  '  zsh)',
  '    export ZDOTDIR="$CLEANCODE_AGENT_ACTIVITY_ZSH_DOT_DIRECTORY"',
  '    exec "$real_shell" -i "$@"',
  '    ;;',
  '  *)',
  '    exec "$real_shell" "$@"',
  '    ;;',
  'esac',
  ''
].join('\n')

export const terminalAgentBashRcScript = [
  '_cleancode_user_bash_rc=${HOME:+$HOME/.bashrc}',
  'if [ -n "$_cleancode_user_bash_rc" ] && [ -r "$_cleancode_user_bash_rc" ] && [ "$_cleancode_user_bash_rc" != "$CLEANCODE_AGENT_ACTIVITY_BASH_RC" ]; then',
  '  . "$_cleancode_user_bash_rc"',
  'fi',
  'if [ -n "$CLEANCODE_AGENT_ACTIVITY_SHIM_DIRECTORY" ] && [ "${PATH%%:*}" != "$CLEANCODE_AGENT_ACTIVITY_SHIM_DIRECTORY" ]; then',
  '  export PATH="$CLEANCODE_AGENT_ACTIVITY_SHIM_DIRECTORY${PATH:+:$PATH}"',
  'fi',
  'unset _cleancode_user_bash_rc',
  ''
].join('\n')

export const terminalAgentZshEnvScript = [
  '_cleancode_wrapper_zdotdir=$CLEANCODE_AGENT_ACTIVITY_ZSH_DOT_DIRECTORY',
  '_cleancode_user_zdotdir=${CLEANCODE_AGENT_ACTIVITY_ORIGINAL_ZDOTDIR:-${HOME:-}}',
  'if [ -n "$_cleancode_user_zdotdir" ] && [ "$_cleancode_user_zdotdir" != "$_cleancode_wrapper_zdotdir" ] && [ -r "$_cleancode_user_zdotdir/.zshenv" ]; then',
  '  export ZDOTDIR="$_cleancode_user_zdotdir"',
  '  . "$_cleancode_user_zdotdir/.zshenv"',
  '  _cleancode_user_zdotdir=${ZDOTDIR:-${HOME:-}}',
  'fi',
  'if [ -n "$CLEANCODE_AGENT_ACTIVITY_SHIM_DIRECTORY" ] && [ "${PATH%%:*}" != "$CLEANCODE_AGENT_ACTIVITY_SHIM_DIRECTORY" ]; then',
  '  export PATH="$CLEANCODE_AGENT_ACTIVITY_SHIM_DIRECTORY${PATH:+:$PATH}"',
  'fi',
  'export CLEANCODE_AGENT_ACTIVITY_USER_ZDOTDIR="$_cleancode_user_zdotdir"',
  'export ZDOTDIR="$_cleancode_wrapper_zdotdir"',
  'unset _cleancode_user_zdotdir _cleancode_wrapper_zdotdir',
  ''
].join('\n')

export const terminalAgentZshProfileScript = createZshStartupRelay('.zprofile', true, false)
export const terminalAgentZshRcScript = createZshStartupRelay('.zshrc', true, true)
export const terminalAgentZshLoginScript = createZshStartupRelay('.zlogin', true, false)

function createZshStartupRelay(
  startupFile: string,
  prependShimPath: boolean,
  restoreOnlyForNonLogin: boolean
): string {
  const userStartupPath = posix.join('$_cleancode_user_zdotdir', startupFile)
  const pathBootstrap = prependShimPath
    ? [
        'if [ -n "$CLEANCODE_AGENT_ACTIVITY_SHIM_DIRECTORY" ] && [ "${PATH%%:*}" != "$CLEANCODE_AGENT_ACTIVITY_SHIM_DIRECTORY" ]; then',
        '  export PATH="$CLEANCODE_AGENT_ACTIVITY_SHIM_DIRECTORY${PATH:+:$PATH}"',
        'fi'
      ]
    : []
  const restore = restoreOnlyForNonLogin
    ? [
        'if [[ ! -o login ]]; then',
        '  export ZDOTDIR="$_cleancode_user_zdotdir"',
        'else',
        '  export ZDOTDIR="$_cleancode_wrapper_zdotdir"',
        'fi'
      ]
    : startupFile === '.zlogin'
      ? ['export ZDOTDIR="$_cleancode_user_zdotdir"']
      : ['export ZDOTDIR="$_cleancode_wrapper_zdotdir"']
  return [
    '_cleancode_wrapper_zdotdir=$CLEANCODE_AGENT_ACTIVITY_ZSH_DOT_DIRECTORY',
    '_cleancode_user_zdotdir=${CLEANCODE_AGENT_ACTIVITY_USER_ZDOTDIR:-${CLEANCODE_AGENT_ACTIVITY_ORIGINAL_ZDOTDIR:-${HOME:-}}}',
    `if [ -n "$_cleancode_user_zdotdir" ] && [ "$_cleancode_user_zdotdir" != "$_cleancode_wrapper_zdotdir" ] && [ -r "${userStartupPath}" ]; then`,
    '  export ZDOTDIR="$_cleancode_user_zdotdir"',
    `  . "${userStartupPath}"`,
    '  _cleancode_user_zdotdir=${ZDOTDIR:-$_cleancode_user_zdotdir}',
    'fi',
    'export CLEANCODE_AGENT_ACTIVITY_USER_ZDOTDIR="$_cleancode_user_zdotdir"',
    ...pathBootstrap,
    ...restore,
    'unset _cleancode_user_zdotdir _cleancode_wrapper_zdotdir',
    ''
  ].join('\n')
}

function createHookHandler(hookRelayLauncherPath: string, providerId: string) {
  return {
    hooks: [
      {
        command: `${quoteCommand(hookRelayLauncherPath)} ${quoteCommand(providerId)}`,
        name: 'cleancode-agent-activity-reporter',
        timeout: 5_000,
        type: 'command'
      }
    ]
  }
}

function serializeTomlArray(values: readonly string[]): string {
  return `[${values.map((value) => JSON.stringify(value)).join(',')}]`
}

function quoteCommand(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`
}

function quotePosix(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}

export const terminalAgentShimLauncherScript = String.raw`
import { randomUUID } from 'node:crypto';
import { accessSync, constants, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const assetDirectory = dirname(fileURLToPath(import.meta.url));
const specs = JSON.parse(readFileSync(join(assetDirectory, 'launch-specs.json'), 'utf8'));
const shimDirectory = join(assetDirectory, 'bin');
const [operation, ...input] = process.argv.slice(2);
if (operation === '--prepare-windows') await prepareWindowsLaunch(input);
else if (operation === '--complete-windows') await completeWindowsLaunch(input);
else await runProvider([operation, ...input]);

async function prepareWindowsLaunch([planPath]) {
  const request = JSON.parse(readFileSync(planPath, 'utf8'));
  const providerId = String(request.providerId || '');
  const commandName = String(request.commandName || '');
  const originalArgs = Array.isArray(request.arguments) ? request.arguments.map(String) : [];
  const launch = createLaunch(providerId, commandName, originalArgs);
  if (!launch) {
    process.exitCode = 127;
    return;
  }
  const initialStatus = launch.spec.statusTracking === 'full' ? 'idle' : 'unavailable';
  await reportAgentActivity(providerId, launch.environment, { status: initialStatus, type: 'status_changed' }, 250);
  writeFileSync(planPath, JSON.stringify({
    arguments: launch.args,
    environment: providerEnvironment(launch.spec, launch.environment),
    executable: launch.executable,
    invocationId: launch.environment.CLEANCODE_AGENT_ACTIVITY_INVOCATION_ID,
    providerId,
    temporaryDirectory: launch.temporaryDirectory,
    ...(launch.spec.windowsConsoleThemeProbe === true ? { windowsConsoleThemeProbe: true } : {})
  }), { mode: 0o600 });
}

async function completeWindowsLaunch([planPath]) {
  const { invocationId, providerId, temporaryDirectory } = JSON.parse(readFileSync(planPath, 'utf8'));
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  environment.CLEANCODE_AGENT_ACTIVITY_PROVIDER_ID = providerId;
  environment.CLEANCODE_AGENT_ACTIVITY_INVOCATION_ID = invocationId;
  await reportAgentActivity(providerId, environment, { type: 'invocation_exited' }, 500);
  if (temporaryDirectory) rmSync(temporaryDirectory, { force: true, recursive: true });
}

async function runProvider([providerId, commandName, ...originalArgs]) {
  const launch = createLaunch(providerId, commandName, originalArgs);
  if (!launch) {
    process.exitCode = 127;
    return;
  }
  const signalForwarder = createSignalForwarder();
  let result = { error: null, signal: null, status: null };
  try {
    const initialStatus = launch.spec.statusTracking === 'full' ? 'idle' : 'unavailable';
    await reportAgentActivity(providerId, launch.environment, { status: initialStatus, type: 'status_changed' }, 250);
    const pendingSignal = signalForwarder.readSignal();
    result = pendingSignal
      ? { error: null, signal: pendingSignal, status: null }
      : await spawnProvider(launch.executable, launch.args, launch.environment, signalForwarder);
  } catch (error) {
    result = { error, signal: null, status: null };
  } finally {
    await reportAgentActivity(providerId, launch.environment, { type: 'invocation_exited' }, 500);
    signalForwarder.dispose();
    if (launch.temporaryDirectory) rmSync(launch.temporaryDirectory, { force: true, recursive: true });
  }
  if (result.error) {
    process.stderr.write(String(result.error.message || result.error) + '\n');
    process.exitCode = 126;
    return;
  }
  process.exitCode = result.status ?? signalExitCode(result.signal);
}

function createLaunch(providerId, commandName, originalArgs) {
  const spec = specs.providers?.[providerId];
  const executable = spec && findExecutable(commandName, shimDirectory);
  if (!spec || !executable) return null;
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  environment.CLEANCODE_AGENT_ACTIVITY_PROVIDER_ID = providerId;
  environment.CLEANCODE_AGENT_ACTIVITY_INVOCATION_ID = randomUUID();
  let args = [...originalArgs];
  let temporaryDirectory = null;
  try {
    if (Array.isArray(spec.appendArgs)) args.push(...spec.appendArgs);
    if (spec.mergeJsonEnvironment) {
      const variable = spec.mergeJsonEnvironment.variable;
      const inherited = parseObject(environment[variable]);
      environment[variable] = JSON.stringify(mergeConfig(inherited, spec.mergeJsonEnvironment.append));
    }
    if (spec.mergeJsonFileEnvironment) {
      const { basePath, variable } = spec.mergeJsonFileEnvironment;
      const base = parseObject(readFileSync(basePath, 'utf8'));
      const inheritedPath = environment[variable];
      if (inheritedPath && resolve(inheritedPath) !== resolve(basePath)) {
        const inherited = parseObject(readFileSync(inheritedPath, 'utf8'));
        temporaryDirectory = mkdtempSync(join(tmpdir(), 'cleancode-gemini-hooks-'));
        const mergedPath = join(temporaryDirectory, 'settings.json');
        writeFileSync(mergedPath, JSON.stringify(mergeConfig(inherited, base)), { mode: 0o600 });
        environment[variable] = mergedPath;
      } else {
        environment[variable] = basePath;
      }
    }
  } catch {
    args = [...originalArgs];
  }
  return { args, environment, executable, spec, temporaryDirectory };
}

function providerEnvironment(spec, environment) {
  const names = [
    'CLEANCODE_AGENT_ACTIVITY_PROVIDER_ID',
    'CLEANCODE_AGENT_ACTIVITY_INVOCATION_ID',
    spec.mergeJsonEnvironment?.variable,
    spec.mergeJsonFileEnvironment?.variable
  ].filter(Boolean);
  return Object.fromEntries(names.map((name) => [name, environment[name]]));
}

async function reportAgentActivity(provider, environment, signal, timeoutMs) {
  const timeout = new AbortController();
  const timeoutId = setTimeout(() => timeout.abort(), timeoutMs);
  try {
    const terminal = JSON.parse(Buffer.from(environment.CLEANCODE_AGENT_ACTIVITY_SCOPE || '', 'base64url').toString('utf8'));
    const invocationId = environment.CLEANCODE_AGENT_ACTIVITY_INVOCATION_ID;
    const token = environment.CLEANCODE_AGENT_ACTIVITY_TOKEN;
    const manifestPath = environment.CLEANCODE_AGENT_ACTIVITY_MANIFEST;
    if (!invocationId || !token || !manifestPath) return;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    await fetch(manifest.url, {
      body: JSON.stringify({ identity: { invocationId, providerId: provider, terminal }, signal }),
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      method: 'POST',
      signal: timeout.signal
    }).catch(() => {});
  } catch {}
  finally { clearTimeout(timeoutId); }
}

function spawnProvider(executable, args, environment, signalForwarder) {
  const child = spawn(executable, args, { env: environment, stdio: 'inherit' });
  return new Promise((resolve) => {
    let error = null;
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      signalForwarder.detach(child);
      resolve(result);
    };
    signalForwarder.attach(child, () => {
      child.unref();
      settle({ error, signal: signalForwarder.readSignal() || 'SIGTERM', status: null });
    });
    child.once('error', (spawnError) => {
      error = spawnError;
    });
    child.once('close', (status, signal) => settle({ error, signal, status }));
  });
}

function createSignalForwarder() {
  let child = null;
  let forcedExit = null;
  let forcedExitTimer = null;
  let gracefulExitTimer = null;
  let receivedSignal = null;
  const handlers = new Map();
  const gracefulSignalTimeoutMs = 750;
  const forcedExitTimeoutMs = 500;
  const signals = process.platform === 'win32'
    ? ['SIGINT', 'SIGTERM']
    : ['SIGHUP', 'SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    const handler = () => {
      receivedSignal ??= signal;
      forwardSignal(signal);
    };
    handlers.set(signal, handler);
    process.on(signal, handler);
  }
  function isChildRunning() {
    return child && child.exitCode === null && child.signalCode === null;
  }
  function forwardSignal(signal) {
    if (!isChildRunning()) return;
    try { child.kill(signal); } catch {}
    if (gracefulExitTimer || forcedExitTimer) return;
    gracefulExitTimer = setTimeout(() => {
      gracefulExitTimer = null;
      if (!isChildRunning()) return;
      forceTerminateChild(child);
      forcedExitTimer = setTimeout(() => {
        forcedExitTimer = null;
        if (!child) return;
        forceTerminateChildDirectly(child);
        forcedExit?.();
      }, forcedExitTimeoutMs);
    }, gracefulSignalTimeoutMs);
  }
  function clearEscalation() {
    if (gracefulExitTimer) clearTimeout(gracefulExitTimer);
    if (forcedExitTimer) clearTimeout(forcedExitTimer);
    gracefulExitTimer = null;
    forcedExitTimer = null;
    forcedExit = null;
  }
  return {
    attach(nextChild, onForcedExit) {
      child = nextChild;
      forcedExit = onForcedExit;
      if (receivedSignal) {
        forwardSignal(receivedSignal);
      }
    },
    detach(expectedChild) {
      if (child !== expectedChild) return;
      clearEscalation();
      child = null;
    },
    dispose() {
      for (const [signal, handler] of handlers) process.off(signal, handler);
      clearEscalation();
      child = null;
    },
    readSignal() { return receivedSignal; }
  };
}

function forceTerminateChild(child) {
  if (process.platform !== 'win32') {
    forceTerminateChildDirectly(child);
    return;
  }
  const fallback = () => forceTerminateChildDirectly(child);
  if (!child.pid) {
    fallback();
    return;
  }
  try {
    const taskkill = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true
    });
    taskkill.once('error', fallback);
    taskkill.once('exit', (status) => {
      if (status !== 0) fallback();
    });
    taskkill.unref();
  } catch {
    fallback();
  }
}

function forceTerminateChildDirectly(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try { child.kill('SIGKILL'); } catch {}
}

function signalExitCode(signal) {
  if (signal === 'SIGHUP') return 129;
  if (signal === 'SIGINT') return 130;
  if (signal === 'SIGTERM') return 143;
  return signal ? 128 : 0;
}

function findExecutable(name, ownShimDirectory) {
  const pathEntries = String(process.env.PATH || '').split(delimiter).filter(Boolean);
  const extensions = process.platform === 'win32'
    ? ['.PS1', ...String(process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')]
    : [''];
  for (const directory of pathEntries) {
    if (canonicalPath(directory) === canonicalPath(ownShimDirectory)) continue;
    for (const extension of extensions) {
      const candidate = join(directory, process.platform === 'win32' ? name + extension.toLowerCase() : name);
      try {
        accessSync(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
        return candidate;
      } catch {}
    }
  }
  return null;
}

function canonicalPath(value) {
  try { return realpathSync(value); }
  catch { return resolve(value); }
}

function parseObject(value) {
  if (!value) return {};
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected object');
  return parsed;
}

function mergeConfig(inherited, appended) {
  const merged = { ...inherited, ...appended };
  for (const [key, value] of Object.entries(appended || {})) {
    if (Array.isArray(value)) merged[key] = [...(Array.isArray(inherited[key]) ? inherited[key] : []), ...value];
    else if (value && typeof value === 'object') merged[key] = mergeConfig(parseObject(inherited[key]), value);
  }
  return merged;
}
`.trimStart()

export const terminalAgentHookRelayScript = String.raw`
import { readFile } from 'node:fs/promises';

const providerId = process.argv[2];
let body = process.argv.length > 3 ? process.argv.at(-1) : '';
if (!body) for await (const chunk of process.stdin) body += chunk;
const payload = parseObject(body);
const signal = normalize(providerId, payload);
if (signal) await report(providerId, signal);
if (providerId === 'gemini') process.stdout.write('{}');

async function report(provider, signal) {
  const timeout = new AbortController();
  const timeoutId = setTimeout(() => timeout.abort(), 750);
  try {
    const terminal = JSON.parse(Buffer.from(process.env.CLEANCODE_AGENT_ACTIVITY_SCOPE || '', 'base64url').toString('utf8'));
    const invocationId = process.env.CLEANCODE_AGENT_ACTIVITY_INVOCATION_ID;
    const token = process.env.CLEANCODE_AGENT_ACTIVITY_TOKEN;
    const manifestPath = process.env.CLEANCODE_AGENT_ACTIVITY_MANIFEST;
    if (!invocationId || !token || !manifestPath) return;
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    await fetch(manifest.url, {
      body: JSON.stringify({ identity: { invocationId, providerId: provider, terminal }, signal }),
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      method: 'POST',
      signal: timeout.signal
    }).catch(() => {});
  } catch {}
  finally { clearTimeout(timeoutId); }
}

function normalize(provider, payload) {
  if (!payload) return null;
  if (provider === 'codex') return payload.type === 'agent-turn-complete' ? { type: 'turn_completed' } : null;
  const event = payload.hook_event_name;
  if (provider === 'gemini') {
    if (event === 'BeforeAgent') return status('working');
    if (event === 'AfterAgent' || event === 'SessionStart') return status('idle');
    if (event === 'SessionEnd') return status('unavailable');
    return null;
  }
  if (provider !== 'claude-code') return null;
  if (event === 'UserPromptSubmit') return status('working');
  if (event === 'PreToolUse') return status('working');
  if (event === 'PermissionRequest') return status('waiting_approval');
  if (event === 'Stop' || event === 'SessionStart') return status('idle');
  if (event === 'SessionEnd') return status('unavailable');
  if (event === 'Notification' && payload.notification_type === 'permission_prompt') return status('waiting_approval');
  if (event === 'Notification' && payload.notification_type === 'idle_prompt') return status('waiting_input');
  return null;
}

function status(value) { return { status: value, type: 'status_changed' }; }
function parseObject(value) {
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' ? parsed : null; }
  catch { return null; }
}
`.trimStart()

export const terminalAgentOpenCodePluginScript = String.raw`
import { readFile } from 'node:fs/promises';

export const CleanCodeAgentActivityPlugin = async ({ client, directory }) => {
  let activeSessionId = null;
  const report = async (signal) => {
    const timeout = new AbortController();
    const timeoutId = setTimeout(() => timeout.abort(), 750);
    try {
      const terminal = JSON.parse(Buffer.from(process.env.CLEANCODE_AGENT_ACTIVITY_SCOPE || '', 'base64url').toString('utf8'));
      const invocationId = process.env.CLEANCODE_AGENT_ACTIVITY_INVOCATION_ID;
      const token = process.env.CLEANCODE_AGENT_ACTIVITY_TOKEN;
      const manifestPath = process.env.CLEANCODE_AGENT_ACTIVITY_MANIFEST;
      if (!invocationId || !token || !manifestPath) return;
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      await fetch(manifest.url, {
        body: JSON.stringify({ identity: { invocationId, providerId: 'opencode', terminal }, signal }),
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        method: 'POST',
        signal: timeout.signal
      }).catch(() => {});
    } catch {}
    finally { clearTimeout(timeoutId); }
  };
  const accept = async (event) => {
    if (event?.type === 'session.created') {
      const info = event.properties?.info;
      if (!info || info.parentID !== undefined || info.directory !== directory) return;
      activeSessionId = info.id;
      await report(status('idle'));
      return;
    }
    const sessionId = event?.properties?.sessionID ?? event?.properties?.info?.id;
    if (!sessionId || sessionId !== activeSessionId) return;
    const signal = map(event);
    if (signal) await report(signal);
    if (event.type === 'session.deleted') activeSessionId = null;
  };
  return {
    event: async ({ event }) => accept(event),
    'chat.message': async ({ sessionID }) => {
      const result = await client.session.get({ path: { id: sessionID }, query: { directory } }).catch(() => null);
      const info = result?.data;
      if (info && info.parentID === undefined) activeSessionId = info.id;
    }
  };
};

function map(event) {
  if (event.type === 'session.idle') return status('idle');
  if (event.type === 'session.error' || event.type === 'session.deleted') return status('unavailable');
  if (event.type === 'permission.asked' || event.type === 'permission.updated') return status('waiting_approval');
  if (event.type === 'permission.replied') return status('working');
  if (event.type === 'question.asked') return status('waiting_input');
  if (event.type === 'question.replied' || event.type === 'question.rejected') return status('working');
  if (event.type !== 'session.status') return null;
  const type = event.properties?.status?.type;
  if (type === 'idle') return status('idle');
  if (type === 'busy' || type === 'retry') return status('working');
  return null;
}
function status(value) { return { status: value, type: 'status_changed' }; }
`.trimStart()
