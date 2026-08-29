import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  PersistentTerminalProviderClient,
  type PersistentTerminalProviderClientOptions
} from '../../../../src/contexts/run/infrastructure/provider/PersistentTerminalProviderClient'
import {
  atomicWriteProviderMetadata,
  createProviderEndpoint
} from '../../../../src/contexts/run/infrastructure/provider/PersistentTerminalProviderClientSupport'
import {
  terminalProviderMinimumCompatibleProtocolVersion,
  terminalProviderProtocolVersion
} from '../../../../src/contexts/run/infrastructure/provider/TerminalProviderProtocol'
import { ControllableTerminalProvider } from '../../../support/controllableTerminalProvider'

describe('persistent terminal provider client lifecycle', () => {
  let rootDirectory = ''
  let provider: ControllableTerminalProvider

  beforeEach(async () => {
    rootDirectory = await mkdtemp(join(tmpdir(), 'cc-provider-client-'))
    provider = new ControllableTerminalProvider(createProviderEndpoint(rootDirectory))
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

  it('refuses to reuse a Provider from before the terminal environment boundary', async () => {
    await provider.close()
    provider = new ControllableTerminalProvider(
      createProviderEndpoint(rootDirectory),
      terminalProviderMinimumCompatibleProtocolVersion - 1
    )
    await provider.start()
    await atomicWriteProviderMetadata(join(rootDirectory, 'provider.json'), {
      schemaVersion: 1,
      protocolVersion: terminalProviderMinimumCompatibleProtocolVersion - 1,
      instanceId: provider.instanceId,
      authToken: provider.authToken,
      endpoint: provider.endpoint,
      processId: process.pid,
      startedAt: new Date().toISOString()
    })
    const client = createClient(rootDirectory)

    await expect(client.initialize()).rejects.toMatchObject({
      code: 'TERMINAL_PROVIDER_UNAVAILABLE'
    })
    expect(provider.requests).toEqual([])
  })

  it('receives a shutdown handoff before waiting for the current Provider to finish', async () => {
    provider.pauseApplicationDetachCompletion()
    const client = createClient(rootDirectory)
    await client.initialize()

    let detachSettled = false
    const detach = client.detachApplication().finally(() => {
      detachSettled = true
    })
    await provider.waitForRequests('awaitApplicationDetach', 1)

    expect(provider.requests.slice(-2)).toEqual([
      expect.objectContaining({ method: 'beginApplicationDetach' }),
      expect.objectContaining({
        method: 'awaitApplicationDetach',
        params: { releaseId: 'application-release-1' }
      })
    ])
    expect(detachSettled).toBe(false)

    provider.resumeApplicationDetachCompletion()
    await detach
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
    const onExit = vi.fn()

    await client.initialize()
    client.bindRecoveredSession(outputIdentity('block'), {
      onExit,
      onOutput: vi.fn()
    })
    provider.disconnectClients()

    await vi.waitFor(() =>
      expect(runtimeUnavailable).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'TERMINAL_PROVIDER_UNAVAILABLE' })
      )
    )
    expect(onExit).not.toHaveBeenCalled()
    await client.detachApplication()
  })

  it('invalidates runtime readiness when an unresponsive Provider exceeds the client deadline', async () => {
    const runtimeUnavailable = vi.fn()
    const client = createClient(rootDirectory, undefined, runtimeUnavailable, undefined, 25)
    await client.initialize()
    provider.pauseMethodResponses('flushModel')

    await expect(client.flush(outputIdentity('block'))).rejects.toMatchObject({
      code: 'TERMINAL_PROVIDER_UNAVAILABLE'
    })
    await vi.waitFor(() =>
      expect(runtimeUnavailable).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'TERMINAL_PROVIDER_UNAVAILABLE' })
      )
    )
    await client.detachApplication()
  })

  it('invalidates cached readiness when the Provider reports a server-side deadline', async () => {
    const runtimeUnavailable = vi.fn()
    const client = createClient(rootDirectory, undefined, runtimeUnavailable)
    await client.initialize()
    provider.failMethod('flushModel', {
      code: 'COMMAND_TIMED_OUT',
      isExpected: true,
      message: 'Provider request exceeded its deadline.'
    })

    await expect(client.flush(outputIdentity('block'))).rejects.toMatchObject({
      code: 'COMMAND_TIMED_OUT'
    })
    expect(runtimeUnavailable).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'COMMAND_TIMED_OUT' })
    )
    await client.detachApplication()
  })

  it('keeps working-directory query timeouts auxiliary and reuses the healthy connection', async () => {
    const runtimeUnavailable = vi.fn()
    const client = createClient(rootDirectory, undefined, runtimeUnavailable, undefined, 25)
    await client.initialize()
    provider.pauseMethodResponses('readWorkingDirectory')

    await expect(client.readWorkingDirectory('session-1')).rejects.toMatchObject({
      code: 'COMMAND_TIMED_OUT'
    })
    expect(runtimeUnavailable).not.toHaveBeenCalled()

    provider.resumeMethodResponses('readWorkingDirectory')
    await expect(client.readWorkingDirectory('session-1')).resolves.toBeNull()
    expect(provider.connectionCount).toBe(1)
    await client.detachApplication()
  })

  it('accepts only newer working-directory events for the current terminal generation', async () => {
    const onWorkingDirectoryChanged = vi.fn()
    const client = createClient(
      rootDirectory,
      undefined,
      undefined,
      undefined,
      undefined,
      onWorkingDirectoryChanged
    )
    const scope = outputIdentity('block')
    await client.initialize()
    client.create({
      identity: scope,
      columns: 80,
      rows: 24,
      workingDirectory: scope.workspaceDirectory,
      onFlowControlChange: () => undefined,
      onQueryResponse: () => undefined
    })
    await provider.waitForRequests('createModel', 1)

    provider.emitEvent('terminal-working-directory', {
      revision: 2,
      scope,
      sessionId: scope.sessionId,
      workingDirectory: '/work/app/packages/ui'
    })
    provider.emitEvent('terminal-working-directory', {
      revision: 1,
      scope,
      sessionId: scope.sessionId,
      workingDirectory: '/work/app/stale'
    })
    provider.emitEvent('terminal-working-directory', {
      revision: 3,
      scope: { ...scope, generation: 2 },
      sessionId: scope.sessionId,
      workingDirectory: '/work/app/other-generation'
    })

    await vi.waitFor(() => expect(onWorkingDirectoryChanged).toHaveBeenCalledOnce())
    expect(onWorkingDirectoryChanged).toHaveBeenCalledWith({
      revision: 2,
      scope,
      sessionId: scope.sessionId,
      workingDirectory: '/work/app/packages/ui'
    })
    expect(client.readWorkingDirectory(scope)).toBe('/work/app/packages/ui')
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

  it('publishes only block-owned terminal output through the global output callback', async () => {
    const onOutput = vi.fn()
    const client = createClient(rootDirectory, undefined, undefined, onOutput)
    await client.initialize()
    const agentScope = outputIdentity('agent')
    const blockScope = outputIdentity('block')

    provider.emitEvent('terminal-output', {
      data: 'agent redraw',
      scope: agentScope,
      sequence: 1,
      sessionId: agentScope.sessionId
    })
    provider.emitEvent('terminal-output', {
      data: 'block output',
      scope: blockScope,
      sequence: 1,
      sessionId: blockScope.sessionId
    })

    await vi.waitFor(() => expect(onOutput).toHaveBeenCalledOnce())
    expect(onOutput).toHaveBeenCalledWith(
      expect.objectContaining({ data: 'block output', sessionId: blockScope.sessionId })
    )
    await client.detachApplication()
  })

  it('routes terminal title metadata to the model callback without treating it as output', async () => {
    await provider.close()
    provider = new ControllableTerminalProvider(
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
    const onTitleChanged = vi.fn()
    const onOutput = vi.fn()
    const client = createClient(rootDirectory, undefined, undefined, onOutput)
    const scope = outputIdentity('agent')
    await client.initialize()

    client.create({
      identity: scope,
      columns: 80,
      rows: 24,
      workingDirectory: scope.workspaceDirectory,
      onFlowControlChange: () => undefined,
      onQueryResponse: () => undefined,
      onTitleChanged
    })
    await provider.waitForRequests('createModel', 1)
    provider.emitEvent('terminal-output', {
      data: '\u001b]0;structured-',
      scope,
      sequence: 1,
      sessionId: scope.sessionId
    })
    provider.emitEvent('terminal-output', {
      data: 'title\u0007',
      scope,
      sequence: 2,
      sessionId: scope.sessionId
    })

    await vi.waitFor(() => expect(onTitleChanged).toHaveBeenCalledWith('structured-title'))
    expect(onTitleChanged).toHaveBeenCalledTimes(1)
    expect(onOutput).not.toHaveBeenCalled()
    await client.detachApplication()
  })

  it('defers fast process output and exit events until the start request resolves', async () => {
    const client = createClient(rootDirectory)
    const scope = outputIdentity('block')
    const lifecycle: string[] = []
    await client.initialize()
    provider.emitProcessLifecycleBeforeStartResponse(scope)

    const handle = await client.start({
      scope,
      workingDirectory: scope.workspaceDirectory,
      shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/sh',
      launchCommand: 'fast-command',
      sessionKind: 'workflow',
      columns: 80,
      rows: 24,
      onOutput: () => lifecycle.push('output'),
      onExit: () => lifecycle.push('exit')
    })
    lifecycle.push('start-resolved')

    expect(handle).toEqual({ processId: 4242 })
    expect(lifecycle).toEqual(['start-resolved'])
    await vi.waitFor(() => expect(lifecycle).toEqual(['start-resolved', 'output', 'exit']))
    await client.detachApplication()
  })

  it('releases application callbacks after the Provider connection is already absent', async () => {
    const client = createClient(rootDirectory)
    const identity = outputIdentity('agent')
    client.bindRecoveredSession(identity, {
      onExit: vi.fn(),
      onOutput: vi.fn()
    })
    client.bindRecoveryIssueHandler(vi.fn())

    expect(client.getDiagnostics().modelCount).toBe(1)

    await client.detachApplication()

    expect(client.getDiagnostics()).toEqual({
      attachedViewCount: 0,
      lastRestoreDurationMs: 0,
      modelCount: 0,
      pendingOutputBytes: 0
    })
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
    expect(provider.requests.some(({ method }) => method === 'beginApplicationDetach')).toBe(true)
  })
})

function createClient(
  rootDirectory: string,
  onBackgroundError?: (error: unknown) => void,
  onRuntimeUnavailable?: (error: unknown) => void,
  onOutput?: PersistentTerminalProviderClientOptions['onOutput'],
  requestDeadlineMs?: number,
  onWorkingDirectoryChanged?: PersistentTerminalProviderClientOptions['onWorkingDirectoryChanged']
) {
  return new PersistentTerminalProviderClient({
    stateDirectory: rootDirectory,
    providerEntryPath: join(rootDirectory, 'unused-provider-entry.js'),
    onBackgroundError,
    onRuntimeUnavailable,
    onOutput,
    onWorkingDirectoryChanged,
    requestDeadlineMs
  })
}

function outputIdentity(ownerKind: 'agent' | 'block') {
  const ownerId = ownerKind === 'agent' ? 'agent-1' : 'block-1'
  return {
    blockId: ownerId,
    generation: 1,
    gitBranch: 'main',
    owner: { id: ownerId, kind: ownerKind },
    projectDirectory: '/work/app',
    projectId: 'project-1',
    runId: `${ownerKind}-run-1`,
    sessionId: `${ownerKind}-session-1`,
    workspaceDirectory: '/work/app',
    workspaceId: 'main'
  }
}

async function expectNoAdditionalConnections(
  provider: ControllableTerminalProvider,
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
