import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface PosixProcessGroupSnapshot {
  readonly foregroundProcessGroupId: number | null
  readonly processGroupId: number
}

export async function readPosixProcessGroupSnapshot(
  processId: number
): Promise<PosixProcessGroupSnapshot | null> {
  try {
    const { stdout } = await execFileAsync(
      '/bin/ps',
      ['-o', 'pgid=', '-o', 'tpgid=', '-p', String(processId)],
      { timeout: 1_000 }
    )
    const [processGroupValue, foregroundProcessGroupValue] = stdout.trim().split(/\s+/u)
    const processGroupId = parseProcessGroupId(processGroupValue)
    if (!processGroupId) return null

    return {
      foregroundProcessGroupId: parseProcessGroupId(foregroundProcessGroupValue),
      processGroupId
    }
  } catch {
    return null
  }
}

function parseProcessGroupId(value: string | undefined): number | null {
  const processGroupId = Number(value)
  return Number.isSafeInteger(processGroupId) && processGroupId > 1 ? processGroupId : null
}

export async function terminatePosixProcessGroup(
  processGroupId: number,
  graceMs: number,
  forceMs: number
): Promise<void> {
  signalProcessGroup(processGroupId, 'SIGTERM')
  if (await waitForProcessGroupExit(processGroupId, graceMs)) return

  signalProcessGroup(processGroupId, 'SIGKILL')
  if (!(await waitForProcessGroupExit(processGroupId, forceMs))) {
    throw new Error(`Terminal process group ${processGroupId} did not exit.`)
  }
}

function signalProcessGroup(processGroupId: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-processGroupId, signal)
  } catch (error) {
    if (!isNoSuchProcessError(error)) throw error
  }
}

async function waitForProcessGroupExit(
  processGroupId: number,
  timeoutMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs

  while (isProcessGroupAlive(processGroupId)) {
    if (Date.now() >= deadline) return false
    await new Promise((resolve) => setTimeout(resolve, 25))
  }

  return true
}

function isProcessGroupAlive(processGroupId: number): boolean {
  try {
    process.kill(-processGroupId, 0)
    return true
  } catch (error) {
    return !isNoSuchProcessError(error)
  }
}

function isNoSuchProcessError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'ESRCH'
  )
}
