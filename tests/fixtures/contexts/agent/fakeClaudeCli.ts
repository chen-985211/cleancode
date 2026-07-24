import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface FakeClaudeCliFixture {
  readonly binDirectory: string
  readonly reportPath: string
  readonly shellPath: string
}

export interface FakeClaudeCliReport {
  readonly args: readonly string[]
  readonly cwd: string
  readonly kind: 'exit' | 'inspection' | 'session' | 'user-prompt-hook'
  readonly pid: number
  readonly sessionId?: string
}

export async function installFakeClaudeCli(
  appStateDirectory: string
): Promise<FakeClaudeCliFixture> {
  const fixtureDirectory = join(appStateDirectory, 'fake-claude-cli')
  const binDirectory = join(fixtureDirectory, 'bin')
  const reportPath = join(fixtureDirectory, 'reports.jsonl')
  const executablePath = join(binDirectory, 'claude')
  const shellPath = join(fixtureDirectory, 'sh')

  await mkdir(binDirectory, { recursive: true })
  await writeFile(executablePath, createFakeClaudeProgram(), 'utf8')
  await writeFile(shellPath, createDeterministicShellProgram(), 'utf8')
  await chmod(executablePath, 0o755)
  await chmod(shellPath, 0o755)

  return { binDirectory, reportPath, shellPath }
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
  return `#!${process.execPath}
import { appendFileSync } from 'node:fs'

const args = process.argv.slice(2)
const cwd = process.cwd()
const reportPath = process.env.CLEANCODE_FAKE_CLAUDE_REPORT_PATH
const sessionFlagIndex = args.findIndex((arg) => arg === '--session-id' || arg === '--resume')
const sessionId = sessionFlagIndex >= 0 ? args[sessionFlagIndex + 1] : undefined

function report(kind) {
  if (!reportPath) return
  appendFileSync(reportPath, JSON.stringify({ args, cwd, kind, pid: process.pid, sessionId }) + '\\n')
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
async function publishUserPrompt() {
  if (!sessionId || !process.env.CLEANCODE_CLAUDE_HOOK_URL) return
  await fetch(process.env.CLEANCODE_CLAUDE_HOOK_URL, {
    body: JSON.stringify({ cwd, hook_event_name: 'UserPromptSubmit', session_id: sessionId }),
    headers: { authorization: 'Bearer ' + process.env.CLEANCODE_CLAUDE_HOOK_TOKEN },
    method: 'POST'
  })
  report('user-prompt-hook')
}

function exitCleanly() {
  if (exiting) return
  exiting = true
  report('exit')
  process.exit(0)
}

process.stdin.setRawMode?.(true)
process.stdin.resume()
process.stdin.on('data', (data) => {
  if (data.includes(3)) {
    exitCleanly()
    return
  }
  input += data.toString('utf8')
  if (!input.includes('\\r') && !input.includes('\\n')) return
  input = ''
  void publishUserPrompt().catch(() => undefined)
})
process.on('SIGHUP', exitCleanly)
process.on('SIGINT', exitCleanly)
process.on('SIGTERM', exitCleanly)
`
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
