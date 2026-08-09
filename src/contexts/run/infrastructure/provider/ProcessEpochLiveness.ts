import { randomUUID } from 'node:crypto'
import { rmSync } from 'node:fs'
import { mkdir, rm, stat, utimes } from 'node:fs/promises'
import { connect, createServer, type Server } from 'node:net'
import { join } from 'node:path'

export interface ProcessEpochReference {
  readonly schemaVersion: 1
  readonly endpoint: string
  readonly leaseId: string
}

export interface ProcessEpochLease {
  readonly reference: ProcessEpochReference
  assertActive(): Promise<void>
  close(): Promise<void>
}

export type ProcessEpochObservation = 'alive' | 'dead' | 'unknown'

interface ProcessEpochServerState {
  readonly activeLeaseIds: Set<string>
  readonly endpoint: string
  readonly health: { isAvailable: boolean }
  readonly server: Server
}

interface ProcessEpochLocation {
  readonly directory: string | null
  readonly endpoint: string
}

const processEpochProbeTimeoutMs = 250
const processEpochKeepaliveIntervalMs = 30_000
const processEpochLeaseIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
let serverStatePromise: Promise<ProcessEpochServerState> | null = null

export async function createProcessEpochLease(): Promise<ProcessEpochLease> {
  const state = await getProcessEpochServerState()
  const leaseId = randomUUID()
  state.activeLeaseIds.add(leaseId)
  return new SharedProcessEpochLease(state, leaseId)
}

export function isProcessEpochReference(value: unknown): value is ProcessEpochReference {
  return (
    typeof value === 'object' &&
    value !== null &&
    'schemaVersion' in value &&
    value.schemaVersion === 1 &&
    'endpoint' in value &&
    typeof value.endpoint === 'string' &&
    value.endpoint.length > 0 &&
    value.endpoint.length <= 512 &&
    'leaseId' in value &&
    typeof value.leaseId === 'string' &&
    processEpochLeaseIdPattern.test(value.leaseId)
  )
}

export async function observeProcessEpoch(
  reference: ProcessEpochReference
): Promise<ProcessEpochObservation> {
  if (!isProcessEpochReference(reference)) return 'unknown'
  return new Promise((resolve) => {
    let settled = false
    let timer: NodeJS.Timeout | null = null
    const socket = connect(reference.endpoint)
    const finish = (observation: ProcessEpochObservation): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      socket.destroy()
      resolve(observation)
    }
    timer = setTimeout(() => finish('unknown'), processEpochProbeTimeoutMs)
    timer.unref()
    socket.once('connect', () => socket.write(`${reference.leaseId}\n`))
    socket.once('data', (data) => {
      const response = data.toString('utf8', 0, 1)
      finish(response === '1' ? 'alive' : response === '0' ? 'dead' : 'unknown')
    })
    socket.once('error', (error) => finish(isMissingProcessEpochError(error) ? 'dead' : 'unknown'))
    socket.once('end', () => finish('unknown'))
  })
}

class SharedProcessEpochLease implements ProcessEpochLease {
  readonly reference: ProcessEpochReference
  private isClosed = false

  constructor(
    private readonly state: ProcessEpochServerState,
    private readonly leaseId: string
  ) {
    this.reference = {
      schemaVersion: 1,
      endpoint: state.endpoint,
      leaseId
    }
  }

  async assertActive(): Promise<void> {
    if (
      this.isClosed ||
      !this.state.health.isAvailable ||
      !this.state.activeLeaseIds.has(this.leaseId)
    ) {
      throw new Error('Process epoch ownership was lost.')
    }
  }

  close(): Promise<void> {
    if (!this.isClosed) {
      this.isClosed = true
      this.state.activeLeaseIds.delete(this.leaseId)
    }
    return Promise.resolve()
  }
}

function getProcessEpochServerState(): Promise<ProcessEpochServerState> {
  if (serverStatePromise) return serverStatePromise
  const pending = startProcessEpochServer()
  serverStatePromise = pending
  void pending.catch(() => {
    if (serverStatePromise === pending) serverStatePromise = null
  })
  return pending
}

async function startProcessEpochServer(): Promise<ProcessEpochServerState> {
  const location = await createProcessEpochLocation()
  const activeLeaseIds = new Set<string>()
  const health = { isAvailable: true }
  const server = createServer((socket) => {
    let input = ''
    let completed = false
    const complete = (response?: '0' | '1'): void => {
      if (completed) return
      completed = true
      socket.off('data', onData)
      if (response) socket.end(response)
      else socket.destroy()
    }
    const onData = (chunk: string): void => {
      if (completed) return
      input += chunk
      const newlineIndex = input.indexOf('\n')
      if (newlineIndex < 0) {
        if (input.length > 128) complete()
        return
      }
      const leaseId = input.slice(0, newlineIndex)
      complete(processEpochLeaseIdPattern.test(leaseId) && activeLeaseIds.has(leaseId) ? '1' : '0')
    }
    socket.setEncoding('utf8')
    socket.setTimeout(processEpochProbeTimeoutMs, () => complete())
    socket.on('error', () => complete())
    socket.on('data', onData)
  })
  try {
    await listenForProcessEpoch(server, location.endpoint)
  } catch (error) {
    if (location.directory) {
      await rm(location.directory, { force: true, recursive: true }).catch(() => undefined)
    }
    throw error
  }
  server.on('error', () => {
    health.isAvailable = false
  })
  server.on('close', () => {
    health.isAvailable = false
  })
  server.unref()
  if (location.directory) {
    const keepalive = setInterval(() => {
      void refreshProcessEpochLocation(location).catch(() => {
        health.isAvailable = false
      })
    }, processEpochKeepaliveIntervalMs)
    keepalive.unref()
    process.once('exit', () => rmSync(location.directory!, { force: true, recursive: true }))
  }
  return { activeLeaseIds, endpoint: location.endpoint, health, server }
}

async function listenForProcessEpoch(server: Server, endpoint: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = (): void => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(endpoint)
  })
}

async function createProcessEpochLocation(): Promise<ProcessEpochLocation> {
  const token = randomUUID().replaceAll('-', '').slice(0, 16)
  if (process.platform === 'win32') {
    return {
      directory: null,
      endpoint: `\\\\.\\pipe\\cleancode-lock-epoch-${process.pid}-${token}`
    }
  }
  const uid = process.getuid?.() ?? process.pid
  const directory = `/tmp/.cc-e-${uid}-${token}`
  await mkdir(directory, { mode: 0o700 })
  return { directory, endpoint: join(directory, 'e') }
}

async function refreshProcessEpochLocation(location: ProcessEpochLocation): Promise<void> {
  if (!location.directory) return
  await stat(location.endpoint)
  const now = new Date()
  await utimes(location.directory, now, now)
}

function isMissingProcessEpochError(error: unknown): boolean {
  const code = getErrorCode(error)
  return code === 'ENOENT' || code === 'ENOTDIR' || code === 'ECONNREFUSED'
}

function getErrorCode(error: unknown): string | null {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : null
}
