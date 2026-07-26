import {
  registerTerminalIpcHandlers,
  type TerminalIpcHandlersInput
} from '../../../../src/platform/electron-main/terminalIpcHandlers'
import type { IpcInvokeResult, IpcMainLike } from '../../../../src/platform/ipc/registerIpcHandler'
import type { Logger } from '../../../../src/platform/logging/Logger'
import { createExpectedAppError } from '../../../../src/shared-kernel/application/errors/AppError'

class FakeIpcMain implements IpcMainLike {
  private readonly handlers = new Map<
    string,
    (event: unknown, command?: unknown) => Promise<IpcInvokeResult<unknown>>
  >()

  handle(
    channel: string,
    listener: (event: unknown, command?: unknown) => Promise<IpcInvokeResult<unknown>>
  ): void {
    this.handlers.set(channel, listener)
  }

  invoke<TResult>(
    channel: string,
    command: unknown,
    event: unknown = createSenderEvent()
  ): Promise<IpcInvokeResult<TResult>> {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`No handler registered for ${channel}`)
    return handler(event, command) as Promise<IpcInvokeResult<TResult>>
  }
}

describe('managed terminal service IPC contract', () => {
  it('starts an empty terminal only from an exact Project workspace identity', async () => {
    const ipcMain = new FakeIpcMain()
    const startTerminal = vi.fn(async () => session)
    registerTerminalIpcHandlers(
      createInput({ ipcMain, startTerminal }) as unknown as TerminalIpcHandlersInput
    )

    const emptyStartCommand = {
      ...launchCommand,
      terminalBlockId: 'shell'
    }
    await expect(ipcMain.invoke('cleancode:start-terminal', emptyStartCommand)).resolves.toEqual({
      ok: true,
      value: session
    })
    expect(startTerminal).toHaveBeenCalledWith({
      ...emptyStartCommand,
      workingDirectory: emptyStartCommand.workspaceDirectory,
      onExit: expect.any(Function),
      onOutput: expect.any(Function)
    })
  })

  it('reports an already absent terminal session as an idempotent termination success', async () => {
    const ipcMain = new FakeIpcMain()
    const terminateTerminal = vi.fn(async () => null)
    registerTerminalIpcHandlers(
      createInput({ ipcMain, terminateTerminal }) as unknown as TerminalIpcHandlersInput
    )

    await expect(
      ipcMain.invoke('cleancode:terminate-terminal', { sessionId: 'missing-session' })
    ).resolves.toEqual({ ok: true, value: null })
    expect(terminateTerminal).toHaveBeenCalledWith('missing-session')
  })

  it('rejects an invalid terminal source theme before starting a process', async () => {
    const ipcMain = new FakeIpcMain()
    const startTerminal = vi.fn(async () => session)
    registerTerminalIpcHandlers(
      createInput({ ipcMain, startTerminal }) as unknown as TerminalIpcHandlersInput
    )

    await expect(
      ipcMain.invoke('cleancode:start-terminal', {
        ...launchCommand,
        terminalSourceTheme: 'sepia'
      })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_IPC_COMMAND', isExpected: true }
    })
    expect(startTerminal).not.toHaveBeenCalled()
  })

  it('launches only from an exact Project workspace identity and forwards terminal events', async () => {
    const ipcMain = new FakeIpcMain()
    const launchTerminal = vi.fn(async (command: Record<string, unknown>) => {
      ;(command.onSessionStarted as (session: unknown) => void)(session)
      ;(command.onEndpointConfirmed as (session: unknown, endpoint: unknown) => void)(
        session,
        launchResult.endpoint
      )
      ;(command.onOutput as (event: unknown) => void)({
        scope: session,
        sessionId: 'session-2',
        data: 'ready'
      })
      ;(command.onExit as (event: unknown) => void)({
        scope: session,
        sessionId: 'session-2',
        exitCode: 0
      })
      ;(command.onPortStateChanged as (session: unknown, endpoint: unknown, state: string) => void)(
        session,
        launchResult.endpoint,
        'releasing'
      )
      ;(command.onPortStateChanged as (session: unknown, endpoint: unknown, state: string) => void)(
        session,
        launchResult.endpoint,
        'released'
      )
      return launchResult
    })
    const senderEvent = createSenderEvent()
    registerTerminalIpcHandlers(
      createInput({ ipcMain, launchTerminal }) as unknown as TerminalIpcHandlersInput
    )

    await expect(
      ipcMain.invoke('cleancode:launch-terminal', launchCommand, senderEvent)
    ).resolves.toEqual({ ok: true, value: launchResult })
    expect(launchTerminal).toHaveBeenCalledWith({
      projectId: launchCommand.projectId,
      projectDirectory: launchCommand.projectDirectory,
      workspaceId: launchCommand.workspaceId,
      workspaceDirectory: launchCommand.workspaceDirectory,
      gitBranch: launchCommand.gitBranch,
      terminalSourceTheme: launchCommand.terminalSourceTheme,
      blockId: launchCommand.terminalBlockId,
      workingDirectory: launchCommand.workspaceDirectory,
      columns: launchCommand.columns,
      rows: launchCommand.rows,
      shell: undefined,
      signal: expect.any(AbortSignal),
      onCleanupFailed: expect.any(Function),
      onExit: expect.any(Function),
      onOutput: expect.any(Function),
      onPortStateChanged: expect.any(Function),
      onRunEnded: expect.any(Function),
      onSessionStarted: expect.any(Function),
      onEndpointConfirmed: expect.any(Function)
    })
    expect(senderEvent.sender.send).toHaveBeenNthCalledWith(1, 'cleancode:terminal-run-event', {
      type: 'service-run-started',
      scope: runIdentity
    })
    expect(senderEvent.sender.send).toHaveBeenNthCalledWith(2, 'cleancode:terminal-run-event', {
      type: 'service-endpoint-updated',
      scope: runIdentity,
      endpoint: launchResult.endpoint
    })
    expect(senderEvent.sender.send).not.toHaveBeenCalledWith(
      'cleancode:terminal-output',
      expect.anything()
    )
    expect(senderEvent.sender.send).toHaveBeenNthCalledWith(3, 'cleancode:terminal-exit', {
      scope: session,
      sessionId: 'session-2',
      exitCode: 0
    })
    expect(senderEvent.sender.send).toHaveBeenNthCalledWith(4, 'cleancode:terminal-run-event', {
      type: 'service-port-state-changed',
      scope: runIdentity,
      state: 'releasing'
    })
    expect(senderEvent.sender.send).toHaveBeenNthCalledWith(5, 'cleancode:terminal-run-event', {
      type: 'service-port-state-changed',
      scope: runIdentity,
      state: 'released'
    })
  })

  it('opens an endpoint only by its exact Run identity and rejects malformed launch commands', async () => {
    const ipcMain = new FakeIpcMain()
    const launchTerminal = vi.fn(async () => launchResult)
    const openTerminalServiceEndpoint = vi.fn(async () => undefined)
    registerTerminalIpcHandlers(
      createInput({
        ipcMain,
        launchTerminal,
        openTerminalServiceEndpoint
      }) as unknown as TerminalIpcHandlersInput
    )

    const identity = { runId: 'run-2', sessionId: 'session-2', generation: 2 }
    await expect(
      ipcMain.invoke('cleancode:open-terminal-service-endpoint', identity)
    ).resolves.toEqual({ ok: true, value: undefined })
    expect(openTerminalServiceEndpoint).toHaveBeenCalledWith(identity)

    await expect(
      ipcMain.invoke('cleancode:launch-terminal', { ...launchCommand, projectId: undefined })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_IPC_COMMAND', isExpected: true }
    })
    expect(launchTerminal).not.toHaveBeenCalled()
  })

  it('publishes a managed fixed-port conflict with resolved owner labels', async () => {
    const ipcMain = new FakeIpcMain()
    const senderEvent = createSenderEvent()
    const managedOwner = {
      identity: { ...runIdentity, projectId: 'project-2', runId: 'owner-run' },
      projectName: 'Storefront',
      workspaceId: 'feature/cart',
      workspaceDisplayName: 'feature/cart',
      terminalName: 'API'
    }
    const launchTerminal = vi.fn(async () => {
      throw createExpectedAppError(
        'SERVICE_PORT_FIXED_CONFLICT',
        'The fixed local service port is already occupied.',
        {
          port: 3_000,
          attemptedProjectId: runIdentity.projectId,
          attemptedWorkspaceId: runIdentity.workspaceId,
          attemptedBlockId: runIdentity.blockId,
          attemptedSessionId: runIdentity.sessionId,
          attemptedRunId: runIdentity.runId,
          attemptedGeneration: runIdentity.generation,
          managedProjectId: managedOwner.identity.projectId,
          managedProjectDirectory: '/repo/storefront',
          managedWorkspaceId: managedOwner.identity.workspaceId,
          managedBlockId: managedOwner.identity.blockId,
          managedSessionId: managedOwner.identity.sessionId,
          managedRunId: managedOwner.identity.runId,
          managedGeneration: managedOwner.identity.generation,
          managedLeaseState: 'bound'
        }
      )
    })
    const resolveManagedServiceOwner = vi.fn(async () => managedOwner)
    registerTerminalIpcHandlers(
      createInput({
        ipcMain,
        launchTerminal,
        resolveManagedServiceOwner
      }) as unknown as TerminalIpcHandlersInput
    )

    await expect(
      ipcMain.invoke('cleancode:launch-terminal', launchCommand, senderEvent)
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'SERVICE_PORT_FIXED_CONFLICT', isExpected: true }
    })
    expect(resolveManagedServiceOwner).toHaveBeenCalledWith({
      ...managedOwner.identity,
      projectDirectory: '/repo/storefront'
    })
    expect(senderEvent.sender.send).toHaveBeenCalledWith('cleancode:terminal-run-event', {
      type: 'service-port-conflict',
      scope: runIdentity,
      conflict: {
        code: 'SERVICE_PORT_FIXED_CONFLICT',
        port: 3_000,
        ownership: 'managed',
        managedOwner,
        managedLeaseState: 'bound'
      }
    })
  })
})

