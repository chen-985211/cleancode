import { spawn } from 'node:child_process'
import { join } from 'node:path'

const childPath = join(
  process.cwd(),
  'tests',
  'fixtures',
  'contexts',
  'run',
  'conptyConnectFailureChild.cjs'
)
const childDeadlineMs = 35_000

interface ChildResult {
  readonly exitCode: number | null
  readonly signal: NodeJS.Signals | null
  readonly stderr: string
  readonly stdout: string
  readonly timedOut: boolean
}

interface ConnectFailureSummary {
  readonly baselineHandleCount: number
  readonly conptyNativeDirectory: string
  readonly failureCount: number
  readonly failureMessages: readonly string[]
  readonly firstBatchHandleCount: number
  readonly nodePtyEntryPath: string
  readonly postFailureHandleCount: number
  readonly preReadyExitCode: number
  readonly preReadyExitCount: number
  readonly preReadyExitDurationMs: number
  readonly recoveredExitCode: number
  readonly recoveryMarkerObserved: boolean
  readonly recoverySpawnCount: number
}

describe.runIf(process.platform === 'win32')('node-pty Windows ConPTY connect failure', () => {
  it('releases failed CreateProcess resources and keeps later ConPTY spawns usable', async () => {
    const result = await runIsolatedConnectFailures()
    const diagnostics = JSON.stringify(result)

    expect(result.timedOut, diagnostics).toBe(false)
    expect(result.signal, diagnostics).toBeNull()
    expect(result.exitCode, diagnostics).toBe(0)
    expect(result.stderr, diagnostics).toBe('')

    const summary = JSON.parse(result.stdout.trim()) as ConnectFailureSummary
    expect(summary).toMatchObject({
      conptyNativeDirectory: expect.stringContaining('build/Release'),
      failureCount: 40,
      nodePtyEntryPath: expect.stringContaining('node-pty'),
      preReadyExitCode: expect.any(Number),
      preReadyExitCount: 1,
      recoveredExitCode: 0,
      recoveryMarkerObserved: true,
      recoverySpawnCount: 1
    })
    expect(summary.failureMessages).toHaveLength(1)
    expect(summary.failureMessages[0]).toMatch(/Cannot create process, error code: (193|216)/u)
    expect(summary.firstBatchHandleCount).toBeLessThanOrEqual(summary.baselineHandleCount + 12)
    expect(summary.postFailureHandleCount).toBeLessThanOrEqual(summary.firstBatchHandleCount + 4)
    expect(summary.preReadyExitDurationMs).toBeLessThanOrEqual(1_500)
  }, 40_000)
})

function runIsolatedConnectFailures(): Promise<ChildResult> {
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
