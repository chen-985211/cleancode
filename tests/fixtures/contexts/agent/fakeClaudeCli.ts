import { randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface FakeClaudeCliFixture {
  readonly binDirectory: string
  readonly reportPath: string
  readonly shellPath: string
  readonly switchSessionId: string
}

export interface FakeClaudeCliReport {
  readonly args: readonly string[]
  readonly cwd: string
  readonly kind: 'exit' | 'inspection' | 'session' | 'session-start-hook' | 'user-prompt-hook'
  readonly pid: number
  readonly sessionId?: string
}

export async function installFakeClaudeCli(
  appStateDirectory: string
): Promise<FakeClaudeCliFixture> {
  const fixtureDirectory = join(appStateDirectory, 'fake-claude-cli')
  const binDirectory = join(fixtureDirectory, 'bin')
  const reportPath = join(fixtureDirectory, 'reports.jsonl')
  const executablePath = join(binDirectory, process.platform === 'win32' ? 'claude.cmd' : 'claude')
  const programPath = join(fixtureDirectory, 'claude.mjs')
  const shellPath = process.platform === 'win32' ? 'powershell.exe' : join(fixtureDirectory, 'sh')
  const switchSessionId = randomUUID()

  await mkdir(binDirectory, { recursive: true })
  await writeFile(programPath, createFakeClaudeProgram(), 'utf8')
  await writeFile(executablePath, createNodeCliLauncher(programPath), 'utf8')
  if (process.platform !== 'win32') {
    await writeFile(shellPath, createDeterministicShellProgram(), 'utf8')
    await chmod(executablePath, 0o755)
    await chmod(shellPath, 0o755)
  }

  return { binDirectory, reportPath, shellPath, switchSessionId }
}

export async function readFakeClaudeCliReports(
  reportPath: string
): Promise<readonly FakeClaudeCliReport[]> {
  try {
    const contents = await readFile(reportPath, 'utf8')

    return contents
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as FakeClaudeCliReport)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return []
    throw error
  }
}

function createFakeClaudeProgram(): string {
  return `import { appendFileSync } from 'node:fs'

const args = process.argv.slice(2)
const cwd = process.cwd()
const reportPath = process.env.CLEANCODE_FAKE_CLAUDE_REPORT_PATH
const sessionFlagIndex = args.findIndex((arg) => arg === '--session-id' || arg === '--resume')
const sessionId = sessionFlagIndex >= 0 ? args[sessionFlagIndex + 1] : undefined

function report(kind, reportedSessionId = sessionId) {
  if (!reportPath) return
  appendFileSync(
    reportPath,
    JSON.stringify({ args, cwd, kind, pid: process.pid, sessionId: reportedSessionId }) + '\\n'
  )
}

if (args.includes('--version')) {
  report('inspection')
  process.stdout.write('2.1.217 (Claude Code)\\n')
  process.exit(0)
}

report('session')
process.stdout.write('CC_E2E_CLAUDE_READY:' + sessionId + ':' + process.pid + '\\n')

let input = ''
let exiting = false
async function publishSessionStart(activeSessionId, source) {
  if (!activeSessionId || !process.env.CLEANCODE_CLAUDE_HOOK_URL) return
  await fetch(process.env.CLEANCODE_CLAUDE_HOOK_URL, {
    body: JSON.stringify({
      cwd,
      hook_event_name: 'SessionStart',
      session_id: activeSessionId,
      source
    }),
    headers: { authorization: 'Bearer ' + process.env.CLEANCODE_CLAUDE_HOOK_TOKEN },
    method: 'POST'
  })
  report('session-start-hook', activeSessionId)
}

async function publishUserPrompt(activeSessionId) {
  if (!activeSessionId || !process.env.CLEANCODE_CLAUDE_HOOK_URL) return
  await fetch(process.env.CLEANCODE_CLAUDE_HOOK_URL, {
    body: JSON.stringify({
      cwd,
      hook_event_name: 'UserPromptSubmit',
      session_id: activeSessionId
    }),
    headers: { authorization: 'Bearer ' + process.env.CLEANCODE_CLAUDE_HOOK_TOKEN },
    method: 'POST'
  })
  report('user-prompt-hook', activeSessionId)
}

function exitCleanly() {
  if (exiting) return
  exiting = true
  report('exit')
  process.exit(0)
}

await publishSessionStart(sessionId, args.includes('--resume') ? 'resume' : 'startup')

process.stdin.setRawMode?.(true)
process.stdin.resume()
process.stdin.on('data', (data) => {
  if (data.includes(3)) {
    exitCleanly()
    return
  }
  input += data.toString('utf8')
  if (!input.includes('\\r') && !input.includes('\\n')) return
  const command = input.trim()
  input = ''
  if (command === '/resume') {
    void publishSessionStart(process.env.CLEANCODE_FAKE_CLAUDE_SWITCH_SESSION_ID, 'resume').catch(
      () => undefined
    )
    return
  }
  if (command) void publishUserPrompt(sessionId).catch(() => undefined)
})
process.on('SIGHUP', exitCleanly)
process.on('SIGINT', exitCleanly)
process.on('SIGTERM', exitCleanly)
`
}

function createNodeCliLauncher(programPath: string): string {
  return process.platform === 'win32'
    ? `@echo off\r\n"${process.execPath}" "${programPath}" %*\r\n`
    : `#!/bin/sh\nexec ${quotePosixWord(process.execPath)} ${quotePosixWord(programPath)} "$@"\n`
}

function quotePosixWord(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}

function createDeterministicShellProgram(): string {
  return `#!/bin/sh
if [ "$1" = "-ilc" ]; then
  case "$2" in
    *"__CLEANCODE_AGENT_SHELL_PATH__"*)
      printf '%s' '__CLEANCODE_AGENT_SHELL_PATH__'
      printf '%s' "$PATH"
      printf '%s' '__CLEANCODE_AGENT_SHELL_PATH__'
      exit 0
      ;;
  esac
fi

exec /bin/sh "$@"
`
}
