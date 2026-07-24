import { execFile } from 'node:child_process'
import { readdir, readFile, readlink } from 'node:fs/promises'
import { platform } from 'node:os'
import { join } from 'node:path'
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
  readListenerProcessIds: (port) => readListenerProcessIds(port, platform()),
  isDescendantOf: (listenerProcessId, rootProcessId) =>
    isDescendantOf(listenerProcessId, rootProcessId, platform())
}

export class NodeTcpListenerInspectionAdapter implements TcpListenerInspectionPort {
  constructor(private readonly system: NodeTcpListenerInspectionSystem = defaultInspectionSystem) {}

  async inspect(command: {
    readonly host: '127.0.0.1'
    readonly port: number
    readonly rootProcessId: number
  }): Promise<TcpListenerInspection> {
    if (!isListenerInspectionPlatform(this.system.platform())) {
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

function isListenerInspectionPlatform(
  runtimePlatform: NodeJS.Platform
): runtimePlatform is 'darwin' | 'linux' | 'win32' {
  return runtimePlatform === 'darwin' || runtimePlatform === 'linux' || runtimePlatform === 'win32'
}

function readListenerProcessIds(
  port: number,
  runtimePlatform: NodeJS.Platform
): Promise<readonly number[] | null> {
  if (runtimePlatform === 'darwin') return readDarwinListenerProcessIds(port)
  if (runtimePlatform === 'linux') return readLinuxListenerProcessIds(port)
  if (runtimePlatform === 'win32') return readWindowsListenerProcessIds(port)
  return Promise.resolve(null)
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

async function readLinuxListenerProcessIds(port: number): Promise<readonly number[] | null> {
  try {
    const socketInodes = await readLinuxListenerSocketInodes(port)
    if (socketInodes === null) return null
    if (socketInodes.size === 0) return []

    const processEntries = await readdir('/proc', { withFileTypes: true })
    const listenerProcessIds = new Set<number>()
    for (const entry of processEntries) {
      if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue
      const processId = Number.parseInt(entry.name, 10)
      let fileDescriptors: readonly string[]
      try {
        fileDescriptors = await readdir(join('/proc', entry.name, 'fd'))
      } catch {
        continue
      }
      for (const fileDescriptor of fileDescriptors) {
        try {
          const target = await readlink(join('/proc', entry.name, 'fd', fileDescriptor))
          const match = /^socket:\[(\d+)]$/.exec(target)
          if (match?.[1] && socketInodes.has(match[1])) {
            listenerProcessIds.add(processId)
            break
          }
        } catch {
          // Processes and file descriptors may disappear during inspection.
        }
      }
    }
    return [...listenerProcessIds]
  } catch {
    return null
  }
}

async function readLinuxListenerSocketInodes(port: number): Promise<Set<string> | null> {
  const tables = await Promise.allSettled([
    readFile('/proc/net/tcp', 'utf8'),
    readFile('/proc/net/tcp6', 'utf8')
  ])
  const availableTables = tables.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : []
  )
  if (availableTables.length === 0) return null
  const expectedPort = port.toString(16).toUpperCase().padStart(4, '0')
  const inodes = new Set<string>()

  for (const table of availableTables) {
    for (const line of table.split('\n').slice(1)) {
      const fields = line.trim().split(/\s+/)
      const localAddress = fields[1]
      const listenerState = fields[3]
      const inode = fields[9]
      if (
        localAddress?.split(':').at(-1)?.toUpperCase() === expectedPort &&
        listenerState === '0A' &&
        inode &&
        /^\d+$/.test(inode)
      ) {
        inodes.add(inode)
      }
    }
  }
  return inodes
}

async function readWindowsListenerProcessIds(port: number): Promise<readonly number[] | null> {
  try {
    const { stdout } = await execFileAsync('netstat.exe', ['-ano', '-p', 'tcp'], {
      timeout: 2_000
    })
    const processIds = new Set<number>()
    for (const line of stdout.split(/\r?\n/)) {
      const fields = line.trim().split(/\s+/)
      if (
        fields[0]?.toUpperCase() !== 'TCP' ||
        fields.at(-2)?.toUpperCase() !== 'LISTENING' ||
        !hasEndpointPort(fields[1], port)
      ) {
        continue
      }
      const processId = Number.parseInt(fields.at(-1) ?? '', 10)
      if (Number.isSafeInteger(processId) && processId > 0) processIds.add(processId)
    }
    return [...processIds]
  } catch {
    return null
  }
}

function hasEndpointPort(endpoint: string | undefined, port: number): boolean {
  if (!endpoint) return false
  const separatorIndex = endpoint.lastIndexOf(':')
  return Number.parseInt(endpoint.slice(separatorIndex + 1), 10) === port
}

async function isDescendantOf(
  listenerProcessId: number,
  rootProcessId: number,
  runtimePlatform: NodeJS.Platform
): Promise<boolean> {
  if (listenerProcessId === rootProcessId) {
    return true
  }

  let currentProcessId: number | null = listenerProcessId
  const visited = new Set<number>()
  while (currentProcessId && currentProcessId > 1 && !visited.has(currentProcessId)) {
    if (currentProcessId === rootProcessId) return true
    visited.add(currentProcessId)
    currentProcessId = await readProcessParentId(currentProcessId, runtimePlatform)
  }
  return false
}

function readProcessParentId(
  processId: number,
  runtimePlatform: NodeJS.Platform
): Promise<number | null> {
  if (runtimePlatform === 'linux') return readLinuxProcessParentId(processId)
  if (runtimePlatform === 'win32') return readWindowsProcessParentId(processId)
  return readDarwinProcessParentId(processId)
}

async function readDarwinProcessParentId(processId: number): Promise<number | null> {
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

async function readLinuxProcessParentId(processId: number): Promise<number | null> {
  try {
    const stat = await readFile(join('/proc', String(processId), 'stat'), 'utf8')
    const commandEnd = stat.lastIndexOf(')')
    if (commandEnd < 0) return null
    const fields = stat
      .slice(commandEnd + 1)
      .trim()
      .split(/\s+/)
    const parentProcessId = Number.parseInt(fields[1] ?? '', 10)
    return Number.isSafeInteger(parentProcessId) && parentProcessId > 0 ? parentProcessId : null
  } catch {
    return null
  }
}

async function readWindowsProcessParentId(processId: number): Promise<number | null> {
  try {
    const command = `(Get-CimInstance Win32_Process -Filter "ProcessId = ${processId}").ParentProcessId`
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
      { timeout: 2_000 }
    )
    const parentProcessId = Number.parseInt(stdout.trim(), 10)
    return Number.isSafeInteger(parentProcessId) && parentProcessId > 0 ? parentProcessId : null
  } catch {
    return null
  }
}

async function isProcessAlive(processId: number): Promise<boolean> {
  if (!Number.isSafeInteger(processId) || processId <= 1) return false
  try {
    process.kill(processId, 0)
    return true
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
