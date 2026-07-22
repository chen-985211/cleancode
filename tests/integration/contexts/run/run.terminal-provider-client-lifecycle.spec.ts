import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { PersistentTerminalProviderClient } from '../../../../src/contexts/run/infrastructure/provider/PersistentTerminalProviderClient'
import {
  atomicWriteProviderMetadata,
  createProviderEndpoint
} from '../../../../src/contexts/run/infrastructure/provider/PersistentTerminalProviderClientSupport'
import {
  encodeTerminalProviderFrame,
  TerminalProviderFrameDecoder,
  type TerminalProviderRequest,
  terminalProviderProtocolVersion
} from '../../../../src/contexts/run/infrastructure/provider/TerminalProviderProtocol'

describe('persistent terminal provider client lifecycle', () => {
  let rootDirectory = ''
  let provider: ControllableProvider

  beforeEach(async () => {
    rootDirectory = await mkdtemp(join(tmpdir(), 'cc-provider-client-'))
    provider = new ControllableProvider(createProviderEndpoint(rootDirectory))
    await provider.start()
    await atomicWriteProviderMetadata(join(rootDirectory, 'provider.json'), {
      schemaVersion: 1,
      protocolVersion: provider.protocolVersion,
      instanceId: provider.instanceId,
      authToken: provider.authToken,
      endpoint: provider.endpoint,
      processId: process.pid,
      startedAt: new Date().toISOString()
    })
  })

  afterEach(async () => {
    await provider.close()
    await rm(rootDirectory, { force: true, recursive: true })
  })

  it('replays the latest scrollback setting after connecting without a disconnected warning', async () => {
    const backgroundErrors = vi.fn()
    const client = createClient(rootDirectory, backgroundErrors)

    client.setScrollbackRows(5000)
    await client.initialize()

    expect(backgroundErrors).not.toHaveBeenCalled()
    expect(provider.requests.filter(({ method }) => method === 'setScrollbackRows')).toEqual([
      expect.objectContaining({ params: { rows: 5000 } })
    ])
    await client.detachApplication()
  })

  it('replays the latest scrollback setting before a lazy reconnect request', async () => {
    const client = createClient(rootDirectory)
    client.setScrollbackRows(10000)

    await client.readWorkingDirectory('missing-session')

    expect(provider.requests.map(({ method }) => method)).toEqual([
      'health',
      'claimController',
      'setScrollbackRows',
      'readWorkingDirectory'
    ])
    expect(provider.requests[2]?.params).toEqual({ rows: 10000 })
    await client.detachApplication()
  })

  it('retries a releasing controller on the same connection before initialization continues', async () => {
    provider.rejectControllerClaims(2)
    const client = createClient(rootDirectory)

    await client.initialize()

    expect(provider.connectionCount).toBe(1)
    expect(provider.requests.filter(({ method }) => method === 'claimController')).toHaveLength(3)
    expect(provider.requests.at(-1)?.method).toBe('listSessions')
    await client.detachApplication()
  })

  it('keeps one-version compatibility while the previous provider owns live sessions', async () => {
    await provider.close()
    provider = new ControllableProvider(
      createProviderEndpoint(rootDirectory),
      terminalProviderProtocolVersion - 1
    )
    await provider.start()
    await atomicWriteProviderMetadata(join(rootDirectory, 'provider.json'), {
      schemaVersion: 1,
      protocolVersion: terminalProviderProtocolVersion - 1,
      instanceId: provider.instanceId,
      authToken: provider.authToken,
      endpoint: provider.endpoint,
      processId: process.pid,
      startedAt: new Date().toISOString()
    })
    const client = createClient(rootDirectory)

    await client.initialize()

    expect(provider.requests.map(({ method }) => method)).toEqual([
      'health',
      'claimController',
      'setScrollbackRows',
      'listSessions'
    ])
    await client.detachApplication()
  })

  it('shares one connection attempt across concurrent initialization callers', async () => {
    provider.pauseHealthResponses()
    const client = createClient(rootDirectory)

    const initializations = Promise.all([client.initialize(), client.initialize()])
    await provider.waitForRequests('health', 1)

    try {
      // A second connection would be observable within the bounded startup coordination window.
      await expectNoAdditionalConnections(provider, 1, 150)
    } finally {
      provider.resumeHealthResponses()
      await initializations.catch(() => undefined)
    }

    expect(provider.connectionCount).toBe(1)
    await client.detachApplication()
  })

  it('publishes runtime unavailability when an established Provider disconnects', async () => {
    const runtimeUnavailable = vi.fn()
    const client = createClient(rootDirectory, undefined, runtimeUnavailable)

    await client.initialize()
    provider.disconnectClients()

    await vi.waitFor(() =>
      expect(runtimeUnavailable).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'TERMINAL_PROVIDER_UNAVAILABLE' })
      )
    )
    await client.detachApplication()
  })

  it('routes only matching foreground job lifecycle events to the launch callback', async () => {
    const client = createClient(rootDirectory)
    const onStarted = vi.fn()
    const onExit = vi.fn()
    await client.initialize()

    client.launchForegroundJob({
      args: ['--resume', 'conversation-1'],
      environment: {},
      executable: 'fake-agent',
      generation: 2,
      launchId: 'launch-2',
      onExit,
      onStarted,
      sessionId: 'session-1'
    })
    await provider.waitForRequests('launchForegroundJob', 1)
    provider.emitEvent('foreground-job-started', {
      generation: 1,
      launchId: 'stale-launch',
      sessionId: 'session-1'
    })
    provider.emitEvent('foreground-job-started', {
      generation: 2,
      launchId: 'launch-2',
      sessionId: 'session-1'
    })
    provider.emitEvent('foreground-job-exited', {
      exitCode: 130,
      generation: 2,
      launchId: 'launch-2',
      sessionId: 'session-1'
    })

    await vi.waitFor(() => expect(onStarted).toHaveBeenCalledTimes(1))
    expect(onStarted).toHaveBeenCalledWith({
      generation: 2,
      launchId: 'launch-2',
      sessionId: 'session-1'
    })
    await vi.waitFor(() =>
      expect(onExit).toHaveBeenCalledWith(expect.objectContaining({ exitCode: 130 }))
    )
    await client.detachApplication()
  })

  it('waits for an in-flight connection before detaching the application', async () => {
    provider.pauseHealthResponses()
    const client = createClient(rootDirectory)
    const initialization = client.initialize()
    await provider.waitForRequests('health', 1)

    const detachment = client.detachApplication()
    const detachedImmediately = await Promise.race([
      detachment.then(() => true),
      Promise.resolve(false)
    ])

    expect(detachedImmediately).toBe(false)
    provider.resumeHealthResponses()
    const [, detachmentResult] = await Promise.allSettled([initialization, detachment])
    expect(detachmentResult.status).toBe('fulfilled')
    expect(provider.requests.some(({ method }) => method === 'detachApplication')).toBe(true)
  })
})

