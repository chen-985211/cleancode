import { createHash, randomUUID } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync } from 'node:fs'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { terminalProviderProtocolVersion } from './TerminalProviderProtocol'

export interface TerminalProviderMetadata {
  readonly schemaVersion: 1
  readonly protocolVersion: 1
  readonly instanceId: string
  readonly authToken: string
  readonly endpoint: string
  readonly processId: number
  readonly startedAt: string
}

export async function readProviderMetadata(path: string): Promise<TerminalProviderMetadata | null> {
  try {
    const value: unknown = JSON.parse(await readFile(path, 'utf8'))
    return isProviderMetadata(value) ? value : null
  } catch {
    return null
  }
}

export async function atomicWriteProviderMetadata(
  path: string,
  metadata: TerminalProviderMetadata
): Promise<void> {
  await mkdir(dirname(path), { mode: 0o700, recursive: true })
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  try {
    const handle = await open(temporary, 'wx', 0o600)
    try {
      await handle.writeFile(`${JSON.stringify(metadata)}\n`, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporary, path)
    const directoryHandle = await open(dirname(path), 'r').catch(() => null)
    try {
      await directoryHandle?.sync()
    } finally {
      await directoryHandle?.close()
    }
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

export async function removeStaleProviderMetadata(
  metadata: TerminalProviderMetadata,
  metadataPath: string
): Promise<void> {
  await rm(metadataPath, { force: true })
  if (process.platform !== 'win32') await rm(metadata.endpoint, { force: true })
}

export function createProviderEndpoint(stateDirectory: string): string {
  const suffix = createHash('sha256').update(stateDirectory).digest('hex').slice(0, 24)
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\cleancode-terminal-${suffix}`
    : join(tmpdir(), `cleancode-terminal-${suffix}.sock`)
}

export function isProviderProcessAlive(processId: number): boolean {
  if (!Number.isSafeInteger(processId) || processId <= 0) return false
  try {
    process.kill(processId, 0)
    return true
  } catch {
    return false
  }
}

export async function providerEndpointAcceptsConnections(endpoint: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(endpoint)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

export function rotateProviderLog(path: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  if (!existsSync(path)) return
  try {
    const descriptor = openSync(path, 'w', 0o600)
    closeSync(descriptor)
  } catch {
    // Provider startup can continue when diagnostics rotation is unavailable.
  }
}

export async function acquireProviderLaunchLock(
  path: string
): Promise<Awaited<ReturnType<typeof open>> | null> {
  try {
    return await createLaunchLock(path)
  } catch (error) {
    if (getNodeErrorCode(error) !== 'EEXIST') throw error
  }
  const ownerProcessId = await readLaunchLockProcessId(path)
  if (ownerProcessId === null || isProviderProcessAlive(ownerProcessId)) return null
  await rm(path, { force: true })
  try {
    return await createLaunchLock(path)
  } catch (error) {
    if (getNodeErrorCode(error) === 'EEXIST') return null
    throw error
  }
}

export function delayProviderOperation(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs))
}

export function getProviderErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isProviderMetadata(value: unknown): value is TerminalProviderMetadata {
  return (
    typeof value === 'object' &&
    value !== null &&
    'schemaVersion' in value &&
    value.schemaVersion === 1 &&
    'protocolVersion' in value &&
    value.protocolVersion === terminalProviderProtocolVersion &&
    'instanceId' in value &&
    typeof value.instanceId === 'string' &&
    'authToken' in value &&
    typeof value.authToken === 'string' &&
    'endpoint' in value &&
    typeof value.endpoint === 'string' &&
    'processId' in value &&
    typeof value.processId === 'number' &&
    'startedAt' in value &&
    typeof value.startedAt === 'string'
  )
}

function getNodeErrorCode(error: unknown): string | null {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : null
}

async function createLaunchLock(path: string): Promise<Awaited<ReturnType<typeof open>>> {
  const handle = await open(path, 'wx', 0o600)
  try {
    await handle.writeFile(`${JSON.stringify({ processId: process.pid })}\n`, 'utf8')
    await handle.sync()
    return handle
  } catch (error) {
    await handle.close()
    await rm(path, { force: true })
    throw error
  }
}

async function readLaunchLockProcessId(path: string): Promise<number | null> {
  try {
    const value: unknown = JSON.parse(await readFile(path, 'utf8'))
    return typeof value === 'object' &&
      value !== null &&
      'processId' in value &&
      typeof value.processId === 'number'
      ? value.processId
      : null
  } catch {
    return null
  }
}