const launchCommand = {
  projectId: 'project-1',
  projectDirectory: '/repo/app',
  workspaceId: 'main',
  workspaceDirectory: '/repo/app',
  gitBranch: 'main',
  terminalSourceTheme: 'dark' as const,
  terminalBlockId: 'api',
  columns: 88,
  rows: 24
}

const session = {
  ...launchCommand,
  blockId: launchCommand.terminalBlockId,
  id: 'session-2',
  sessionId: 'session-2',
  runId: 'run-2',
  generation: 2,
  workingDirectory: launchCommand.workspaceDirectory,
  processId: 201,
  status: 'running' as const,
  inputHistory: [],
  exitCode: null,
  failureReason: null
}

const launchResult = {
  session,
  endpoint: {
    protocol: 'http' as const,
    host: '127.0.0.1' as const,
    port: 41_001,
    requestedPort: 3_000,
    fallback: true,
    displayAddress: 'http://127.0.0.1:41001',
    openable: true
  }
}

const runIdentity = {
  projectId: launchCommand.projectId,
  workspaceId: launchCommand.workspaceId,
  blockId: launchCommand.terminalBlockId,
  sessionId: session.sessionId,
  runId: session.runId,
  generation: session.generation
}

function createInput(input: {
  readonly ipcMain: IpcMainLike
  readonly launchTerminal?: (command: Record<string, unknown>) => Promise<typeof launchResult>
  readonly startTerminal?: (command: Record<string, unknown>) => Promise<typeof session>
  readonly openTerminalServiceEndpoint?: (command: {
    readonly runId: string
    readonly sessionId: string
    readonly generation: number
  }) => Promise<void>
  readonly resolveManagedServiceOwner?: (owner: Record<string, unknown>) => Promise<unknown>
  readonly terminateTerminal?: (sessionId: string) => Promise<typeof session | null>
}) {
  return {
    attachTerminalView: vi.fn(),
    detachTerminalView: vi.fn(),
    interruptTerminal: vi.fn(),
    ipcMain: input.ipcMain,
    launchTerminal: input.launchTerminal ?? vi.fn(),
    listTerminalSessions: vi.fn(() => []),
    listTerminalWorkingDirectories: vi.fn(async () => []),
    logger: new SilentLogger(),
    openTerminalServiceEndpoint: input.openTerminalServiceEndpoint ?? vi.fn(),
    resolveManagedServiceOwner: input.resolveManagedServiceOwner,
    resizeTerminal: vi.fn(),
    startTerminal: input.startTerminal ?? vi.fn(),
    terminateTerminal: input.terminateTerminal ?? vi.fn(),
    writeTerminal: vi.fn()
  }
}

function createSenderEvent() {
  return {
    sender: {
      isDestroyed: vi.fn(() => false),
      send: vi.fn()
    }
  }
}

class SilentLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}