function createClient(
  rootDirectory: string,
  onBackgroundError?: (error: unknown) => void,
  onRuntimeUnavailable?: (error: unknown) => void
) {
  return new PersistentTerminalProviderClient({
    stateDirectory: rootDirectory,
    providerEntryPath: join(rootDirectory, 'unused-provider-entry.js'),
    onBackgroundError,
    onRuntimeUnavailable
  })
}

async function expectNoAdditionalConnections(
  provider: ControllableProvider,
  expectedCount: number,
  observationMs: number
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      clearInterval(interval)
      resolve()
    }, observationMs)
    const interval = setInterval(() => {
      if (provider.connectionCount === expectedCount) return
      clearTimeout(timeout)
      clearInterval(interval)
      reject(
        new Error(
          `Expected ${expectedCount} Provider connection, received ${provider.connectionCount}.`
        )
      )
    }, 5)
    timeout.unref()
    interval.unref()
  })
}

class ControllableProvider {
  readonly authToken = 'provider-client-secret'
  readonly instanceId = 'provider-client-instance'
  readonly requests: TerminalProviderRequest[] = []
  connectionCount = 0
  private readonly sockets = new Set<Socket>()
  private server: Server | null = null
  private healthResponses: Deferred | null = null
  private rejectedControllerClaims = 0

