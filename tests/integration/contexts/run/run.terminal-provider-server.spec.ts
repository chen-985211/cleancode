import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { connect, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type {
  LaunchForegroundJobProcessCommand,
  StartTerminalProcessCommand,
  TerminalProcessPort
} from '../../../../src/contexts/run/application/ports/TerminalProcessPort'
import type { TerminalSessionSnapshot } from '../../../../src/contexts/run/application/dto/TerminalSessionSnapshot'
import type { TerminalSnapshot } from '../../../../src/contexts/run/application/dto/TerminalModelSnapshot'
import { FileTerminalRecoveryStore } from '../../../../src/contexts/run/infrastructure/persistence/FileTerminalRecoveryStore'
import { TerminalProviderServer } from '../../../../src/contexts/run/infrastructure/provider/TerminalProviderServer'
import {
  encodeTerminalProviderFrame,
  type TerminalProviderEvent,
  TerminalProviderFrameDecoder,
  type TerminalProviderResponse,
  terminalProviderProtocolVersion
} from '../../../../src/contexts/run/infrastructure/provider/TerminalProviderProtocol'

describe('terminal provider server', () => {
  let rootDirectory = ''
  let endpoint = ''
  let server: TerminalProviderServer | null = null

  beforeEach(async () => {
    rootDirectory = await mkdtemp(join(tmpdir(), 'cc-provider-'))
    endpoint = join(rootDirectory, 'provider.sock')
  })

  afterEach(async () => {
    await server?.close()
    await rm(rootDirectory, { force: true, recursive: true })
  })

  it('requires authentication and warm-attaches to the exact retained live session', async () => {
    const processes = new RecordingProcessPort()
    server = createServer(processes)
    await server.start()

    const unauthorized = await TestProviderClient.connect(endpoint, 'wrong-token')
    await expect(unauthorized.request('health')).rejects.toMatchObject({
      code: 'TERMINAL_PROVIDER_AUTHENTICATION_FAILED'
    })
    unauthorized.close()

    const incompatible = await TestProviderClient.connect(endpoint, 'secret-token')
    await expect(incompatible.request('health', undefined, 99)).rejects.toMatchObject({
      code: 'TERMINAL_PROVIDER_PROTOCOL_UNSUPPORTED'
    })
    incompatible.close()

    const client = await TestProviderClient.connect(endpoint, 'secret-token')
    await claimController(client, 'controller-1')
    await createAndStart(client, 'interactive')
    processes.emitOutput('session-1', 'provider output\r\n')
    await client.waitForEvent('terminal-output')
    await client.request('setRetention', {
      sessionId: 'session-1',
      retentionPolicy: 'keep-after-application-exit'
    })

    const probe = await TestProviderClient.connect(endpoint, 'secret-token')
    const probeHealth = await probe.request<{ readonly controllerState: string }>('health')
    expect(probeHealth.controllerState).toBe('active')
    await expect(probe.request('listSessions')).rejects.toMatchObject({
      code: 'TERMINAL_PROVIDER_UNAVAILABLE'
    })
    probe.close()
    client.close()

    await vi.waitFor(() => expect(processes.stops).not.toContain('session-1'))
    const reattached = await TestProviderClient.connect(endpoint, 'secret-token')
    await vi.waitFor(async () => {
      await expect(claimController(reattached, 'controller-2')).resolves.toBeDefined()
    })
    const recovered = await reattached.request<{
      readonly sessions: readonly TerminalSessionSnapshot[]
    }>('listSessions')
    expect(recovered.sessions).toEqual([
      expect.objectContaining({
        sessionId: 'session-1',
        runId: 'run-1',
        generation: 1,
        processId: 4242,
        status: 'running',
        retentionPolicy: 'keep-after-application-exit',
        recoveryKind: 'warm',
        terminalSourceTheme: 'light'
      })
    ])
    const snapshot = await reattached.request<TerminalSnapshot>('attachView', {
      identity: identity(),
      viewId: 'view-restored'
    })
    expect(snapshot.transcript).toContain('provider output')
    expect(snapshot.terminalSourceTheme).toBe('light')

    await reattached.request('stopProcess', { sessionId: 'session-1' })
    await reattached.request('retireModel', { identity: identity() })
    reattached.close()
  })

  it('keeps health read-only and serializes controller handoff', async () => {
    const processes = new RecordingProcessPort()
    server = createServer(processes)
    await server.start()

    const first = await TestProviderClient.connect(endpoint, 'secret-token')
    const initialHealth = await first.request<{ readonly controllerState: string }>('health')
    expect(initialHealth.controllerState).toBe('unclaimed')
    await expect(first.request('listSessions')).rejects.toMatchObject({
      code: 'TERMINAL_PROVIDER_UNAVAILABLE'
    })

    await claimController(first, 'controller-1')
    await createAndStart(first, 'interactive')
    await first.request('setRetention', {
      sessionId: 'session-1',
      retentionPolicy: 'keep-after-application-exit'
    })

    const second = await TestProviderClient.connect(endpoint, 'secret-token')
    await expect(claimController(second, 'controller-2')).rejects.toMatchObject({
      code: 'TERMINAL_PROVIDER_CONTROLLER_BUSY'
    })

    first.close()
    await vi.waitFor(async () => {
      await expect(claimController(second, 'controller-2')).resolves.toMatchObject({
        controllerLeaseId: expect.any(String)
      })
    })

    const recovered = await second.request<{
      readonly sessions: readonly TerminalSessionSnapshot[]
    }>('listSessions')
    expect(recovered.sessions).toEqual([
      expect.objectContaining({ sessionId: 'session-1', recoveryKind: 'warm' })
    ])
    second.close()
  })

  it('captures PTY output emitted before process startup returns', async () => {
    const processes = new RecordingProcessPort('eager startup output\r\n')
    server = createServer(processes)
    await server.start()
    const client = await TestProviderClient.connect(endpoint, 'secret-token')
    await claimController(client)

    await createAndStart(client, 'interactive')
    const snapshot = await client.request<TerminalSnapshot>('attachView', {
      identity: identity(),
      viewId: 'eager-output-view'
    })

    expect(snapshot.transcript).toContain('eager startup output')
    client.close()
  })

  it('persists a burst of PTY output through one ordered batch append', async () => {
    const processes = new RecordingProcessPort()
    const store = new FileTerminalRecoveryStore({
      rootDirectory: join(rootDirectory, 'recovery')
    })
    const appendOutputs = vi.spyOn(store, 'appendOutputs')
    server = createServer(processes, store, 5)
    await server.start()
    const client = await TestProviderClient.connect(endpoint, 'secret-token')
    await claimController(client)
    await createAndStart(client, 'interactive')

    processes.emitOutput('session-1', 'first')
    processes.emitOutput('session-1', 'second')
    processes.emitOutput('session-1', 'third')
    await client.waitForEvent('terminal-output')

    await vi.waitFor(() => expect(appendOutputs).toHaveBeenCalledOnce())
    expect(appendOutputs.mock.calls[0]?.[1]).toEqual([
      { sequence: 1, data: 'first' },
      { sequence: 2, data: 'second' },
      { sequence: 3, data: 'third' }
    ])
    client.close()
  })

  it('checkpoints output still waiting inside the persistence batch window on detach', async () => {
    const processes = new RecordingProcessPort()
    const store = new FileTerminalRecoveryStore({
      rootDirectory: join(rootDirectory, 'recovery')
    })
    server = createServer(processes, store, 60_000)
    await server.start()
    const client = await TestProviderClient.connect(endpoint, 'secret-token')
    await claimController(client)
    await createAndStart(client, 'interactive')
    await client.request('setRetention', {
      sessionId: 'session-1',
      retentionPolicy: 'keep-after-application-exit'
    })

    processes.emitOutput('session-1', 'pending detach output\r\n')
    await client.waitForEvent('terminal-output')
    await client.request('detachApplication')

    const loaded = await store.load()
    expect(loaded.sessions[0]?.checkpoint.model.transcript).toContain('pending detach output')
    expect(loaded.sessions[0]?.output).toEqual([])
  })

  it('forwards foreground Agent job lifecycle through the Provider protocol', async () => {
    const processes = new RecordingProcessPort()
    server = createServer(processes)
    await server.start()
    const client = await TestProviderClient.connect(endpoint, 'secret-token')
    await claimController(client)
    await createAndStart(client, 'interactive')

    await client.request('launchForegroundJob', {
      foregroundJob: {
        args: ['--resume', 'conversation-1'],
        environment: { AGENT_MODE: 'test' },
        executable: 'fake-agent',
        generation: 2,
        launchId: 'launch-2',
        sessionId: 'session-1'
      }
    })

    expect(processes.foregroundJobs[0]).toMatchObject({
      executable: 'fake-agent',
      generation: 2,
      launchId: 'launch-2',
      sessionId: 'session-1'
    })
    expect((await client.waitForEvent('foreground-job-started')).payload).toEqual({
      generation: 2,
      launchId: 'launch-2',
      sessionId: 'session-1'
    })

    processes.emitForegroundExit('session-1', 130)
    expect((await client.waitForEvent('foreground-job-exited')).payload).toEqual({
      exitCode: 130,
      generation: 2,
      launchId: 'launch-2',
      sessionId: 'session-1'
    })
    client.close()
  })

  it('stops a default session when its application controller disappears', async () => {
    const processes = new RecordingProcessPort()
    const store = new FileTerminalRecoveryStore({
      rootDirectory: join(rootDirectory, 'recovery')
    })
    server = createServer(processes, store)
    await server.start()
    const client = await TestProviderClient.connect(endpoint, 'secret-token')
    await claimController(client)
    await createAndStart(client, 'interactive')

    client.close()

    await vi.waitFor(async () => {
      expect(processes.stops).toContain('session-1')
      expect((await store.load()).sessions).toEqual([])
    })
  })

  it('keeps retention disabled when the required checkpoint cannot be written', async () => {
    const processes = new RecordingProcessPort()
    const store = new FileTerminalRecoveryStore({
      rootDirectory: join(rootDirectory, 'recovery')
    })
    server = createServer(processes, store)
    await server.start()
    const client = await TestProviderClient.connect(endpoint, 'secret-token')
    await claimController(client)
    await createAndStart(client, 'interactive')
    vi.spyOn(store, 'writeCheckpoint').mockRejectedValueOnce(new Error('disk unavailable'))

    await expect(
      client.request('setRetention', {
        sessionId: 'session-1',
        retentionPolicy: 'keep-after-application-exit'
      })
    ).rejects.toBeDefined()

    const recovered = await client.request<{
      readonly sessions: readonly TerminalSessionSnapshot[]
    }>('listSessions')
    expect(recovered.sessions[0]?.retentionPolicy).toBe('terminate-on-application-exit')
    client.close()
  })

  it('revokes retention and reports the session when ongoing persistence becomes unavailable', async () => {
    const processes = new RecordingProcessPort()
    const store = new FileTerminalRecoveryStore({
      rootDirectory: join(rootDirectory, 'recovery')
    })
    server = createServer(processes, store)
    await server.start()
    const client = await TestProviderClient.connect(endpoint, 'secret-token')
    await claimController(client)
    await createAndStart(client, 'interactive')
    await client.request('setRetention', {
      sessionId: 'session-1',
      retentionPolicy: 'keep-after-application-exit'
    })
    vi.spyOn(store, 'appendOutputs').mockRejectedValueOnce(new Error('disk unavailable'))

    processes.emitOutput('session-1', 'cannot persist\r\n')

    const issue = await client.waitForEvent('recovery-issue')
    expect(issue.payload).toEqual({ reason: 'storage-unavailable', sessionId: 'session-1' })
    const recovered = await client.request<{
      readonly sessions: readonly TerminalSessionSnapshot[]
    }>('listSessions')
    expect(recovered.sessions[0]?.retentionPolicy).toBe('terminate-on-application-exit')
    client.close()
  })

  it('downgrades a checkpoint to normal-buffer history after provider loss', async () => {
    const firstProcesses = new RecordingProcessPort()
    server = createServer(firstProcesses)
    await server.start()
    const client = await TestProviderClient.connect(endpoint, 'secret-token')
    await claimController(client)
    await createAndStart(client, 'direct')
    firstProcesses.emitOutput('session-1', 'durable history\r\n')
    firstProcesses.emitOutput('session-1', '\u001b[?1049htransient full-screen')
    await client.waitForEvent('terminal-output')
    await client.request('setRetention', {
      sessionId: 'session-1',
      retentionPolicy: 'keep-after-application-exit'
    })
    await server.close()
    server = createServer(new RecordingProcessPort())
    await server.start()

    const restored = await TestProviderClient.connect(endpoint, 'secret-token')
    await claimController(restored)
    const recovered = await restored.request<{
      readonly sessions: readonly TerminalSessionSnapshot[]
    }>('listSessions')
    expect(recovered.sessions[0]).toMatchObject({
      status: 'exited',
      processId: null,
      recoveryKind: 'historical'
    })
    const snapshot = await restored.request<TerminalSnapshot>('attachView', {
      identity: identity(),
      viewId: 'history-view'
    })
    expect(snapshot.transcript).toContain('durable history')
    expect(snapshot.transcript).not.toContain('transient full-screen')
    restored.close()
  })

  it('does not cold-restore a session that never opted into retention', async () => {
    server = createServer(new RecordingProcessPort())
    await server.start()
    const client = await TestProviderClient.connect(endpoint, 'secret-token')
    await claimController(client)
    await createAndStart(client, 'interactive')
    await server.close()
    server = createServer(new RecordingProcessPort())
    await server.start()

    const restored = await TestProviderClient.connect(endpoint, 'secret-token')
    await claimController(restored)
    const recovered = await restored.request<{
      readonly sessions: readonly TerminalSessionSnapshot[]
    }>('listSessions')

    expect(recovered.sessions).toEqual([])
    restored.close()
  })

  function createServer(
    processes: TerminalProcessPort,
    store?: FileTerminalRecoveryStore,
    outputPersistenceBatchWindowMs?: number
  ) {
    return new TerminalProviderServer({
      endpoint,
      authToken: 'secret-token',
      instanceId: 'provider-1',
      recoveryDirectory: join(rootDirectory, 'recovery'),
      processes,
      store,
      outputPersistenceBatchWindowMs
    })
  }
})

class RecordingProcessPort implements TerminalProcessPort {
  readonly foregroundJobs: LaunchForegroundJobProcessCommand[] = []
  readonly starts: StartTerminalProcessCommand[] = []
  readonly stops: string[] = []

  constructor(private readonly outputOnStart?: string) {}

  async start(command: StartTerminalProcessCommand) {
    this.starts.push(command)
    if (this.outputOnStart) {
      command.onOutput({
        scope: command.scope,
        sessionId: command.scope.sessionId,
        data: this.outputOnStart
      })
    }
    return { processId: 4242 }
  }

  launchForegroundJob(command: LaunchForegroundJobProcessCommand): void {
    this.foregroundJobs.push(command)
    command.onStarted(command)
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
    const command = this.starts.find((candidate) => candidate.scope.sessionId === sessionId)
    command?.onExit({ scope: command.scope, sessionId, exitCode: 0 })
  }
  async disposeAll(): Promise<void> {
    await Promise.all(this.starts.map((command) => this.stop(command.scope.sessionId)))
  }
  emitOutput(sessionId: string, data: string): void {
    const command = this.starts.find((candidate) => candidate.scope.sessionId === sessionId)
    if (!command) throw new Error('Missing provider process.')
    command.onOutput({ scope: command.scope, sessionId, data })
  }

  emitForegroundExit(sessionId: string, exitCode: number | null): void {
    const command = this.foregroundJobs.find((candidate) => candidate.sessionId === sessionId)
    if (!command) throw new Error('Missing foreground job.')
    command.onExit({ ...command, exitCode })
  }
}

class TestProviderClient {
  private readonly decoder = new TerminalProviderFrameDecoder()
  private readonly responses = new Map<
    string,
    { readonly resolve: (value: unknown) => void; readonly reject: (error: unknown) => void }
  >()
  private readonly events: TerminalProviderEvent[] = []

  private constructor(
    private readonly socket: Socket,
    private readonly authToken: string
  ) {
    socket.on('data', (chunk) => {
      for (const message of this.decoder.push(chunk)) this.accept(message)
    })
  }

  static async connect(endpoint: string, authToken: string): Promise<TestProviderClient> {
    const socket = connect(endpoint)
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve)
      socket.once('error', reject)
    })
    return new TestProviderClient(socket, authToken)
  }

  request<T = void>(
    method: string,
    params?: unknown,
    protocolVersion = terminalProviderProtocolVersion
  ): Promise<T> {
    const requestId = randomUUID()
    this.socket.write(
      encodeTerminalProviderFrame({
        type: 'request',
        protocolVersion,
        requestId,
        authToken: this.authToken,
        method,
        params
      })
    )
    return new Promise<T>((resolve, reject) => {
      this.responses.set(requestId, {
        resolve: (value) => resolve(value as T),
        reject
      })
    })
  }

  async waitForEvent(event: TerminalProviderEvent['event']): Promise<TerminalProviderEvent> {
    await vi.waitFor(() =>
      expect(this.events.some((candidate) => candidate.event === event)).toBe(true)
    )
    return this.events.find((candidate) => candidate.event === event) as TerminalProviderEvent
  }

  close(): void {
    this.socket.destroy()
  }

  private accept(value: unknown): void {
    const message = value as TerminalProviderResponse | TerminalProviderEvent
    if (message.type === 'event') {
      this.events.push(message)
      return
    }
    const pending = this.responses.get(message.requestId)
    if (!pending) return
    this.responses.delete(message.requestId)
    if (message.ok) pending.resolve(message.result)
    else pending.reject(message.error)
  }
}

async function createAndStart(
  client: TestProviderClient,
  sessionKind: 'interactive' | 'direct' | 'workflow'
): Promise<void> {
  await client.request('createModel', {
    command: {
      identity: identity(),
      columns: 80,
      rows: 24,
      workingDirectory: '/work/app',
      terminalSourceTheme: 'light'
    }
  })
  await client.request('startProcess', {
    command: {
      scope: identity(),
      workingDirectory: '/work/app',
      columns: 80,
      rows: 24,
      terminalSourceTheme: 'light',
      sessionKind
    }
  })
}

function claimController(client: TestProviderClient, controllerId = 'controller-1') {
  return client.request<{ readonly controllerLeaseId: string }>('claimController', {
    controllerId,
    processId: process.pid
  })
}

function identity() {
  return {
    projectId: 'project-1',
    projectDirectory: '/work/app',
    workspaceName: 'main',
    workspaceDirectory: '/work/app',
    gitBranch: 'main',
    blockId: 'block-1',
    sessionId: 'session-1',
    runId: 'run-1',
    generation: 1
  }
}
