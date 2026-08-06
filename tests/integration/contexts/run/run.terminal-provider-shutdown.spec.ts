import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { connect, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type {
  StartTerminalProcessCommand,
  TerminalProcessPort
} from '../../../../src/contexts/run/application/ports/TerminalProcessPort'
import type { TerminalSessionSnapshot } from '../../../../src/contexts/run/application/dto/TerminalSessionSnapshot'
import { TerminalProviderServer } from '../../../../src/contexts/run/infrastructure/provider/TerminalProviderServer'
import { createProviderEndpoint } from '../../../../src/contexts/run/infrastructure/provider/PersistentTerminalProviderClientSupport'
import {
  encodeTerminalProviderFrame,
  type TerminalProviderApplicationDetachReceipt,
  type TerminalProviderApplicationDetachResult,
  TerminalProviderFrameDecoder,
  type TerminalProviderResponse,
  terminalProviderProtocolVersion
} from '../../../../src/contexts/run/infrastructure/provider/TerminalProviderProtocol'

describe('terminal provider application shutdown', () => {
  let rootDirectory = ''
  let endpoint = ''
  let server: TerminalProviderServer | null = null

  beforeEach(async () => {
    rootDirectory = await mkdtemp(join(tmpdir(), 'cc-provider-shutdown-'))
    endpoint = createProviderEndpoint(rootDirectory)
  })

  afterEach(async () => {
    await server?.close()
    await rm(rootDirectory, { force: true, recursive: true })
  })

  it('acknowledges one Provider-owned release and does not duplicate it after disconnect', async () => {
    const processes = new ControlledProcessPort()
    server = createServer(processes)
    await server.start()
    const client = await TestProviderClient.connect(endpoint)
    await claimController(client)
    for (let index = 0; index < 10; index += 1) {
      await createAndStart(client, identity(`default-${index}`))
    }
    const retained = identity('retained')
    await createAndStart(client, retained)
    await client.request('setRetention', {
      sessionId: retained.sessionId,
      retentionPolicy: 'keep-after-application-exit'
    })

    const first =
      await client.request<TerminalProviderApplicationDetachReceipt>('beginApplicationDetach')
    const repeated =
      await client.request<TerminalProviderApplicationDetachReceipt>('beginApplicationDetach')

    expect(repeated).toEqual(first)
    await vi.waitFor(() => expect(processes.stops).toHaveLength(8))
    const awaiting = client.request('awaitApplicationDetach', {
      releaseId: first.releaseId
    })
    void awaiting.catch(() => undefined)
    client.close()
    processes.releaseStops()
    await vi.waitFor(() => expect(processes.stops).toHaveLength(10))

    const reattached = await TestProviderClient.connect(endpoint)
    await vi.waitFor(async () => {
      await expect(claimController(reattached, 'controller-2')).resolves.toBeDefined()
    })
    const listed = await reattached.request<{
      readonly sessions: readonly TerminalSessionSnapshot[]
    }>('listSessions')
    expect(listed.sessions.map(({ sessionId }) => sessionId)).toEqual(['retained'])
    expect(new Set(processes.stops).size).toBe(10)
    reattached.close()
  })

  it('quarantines an unverified process without blocking a replacement controller', async () => {
    const processes = new ControlledProcessPort(new Set(['failed-stop']))
    const onExitRequested = vi.fn()
    server = createServer(processes, onExitRequested)
    await server.start()
    const client = await TestProviderClient.connect(endpoint)
    await claimController(client)
    await createAndStart(client, identity('failed-stop'))

    const receipt =
      await client.request<TerminalProviderApplicationDetachReceipt>('beginApplicationDetach')
    processes.releaseStops()
    const result = await client.request<TerminalProviderApplicationDetachResult>(
      'awaitApplicationDetach',
      { releaseId: receipt.releaseId }
    )

    expect(result).toEqual({
      releaseId: receipt.releaseId,
      outcome: 'partial-failure',
      terminateCandidateCount: 1,
      retainedSessionCount: 0,
      stoppedSessionCount: 0,
      retiredSessionCount: 0,
      failureCount: 1
    })
    const reattached = await TestProviderClient.connect(endpoint)
    const health = await reattached.request<{ readonly controllerState: string }>('health')
    expect(health.controllerState).toBe('unclaimed')
    await expect(claimController(reattached, 'controller-2')).resolves.toBeDefined()
    const listed = await reattached.request<{
      readonly sessions: readonly TerminalSessionSnapshot[]
    }>('listSessions')
    expect(listed.sessions).toEqual([])
    await expectNoCall(onExitRequested)
    reattached.close()
  })

  function createServer(processes: TerminalProcessPort, onExitRequested?: () => void) {
    return new TerminalProviderServer({
      endpoint,
      authToken: 'secret-token',
      instanceId: 'provider-1',
      recoveryDirectory: join(rootDirectory, 'recovery'),
      processes,
      onExitRequested
    })
  }
})

class ControlledProcessPort implements TerminalProcessPort {
  readonly starts = new Map<string, StartTerminalProcessCommand>()
  readonly stops: string[] = []
  private readonly stopGate = deferred<void>()

  constructor(private readonly failedSessions: ReadonlySet<string> = new Set()) {}

  async start(command: StartTerminalProcessCommand) {
    this.starts.set(command.scope.sessionId, command)
    return { processId: 4000 + this.starts.size }
  }

  write(): void {}
  resize(): void {}
  pauseOutput(): void {}
  resumeOutput(): void {}
  async readWorkingDirectory(): Promise<string> {
    return '/work/app'
  }

  async stop(sessionId: string): Promise<void> {
    this.stops.push(sessionId)
    await this.stopGate.promise
    if (this.failedSessions.has(sessionId)) throw new Error('process is still alive')
    const command = this.starts.get(sessionId)
    command?.onExit({ scope: command.scope, sessionId, exitCode: 0 })
  }

  async disposeAll(): Promise<void> {
    await Promise.all([...this.starts.keys()].map((sessionId) => this.stop(sessionId)))
  }

  releaseStops(): void {
    this.stopGate.resolve()
  }
}

class TestProviderClient {
  private readonly decoder = new TerminalProviderFrameDecoder()
  private readonly responses = new Map<
    string,
    { readonly resolve: (value: unknown) => void; readonly reject: (error: unknown) => void }
  >()
  private controllerLeaseId: string | undefined

  private constructor(private readonly socket: Socket) {
    socket.on('data', (chunk) => {
      for (const message of this.decoder.push(chunk)) this.accept(message)
    })
    socket.on('close', () => {
      for (const pending of this.responses.values()) {
        pending.reject(new Error('Provider connection closed.'))
      }
      this.responses.clear()
    })
  }

  static async connect(endpoint: string): Promise<TestProviderClient> {
    const socket = connect(endpoint)
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve)
      socket.once('error', reject)
    })
    return new TestProviderClient(socket)
  }

  request<T = void>(method: string, params?: unknown): Promise<T> {
    const requestId = randomUUID()
    this.socket.write(
      encodeTerminalProviderFrame({
        type: 'request',
        protocolVersion: terminalProviderProtocolVersion,
        requestId,
        authToken: 'secret-token',
        controllerLeaseId: this.controllerLeaseId,
        method,
        params
      })
    )
    return new Promise<T>((resolve, reject) => {
      this.responses.set(requestId, {
        resolve: (value) => {
          if (
            method === 'claimController' &&
            typeof value === 'object' &&
            value !== null &&
            'controllerLeaseId' in value &&
            typeof value.controllerLeaseId === 'string'
          ) {
            this.controllerLeaseId = value.controllerLeaseId
          }
          resolve(value as T)
        },
        reject
      })
    })
  }

  close(): void {
    this.socket.destroy()
  }

  private accept(value: unknown): void {
    const response = value as TerminalProviderResponse
    if (response.type !== 'response') return
    const pending = this.responses.get(response.requestId)
    if (!pending) return
    this.responses.delete(response.requestId)
    if (response.ok) pending.resolve(response.result)
    else pending.reject(response.error)
  }
}

async function createAndStart(
  client: TestProviderClient,
  scope: ReturnType<typeof identity>
): Promise<void> {
  await client.request('createModel', {
    command: {
      identity: scope,
      columns: 80,
      rows: 24,
      workingDirectory: '/work/app',
      terminalSourceTheme: 'dark'
    }
  })
  await client.request('startProcess', {
    command: {
      scope,
      workingDirectory: '/work/app',
      columns: 80,
      rows: 24,
      terminalSourceTheme: 'dark',
      sessionKind: 'interactive'
    }
  })
}

function claimController(client: TestProviderClient, controllerId = 'controller-1') {
  return client.request<{ readonly controllerLeaseId: string }>('claimController', {
    controllerId,
    processId: process.pid
  })
}

function identity(sessionId: string) {
  return {
    projectId: 'project-1',
    projectDirectory: '/work/app',
    workspaceId: 'main',
    workspaceDirectory: '/work/app',
    gitBranch: 'main',
    blockId: `block-${sessionId}`,
    sessionId,
    runId: `run-${sessionId}`,
    generation: 1
  }
}

async function expectNoCall(callback: ReturnType<typeof vi.fn>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 100))
  expect(callback).not.toHaveBeenCalled()
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}
