import { execFile } from 'node:child_process'
import { platform } from 'node:os'
import { promisify } from 'node:util'

import type {
  TcpListenerInspection,
  TcpListenerInspectionPort
} from '../../application/ports/TcpListenerInspectionPort'

const execFileAsync = promisify(execFile)

interface NodeTcpListenerInspectionSystem {
  platform(): NodeJS.Platform
  isProcessAlive(processId: number): Promise<boolean>
  readListenerProcessIds(port: number): Promise<readonly number[] | null>
  isDescendantOf(listenerProcessId: number, rootProcessId: number): Promise<boolean>
}

const defaultInspectionSystem: NodeTcpListenerInspectionSystem = {
  platform,
  isProcessAlive,
  readListenerProcessIds: readDarwinListenerProcessIds,
  isDescendantOf
}

export class NodeTcpListenerInspectionAdapter implements TcpListenerInspectionPort {
  constructor(private readonly system: NodeTcpListenerInspectionSystem = defaultInspectionSystem) {}

  async inspect(command: {
    readonly host: '127.0.0.1'
    readonly port: number
    readonly rootProcessId: number
  }): Promise<TcpListenerInspection> {
    if (this.system.platform() !== 'darwin') {
      return { ownership: 'unknown', reason: 'listener-inspection-platform-unsupported' }
    }

    if (!(await this.system.isProcessAlive(command.rootProcessId))) {
      return { ownership: 'unknown', reason: 'managed-root-process-not-found' }
    }

    const initialListenerProcessIds = await this.system.readListenerProcessIds(command.port)
    if (initialListenerProcessIds === null) {
      return { ownership: 'unknown', reason: 'listener-inspection-unavailable' }
    }
    if (initialListenerProcessIds.length === 0) {
      return { ownership: 'unknown', reason: 'listener-not-found' }
    }

    const ownershipByProcessId = await Promise.all(
      initialListenerProcessIds.map(async (listenerProcessId) => ({
        listenerProcessId,
        owned: await this.system.isDescendantOf(listenerProcessId, command.rootProcessId)
      }))
    )
    const finalListenerProcessIds = await this.system.readListenerProcessIds(command.port)
    if (
      finalListenerProcessIds === null ||
      !(await this.system.isProcessAlive(command.rootProcessId)) ||
      !sameProcessIds(initialListenerProcessIds, finalListenerProcessIds)
    ) {
      return { ownership: 'unknown', reason: 'listener-changed-during-inspection' }
    }

    const ownedListenerCount = ownershipByProcessId.filter((candidate) => candidate.owned).length
    if (ownedListenerCount === 0) {
      return { ownership: 'external', listenerProcessId: finalListenerProcessIds[0] as number }
    }
    if (ownedListenerCount !== initialListenerProcessIds.length) {
      return { ownership: 'unknown', reason: 'listener-ownership-ambiguous' }
    }

    const finalOwnership = await Promise.all(
      finalListenerProcessIds.map((listenerProcessId) =>
        this.system.isDescendantOf(listenerProcessId, command.rootProcessId)
      )
    )
    if (
      finalOwnership.some((owned) => !owned) ||
      !(await this.system.isProcessAlive(command.rootProcessId))
    ) {
      return {
        ownership: 'unknown',
        reason: 'listener-ownership-changed-during-inspection'
      }
    }

    return { ownership: 'owned', listenerProcessId: finalListenerProcessIds[0] as number }
  }
}

async function readDarwinListenerProcessIds(port: number): Promise<readonly number[] | null> {
  try {
    const { stdout } = await execFileAsync(
      '/usr/sbin/lsof',
      ['-nP', '-a', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpc'],
      { timeout: 1_000 }
    )
    return parseProcessIds(stdout)
  } catch (error) {
    if (isExitCode(error, 1)) {
      return []
    }
    return null
  }
}

function parseProcessIds(output: string): readonly number[] {
  return [
    ...new Set(
      output
        .split('\n')
        .filter((line) => line.startsWith('p'))
        .map((line) => Number.parseInt(line.slice(1), 10))
        .filter((processId) => Number.isSafeInteger(processId) && processId > 0)
    )
  ]
}

async function isDescendantOf(listenerProcessId: number, rootProcessId: number): Promise<boolean> {
  if (listenerProcessId === rootProcessId) {
    return true
  }

  let currentProcessId: number | null = listenerProcessId
  const visited = new Set<number>()
  while (currentProcessId && currentProcessId > 1 && !visited.has(currentProcessId)) {
    if (currentProcessId === rootProcessId) return true
    visited.add(currentProcessId)
    currentProcessId = await readProcessParentId(currentProcessId)
  }
  return false
}

async function readProcessParentId(processId: number): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync('/bin/ps', ['-o', 'ppid=', '-p', String(processId)], {
      timeout: 1_000
    })
    const value = Number.parseInt(stdout.trim(), 10)
    return Number.isSafeInteger(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

async function isProcessAlive(processId: number): Promise<boolean> {
  if (!Number.isSafeInteger(processId) || processId <= 1) return false
  try {
    const { stdout } = await execFileAsync('/bin/ps', ['-o', 'pid=', '-p', String(processId)], {
      timeout: 1_000
    })
    return Number.parseInt(stdout.trim(), 10) === processId
  } catch {
    return false
  }
}

function sameProcessIds(left: readonly number[], right: readonly number[]): boolean {
  const sortedLeft = [...left].sort((a, b) => a - b)
  const sortedRight = [...right].sort((a, b) => a - b)
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((processId, index) => processId === sortedRight[index])
  )
}

function isExitCode(error: unknown, code: number): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === code
  )
}
