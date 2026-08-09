import { spawn } from 'node:child_process'
import { join } from 'node:path'

const childPath = join(
  process.cwd(),
  'tests',
  'fixtures',
  'contexts',
  'run',
  'conptyCloseRaceChild.cjs'
)
const childDeadlineMs = 65_000

interface ChildResult {
  readonly exitCode: number | null
  readonly signal: NodeJS.Signals | null
  readonly stderr: string
  readonly stdout: string
  readonly timedOut: boolean
}

interface CloseRaceSummary {
  readonly clearAttemptCount: number
  readonly conptyNativeDirectory: string
  readonly duplicateExitCount: number
  readonly exitedCount: number
  readonly killAttemptCount: number
  readonly nodePtyEntryPath: string
  readonly readyCount: number
  readonly resizeAttemptCount: number
  readonly successfulClearCount: number
  readonly successfulResizeCount: number
  readonly terminalCount: number
}

describe.runIf(process.platform === 'win32')('node-pty Windows ConPTY close lifecycle', () => {
  // Regression for node-pty #921/#922, fixed upstream by fa83ecf.
  it('keeps native handle ownership valid while ready terminals resize, clear, and close concurrently', async () => {
    const result = await runIsolatedCloseRace()
    const diagnostics = JSON.stringify(result)

    expect(result.timedOut, diagnostics).toBe(false)
    expect(result.signal, diagnostics).toBeNull()
    expect(result.exitCode, diagnostics).toBe(0)
    expect(result.stderr, diagnostics).toBe('')

    const summary = JSON.parse(result.stdout.trim()) as CloseRaceSummary
    expect(summary).toMatchObject({
      clearAttemptCount: expect.any(Number),
      conptyNativeDirectory: expect.stringContaining('build/Release'),
      duplicateExitCount: 0,
      exitedCount: 30,
      killAttemptCount: 30,
      nodePtyEntryPath: expect.stringContaining('node-pty'),
      readyCount: 30,
      resizeAttemptCount: expect.any(Number),
      successfulClearCount: expect.any(Number),
      successfulResizeCount: expect.any(Number),
      terminalCount: 30
    })
    expect(summary.resizeAttemptCount).toBeGreaterThanOrEqual(30)
    expect(summary.clearAttemptCount).toBeGreaterThanOrEqual(30)
    expect(summary.successfulResizeCount).toBeGreaterThanOrEqual(30)
    expect(summary.successfulClearCount).toBeGreaterThanOrEqual(30)
  }, 70_000)
})

function runIsolatedCloseRace(): Promise<ChildResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [childPath], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })
    let stderr = ''
    let stdout = ''
    let timedOut = false

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })

    const deadline = setTimeout(() => {
      timedOut = true
      const forceDeadline = setTimeout(() => child.kill(), 2_000)
      void terminateWindowsProcessTree(child.pid).finally(() => {
        clearTimeout(forceDeadline)
        child.kill()
      })
    }, childDeadlineMs)

    child.once('error', (error) => {
      clearTimeout(deadline)
      reject(error)
    })
    child.once('close', (exitCode, signal) => {
      clearTimeout(deadline)
      resolve({ exitCode, signal, stderr, stdout, timedOut })
    })
  })
}

function terminateWindowsProcessTree(
  processId: number | undefined,
  windowsDirectory = process.env.SystemRoot
): Promise<void> {
  if (processId === undefined || windowsDirectory === undefined) return Promise.resolve()

  return new Promise((resolveCleanup) => {
    const cleanup = spawn(
      join(windowsDirectory, 'System32', 'taskkill.exe'),
      ['/pid', String(processId), '/t', '/f'],
      {
        stdio: 'ignore',
        windowsHide: true
      }
    )
    cleanup.once('error', () => resolveCleanup())
    cleanup.once('close', () => resolveCleanup())
  })
}
