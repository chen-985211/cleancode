import { randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface FakeCodexCliFixture {
  readonly binDirectory: string
  readonly executablePath: string
  readonly reportPath: string
  readonly sessionId: string
  readonly switchSessionId: string
}

export interface FakeCodexCliReport {
  readonly args: readonly string[]
  readonly cwd: string
  readonly exitReason?: 'interrupt' | 'quit' | 'signal'
  readonly kind:
    | 'app-server'
    | 'draw'
    | 'exit'
    | 'hook-error'
    | 'inspection'
    | 'resume'
    | 'session'
    | 'session-end-hook'
  readonly pid: number
  readonly sessionEndHookTrusted?: boolean
  readonly sessionId?: string
  readonly sourceTheme?: 'dark' | 'light'
}

export async function installFakeCodexCli(appStateDirectory: string): Promise<FakeCodexCliFixture> {
  const fixtureDirectory = join(appStateDirectory, 'fake-codex-cli')
  const binDirectory = join(fixtureDirectory, 'bin')
  const executablePath = join(binDirectory, process.platform === 'win32' ? 'codex.cmd' : 'codex')
  const reportPath = join(fixtureDirectory, 'reports.jsonl')
  const programPath = join(fixtureDirectory, 'codex.mjs')
  const sessionId = randomUUID()
  const switchSessionId = randomUUID()

  await mkdir(binDirectory, { recursive: true })
  await writeFile(programPath, createFakeCodexProgram(), 'utf8')
  if (process.platform === 'win32') {
    await Promise.all([
      writeFile(executablePath, createWindowsCmdLauncher(programPath), 'utf8'),
      writeFile(
        join(binDirectory, 'codex.ps1'),
        createWindowsPowerShellLauncher(programPath),
        'utf8'
      )
    ])
  } else {
    await writeFile(executablePath, createPosixNodeCliLauncher(programPath), 'utf8')
    await chmod(executablePath, 0o755)
  }

  return { binDirectory, executablePath, reportPath, sessionId, switchSessionId }
}

export async function readFakeCodexCliReports(
  reportPath: string
): Promise<readonly FakeCodexCliReport[]> {
  try {
    const contents = await readFile(reportPath, 'utf8')

    return contents
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as FakeCodexCliReport)
  } catch (error) {
    if (isMissingFileError(error)) {
      return []
    }

    throw error
  }
}