  constructor(
    readonly endpoint: string,
    readonly protocolVersion: number = terminalProviderProtocolVersion
  ) {}

  async start(): Promise<void> {
    await rm(this.endpoint, { force: true })
    await new Promise<void>((resolve, reject) => {
      this.server = createServer((socket) => this.accept(socket))
      this.server.once('error', reject)
      this.server.listen(this.endpoint, () => {
        this.server?.off('error', reject)
        resolve()
      })
    })
  }

  async close(): Promise<void> {
    this.resumeHealthResponses()
    for (const socket of this.sockets) socket.destroy()
    await new Promise<void>((resolve) => {
      if (!this.server) return resolve()
      this.server.close(() => resolve())
    })
    await rm(this.endpoint, { force: true })
  }

  pauseHealthResponses(): void {
    this.healthResponses = createDeferred()
  }

  resumeHealthResponses(): void {
    this.healthResponses?.resolve()
    this.healthResponses = null
  }

  rejectControllerClaims(count: number): void {
    this.rejectedControllerClaims = count
  }

  disconnectClients(): void {
    for (const socket of this.sockets) socket.destroy()
  }

  emitEvent(event: string, payload: unknown): void {
    for (const socket of this.sockets) {
      socket.write(encodeTerminalProviderFrame({ event, payload, type: 'event' }))
    }
  }

  async waitForRequests(method: string, count: number): Promise<void> {
    await vi.waitFor(() => {
      expect(
        this.requests.filter((request) => request.method === method).length
      ).toBeGreaterThanOrEqual(count)
    })
  }

  private accept(socket: Socket): void {
    this.connectionCount += 1
    this.sockets.add(socket)
    const decoder = new TerminalProviderFrameDecoder()
    let requestTail = Promise.resolve()
    socket.on('data', (chunk) => {
      for (const value of decoder.push(chunk)) {
        requestTail = requestTail.then(() => this.respond(socket, value as TerminalProviderRequest))
      }
    })
    socket.on('close', () => this.sockets.delete(socket))
  }

  private async respond(socket: Socket, request: TerminalProviderRequest): Promise<void> {
    this.requests.push(request)
    if (request.method === 'health') await this.healthResponses?.promise
    if (request.method === 'claimController' && this.rejectedControllerClaims > 0) {
      this.rejectedControllerClaims -= 1
      socket.write(
        encodeTerminalProviderFrame({
          type: 'response',
          requestId: request.requestId,
          ok: false,
          error: {
            code: 'TERMINAL_PROVIDER_CONTROLLER_BUSY',
            isExpected: true,
            message: 'Terminal provider controller is releasing.',
            details: { retryAfterMs: 1 }
          }
        })
      )
      return
    }
    const result = this.resultFor(request.method, socket)
    socket.write(
      encodeTerminalProviderFrame({
        type: 'response',
        requestId: request.requestId,
        ok: true,
        result
      })
    )
  }

  private resultFor(method: string, socket: Socket): unknown {
    if (method === 'health') {
      return {
        instanceId: this.instanceId,
        protocolVersion: this.protocolVersion,
        controllerState: 'unclaimed'
      }
    }
    if (method === 'claimController') return { controllerLeaseId: 'controller-lease-1' }
    if (method === 'listSessions') {
      return { sessions: [], issues: [], managedServiceEndpoints: [] }
    }
    if (method === 'detachApplication') setTimeout(() => socket.end(), 0)
    return undefined
  }
}

interface Deferred {
  readonly promise: Promise<void>
  resolve(): void
}

function createDeferred(): Deferred {
  let resolve!: () => void
  const promise = new Promise<void>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}
