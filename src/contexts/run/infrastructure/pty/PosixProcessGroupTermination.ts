import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function readPosixProcessGroupId(processId: number): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync('/bin/ps', ['-o', 'pgid=', '-p', String(processId)], {
      timeout: 1_000
    })
    const processGroupId = Number.parseInt(stdout.trim(), 10)
    return Number.isSafeInteger(processGroupId) && processGroupId > 1 ? processGroupId : null
  } catch {
    return null
  }
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