function createFakeCodexProgram(): string {
  return `import { spawn } from 'node:child_process'
import { appendFileSync } from 'node:fs'

const CSI = '\\x1b['
const OSC = '\\x1b]'
const ST = '\\x1b\\\\'
const args = process.argv.slice(2)
const cwd = process.cwd()
const reportPath = process.env.CLEANCODE_FAKE_CODEX_REPORT_PATH
const configs = args.flatMap((argument, index) =>
  argument === '--config' && typeof args[index + 1] === 'string' ? [args[index + 1]] : []
)
const sessionEndConfiguration = configs.find((value) => value.startsWith('hooks.SessionEnd='))
const hookKey = '/<session-flags>/config.toml:session_end:0:0'
const hookHash = 'sha256:cleancode-fake-codex-session-end'
const hookCommand = sessionEndConfiguration
  ? readConfigurationString(
      sessionEndConfiguration,
      process.platform === 'win32' ? 'commandWindows=' : 'command='
    )
  : null
const sessionEndHookTrusted = Boolean(
  hookCommand && configs.some(isPreciseSessionEndTrustConfiguration)
)
const terminalTitleConfigured = configs.includes(
  'tui.terminal_title=["thread-title","thread-id"]'
)
const resumeIndex = args.indexOf('resume')
let activeSessionId =
  resumeIndex >= 0 ? args[resumeIndex + 1] : process.env.CLEANCODE_FAKE_CODEX_SESSION_ID
const initialSessionId = activeSessionId
let commandInput = ''
let terminalResponseBuffer = ''
let sourceTheme = null

function report(kind, details = {}) {
  if (!reportPath) return
  const entry = { args, cwd, kind, pid: process.pid, ...details }
  if (sourceTheme) entry.sourceTheme = sourceTheme
  appendFileSync(
    reportPath,
    JSON.stringify(entry) + '\\n'
  )
}

if (args.includes('--version')) {
  report('inspection')
  process.stdout.write('codex-cli fake-e2e\\n')
  process.exit(0)
}

if (args.includes('app-server')) {
  report('app-server')
  let protocolInput = ''
  process.stdin.setEncoding('utf8')
  process.stdin.resume()
  process.stdin.on('data', (chunk) => {
    protocolInput += chunk
    let newlineIndex = protocolInput.indexOf('\\n')
    while (newlineIndex >= 0) {
      const line = protocolInput.slice(0, newlineIndex).trim()
      protocolInput = protocolInput.slice(newlineIndex + 1)
      if (line) handleAppServerRequest(line)
      newlineIndex = protocolInput.indexOf('\\n')
    }
  })
} else {
  startSession()
}

function handleAppServerRequest(line) {
  let request
  try {
    request = JSON.parse(line)
  } catch {
    return
  }
  if (request.method === 'initialize') {
    writeProtocolResponse(request.id, { userAgent: 'codex-cli fake-e2e' })
    return
  }
  if (request.method === 'thread/list') {
    const archived = request.params?.archived === true
    const cursor = request.params?.cursor
    const firstPage = cursor !== 'switch-session'
    writeProtocolResponse(request.id, {
      data: archived
        ? []
        : [
            {
              id: firstPage
                ? process.env.CLEANCODE_FAKE_CODEX_SESSION_ID
                : process.env.CLEANCODE_FAKE_CODEX_SWITCH_SESSION_ID
            }
          ],
      nextCursor: archived || !firstPage ? null : 'switch-session'
    })
    return
  }
  if (request.method !== 'hooks/list') return
  writeProtocolResponse(request.id, {
    data: [
      {
        cwd,
        hooks: hookCommand
          ? [
              {
                command: hookCommand,
                currentHash: hookHash,
                eventName: 'sessionEnd',
                handlerType: 'command',
                isManaged: false,
                key: hookKey,
                source: 'sessionFlags'
              }
            ]
          : []
      }
    ]
  })
}

function writeProtocolResponse(id, result) {
  process.stdout.write(JSON.stringify({ id, result }) + '\\n')
}

function readConfigurationString(configuration, key) {
  const keyIndex = configuration.indexOf(key)
  if (keyIndex < 0) return null
  const valueStart = keyIndex + key.length
  if (configuration[valueStart] !== '"') return null

  let escaped = false
  for (let index = valueStart + 1; index < configuration.length; index += 1) {
    const character = configuration[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (character === '\\\\') {
      escaped = true
      continue
    }
    if (character !== '"') continue
    try {
      return JSON.parse(configuration.slice(valueStart, index + 1))
    } catch {
      return null
    }
  }
  return null
}

function isPreciseSessionEndTrustConfiguration(configuration) {
  const prefix = 'hooks.state={' + JSON.stringify(hookKey) + '={trusted_hash='
  if (!configuration.startsWith(prefix) || !configuration.endsWith('}}')) return false
  try {
    const trustedHash = JSON.parse(configuration.slice(prefix.length, -2))
    return trustedHash === hookHash
  } catch {
    return false
  }
}

function draw() {
  if (!sourceTheme) return
  const columns = Math.max(2, process.stdout.columns || 80)
  const rows = Math.max(2, process.stdout.rows || 24)
  const background = sourceTheme === 'light' ? '255;255;255' : '0;0;0'
  const foreground = sourceTheme === 'light' ? '0;0;0' : '255;255;255'
  const blankRow = ' '.repeat(columns - 1)
  let output = CSI + '?25l'

  for (let row = 1; row <= rows; row += 1) {
    output += CSI + row + ';1H' + CSI + '48;2;' + background + 'm' + blankRow
  }

  output +=
    CSI +
    '1;1H' +
    CSI +
    '38;2;' +
    foreground +
    'm' +
    'CC_E2E_CODEX_READY:' +
    sourceTheme +
    ':' +
    process.pid +
    CSI +
    '0m'
  output += (CSI + '2;1H').repeat(process.platform === 'win32' ? 128 : 1_600)
  process.stdout.write(output)
  report('draw')
}

function publishTerminalTitle(renamed = false) {
  if (!terminalTitleConfigured || !activeSessionId) return
  const threadTitle = renamed ? 'renamed thread | containing separator' : activeSessionId
  process.stdout.write(
    OSC + '0;' + threadTitle + ' | ' + activeSessionId.slice(0, 29) + '...' + '\\x07'
  )
}

function adoptReportedBackground() {
  if (sourceTheme) return
  const responsePrefix = OSC + '11;rgb:'
  const responseStart = terminalResponseBuffer.indexOf(responsePrefix)
  if (responseStart < 0) return
  const payloadStart = responseStart + responsePrefix.length
  const belIndex = terminalResponseBuffer.indexOf('\\x07', payloadStart)
  const stIndex = terminalResponseBuffer.indexOf(ST, payloadStart)
  const responseEnd = [belIndex, stIndex]
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0]
  if (responseEnd === undefined) return

  const channels = terminalResponseBuffer.slice(payloadStart, responseEnd).split('/')
  if (channels.length !== 3 || channels.some((channel) => !/^[0-9a-f]{1,4}$/i.test(channel))) {
    return
  }

  const normalizedChannels = channels.map(
    (channel) => Number.parseInt(channel, 16) / (16 ** channel.length - 1)
  )
  const luminance =
    0.2126 * normalizedChannels[0] +
    0.7152 * normalizedChannels[1] +
    0.0722 * normalizedChannels[2]
  sourceTheme = luminance >= 0.5 ? 'light' : 'dark'
  commandInput = ''
  report('session', { sessionEndHookTrusted, sessionId: activeSessionId })
  draw()
}

let exiting = false
function exitWithoutSessionEnd(exitReason) {
  if (exiting) return
  exiting = true
  report('exit', { exitReason, sessionId: activeSessionId })
  process.stdout.write(CSI + '0m' + CSI + '?25h')
  process.exit(0)
}

async function exitThroughSessionEnd() {
  if (exiting) return
  exiting = true
  const published = await publishSessionEnd(activeSessionId)
  if (!published && activeSessionId && sessionEndHookTrusted) {
    report('hook-error', { sessionId: activeSessionId })
  }
  if (initialSessionId && initialSessionId !== activeSessionId) {
    await publishSessionEnd(initialSessionId)
  }
  report('exit', { exitReason: 'quit', sessionId: activeSessionId })
  process.stdout.write(CSI + '0m' + CSI + '?25h')
  process.exit(0)
}

async function publishSessionEnd(sessionId) {
  if (!sessionId || !hookCommand || !sessionEndHookTrusted) return false
  const payload = JSON.stringify({
    cwd,
    hook_event_name: 'SessionEnd',
    reason: 'other',
    session_id: sessionId,
    transcript_path: ''
  })

  return new Promise((resolve) => {
    const child = spawn(hookCommand, {
      env: process.env,
      shell: true,
      stdio: ['pipe', 'ignore', 'ignore'],
      windowsHide: true
    })
    let settled = false
    const timeout = setTimeout(() => finish(false), 1_000)
    const finish = (published) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (!child.killed) child.kill()
      if (published) report('session-end-hook', { sessionId })
      resolve(published)
    }

    child.once('error', () => finish(false))
    child.once('exit', (code) => finish(code === 0))
    child.stdin.on('error', () => finish(false))
    child.stdin.end(payload)
  })
}

function handleTerminalInput(data) {
  if (data.includes(3)) {
    exitWithoutSessionEnd('interrupt')
    return
  }
  if (!sourceTheme) {
    terminalResponseBuffer = (terminalResponseBuffer + data.toString('latin1')).slice(-4096)
    adoptReportedBackground()
    return
  }

  for (const byte of data) {
    if (byte === 21) {
      commandInput = ''
      continue
    }
    if (byte === 13 || byte === 10) {
      const command = commandInput.trim()
      commandInput = ''
      if (command === '/resume') {
        activeSessionId = process.env.CLEANCODE_FAKE_CODEX_SWITCH_SESSION_ID
        report('resume', { sessionId: activeSessionId })
        publishTerminalTitle(true)
      } else if (command === '/quit') {
        void exitThroughSessionEnd()
      }
      continue
    }
    commandInput += String.fromCharCode(byte)
  }
}

function startSession() {
  process.stdin.setRawMode?.(true)
  process.stdin.resume()
  process.stdout.on('resize', draw)
  process.stdin.on('data', handleTerminalInput)
  process.on('SIGHUP', () => exitWithoutSessionEnd('signal'))
  process.on('SIGINT', () => exitWithoutSessionEnd('signal'))
  process.on('SIGTERM', () => exitWithoutSessionEnd('signal'))
  const colorFgBg = process.env.COLORFGBG
  if (process.platform === 'win32' && colorFgBg === '0;15') {
    sourceTheme = 'light'
  } else if (process.platform === 'win32' && colorFgBg === '15;0') {
    sourceTheme = 'dark'
  }

  if (sourceTheme) {
    report('session', { sessionEndHookTrusted, sessionId: activeSessionId })
    draw()
    publishTerminalTitle()
  } else {
    process.stdout.write(OSC + '11;?' + '\\x07')
  }
}
`
}

function createWindowsCmdLauncher(programPath: string): string {
  return `@echo off\r\n"${process.execPath}" "${programPath}" %*\r\n`
}

function createWindowsPowerShellLauncher(programPath: string): string {
  return `& ${quotePowerShellWord(process.execPath)} ${quotePowerShellWord(programPath)} @args\nexit $LASTEXITCODE\n`
}

function createPosixNodeCliLauncher(programPath: string): string {
  return `#!/bin/sh\nexec ${quotePosixWord(process.execPath)} ${quotePosixWord(programPath)} "$@"\n`
}

function quotePosixWord(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}

function quotePowerShellWord(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
