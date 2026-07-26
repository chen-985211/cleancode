import {
  registerTerminalIpcHandlers,
  type TerminalIpcHandlersInput
} from '../../../../src/platform/electron-main/terminalIpcHandlers'
import type { IpcInvokeResult, IpcMainLike } from '../../../../src/platform/ipc/registerIpcHandler'
import type { Logger } from '../../../../src/platform/logging/Logger'

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

  invoke<TResult>(channel: string, command?: unknown): Promise<IpcInvokeResult<TResult>> {
    const handler = this.handlers.get(channel)

    if (!handler) {
      throw new Error(`No handler registered for ${channel}`)
    }

    return handler({}, command) as Promise<IpcInvokeResult<TResult>>
  }
}

class SilentLogger implements Logger {
  debug(event: Parameters<Logger['debug']>[0]): void {
    this.ignore(event)
  }

  info(event: Parameters<Logger['info']>[0]): void {
    this.ignore(event)
  }

  warn(event: Parameters<Logger['warn']>[0]): void {
    this.ignore(event)
  }

  error(event: Parameters<Logger['error']>[0]): void {
    this.ignore(event)
  }

  private ignore(event: Parameters<Logger['debug']>[0]): void {
    void event
  }
}

describe('terminal working directory IPC contract', () => {
  it('exposes terminal runtime availability and one explicit retry boundary', async () => {
    const ipcMain = new FakeIpcMain()
    const availability = {
      phase: 'unavailable' as const,
      epoch: 0,
      errorCode: 'TERMINAL_PROVIDER_UNAVAILABLE' as const,
      retryable: true
    }
    const retryTerminalRuntime = vi.fn(async () => ({
      phase: 'ready' as const,
      epoch: 1,
      errorCode: null,
      retryable: false
    }))
    registerTerminalIpcHandlers(
      createTerminalIpcHandlersInput({
        ipcMain,
        getTerminalRuntimeAvailability: () => availability,
        retryTerminalRuntime,
        listTerminalWorkingDirectories: vi.fn(async () => [])
      })
    )

    await expect(ipcMain.invoke('cleancode:get-terminal-runtime-availability')).resolves.toEqual({
      ok: true,
      value: availability
    })
    await expect(ipcMain.invoke('cleancode:retry-terminal-runtime')).resolves.toEqual({
      ok: true,
      value: {
        phase: 'ready',
        epoch: 1,
        errorCode: null,
        retryable: false
      }
    })
    expect(retryTerminalRuntime).toHaveBeenCalledOnce()
  })

  it('returns current working directories for requested terminal sessions', async () => {
    const ipcMain = new FakeIpcMain()
    const listTerminalWorkingDirectories = vi.fn(async () => [
      {
        sessionId: 'session-1',
        workingDirectory: '/work/app-worktree'
      }
    ])

    registerTerminalIpcHandlers(
      createTerminalIpcHandlersInput({
        ipcMain,
        listTerminalWorkingDirectories
      })
    )

    await expect(
      ipcMain.invoke('cleancode:list-terminal-working-directories', {
        sessionIds: ['session-1']
      })
    ).resolves.toEqual({
      ok: true,
      value: [
        {
          sessionId: 'session-1',
          workingDirectory: '/work/app-worktree'
        }
      ]
    })
    expect(listTerminalWorkingDirectories).toHaveBeenCalledWith(['session-1'])
  })

  it('returns retained session snapshots for renderer reconciliation', async () => {
    const ipcMain = new FakeIpcMain()
    const listTerminalSessions = vi.fn(() => [sessionSnapshot('session-1', 'exited')])

    registerTerminalIpcHandlers(
      createTerminalIpcHandlersInput({
        ipcMain,
        listTerminalSessions,
        listTerminalWorkingDirectories: vi.fn(async () => [])
      })
    )

    await expect(
      ipcMain.invoke('cleancode:list-terminal-sessions', { sessionIds: ['session-1', 'missing'] })
    ).resolves.toEqual({
      ok: true,
      value: [sessionSnapshot('session-1', 'exited')]
    })
    expect(listTerminalSessions).toHaveBeenCalledWith(['session-1', 'missing'])
  })

  it('returns the authoritative session snapshot after resize', async () => {
    const ipcMain = new FakeIpcMain()
    const resizeTerminal = vi.fn(() => sessionSnapshot('session-1', 'exited'))

    registerTerminalIpcHandlers(
      createTerminalIpcHandlersInput({
        ipcMain,
        listTerminalSessions: vi.fn(() => []),
        listTerminalWorkingDirectories: vi.fn(async () => []),
        resizeTerminal
      })
    )

    await expect(
      ipcMain.invoke('cleancode:resize-terminal', {
        sessionId: 'session-1',
        columns: 120,
        rows: 40
      })
    ).resolves.toEqual({ ok: true, value: sessionSnapshot('session-1', 'exited') })
    expect(resizeTerminal).toHaveBeenCalledWith('session-1', 120, 40)
  })

  it('rejects malformed session reconciliation requests at the IPC boundary', async () => {
    const ipcMain = new FakeIpcMain()
    const listTerminalSessions = vi.fn(() => [])
    registerTerminalIpcHandlers(
      createTerminalIpcHandlersInput({
        ipcMain,
        listTerminalSessions,
        listTerminalWorkingDirectories: vi.fn(async () => [])
      })
    )

    await expect(
      ipcMain.invoke('cleancode:list-terminal-sessions', { sessionIds: ['valid', ''] })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_IPC_COMMAND', isExpected: true }
    })
    expect(listTerminalSessions).not.toHaveBeenCalled()
  })

  it('exposes recovered sessions, revalidated endpoints, and retention updates', async () => {
    const ipcMain = new FakeIpcMain()
    const warm = {
      ...sessionSnapshot('session-1', 'running'),
      retentionPolicy: 'keep-after-application-exit' as const,
      recoveryKind: 'warm' as const
    }
    const endpoint = {
      protocol: 'http' as const,
      host: '127.0.0.1' as const,
      port: 41_001,
      requestedPort: 3_000,
      fallback: true,
      displayAddress: 'http://127.0.0.1:41001',
      openable: true
    }
    const setTerminalRetention = vi.fn(async () => warm)
    registerTerminalIpcHandlers(
      createTerminalIpcHandlersInput({
        ipcMain,
        listRecoveredTerminalSessions: () => [warm],
        listRecoveredTerminalServiceEndpoints: () => [{ session: warm, endpoint }],
        listTerminalWorkingDirectories: vi.fn(async () => []),
        setTerminalRetention
      })
    )

    await expect(ipcMain.invoke('cleancode:list-recovered-terminal-sessions')).resolves.toEqual({
      ok: true,
      value: [warm]
    })
    await expect(
      ipcMain.invoke('cleancode:list-recovered-terminal-service-endpoints')
    ).resolves.toEqual({
      ok: true,
      value: [{ sessionId: 'session-1', endpoint }]
    })
    await expect(
      ipcMain.invoke('cleancode:set-terminal-retention', {
        sessionId: 'session-1',
        retentionPolicy: 'keep-after-application-exit'
      })
    ).resolves.toEqual({ ok: true, value: warm })
    expect(setTerminalRetention).toHaveBeenCalledWith('session-1', 'keep-after-application-exit')
  })
})

function createTerminalIpcHandlersInput(input: {
  readonly getTerminalRuntimeAvailability?: TerminalIpcHandlersInput['getTerminalRuntimeAvailability']
  readonly ipcMain: IpcMainLike
  readonly listTerminalSessions?: TerminalIpcHandlersInput['listTerminalSessions']
  readonly listRecoveredTerminalSessions?: TerminalIpcHandlersInput['listRecoveredTerminalSessions']
  readonly listRecoveredTerminalServiceEndpoints?: TerminalIpcHandlersInput['listRecoveredTerminalServiceEndpoints']
  readonly listTerminalWorkingDirectories: TerminalIpcHandlersInput['listTerminalWorkingDirectories']
  readonly resizeTerminal?: TerminalIpcHandlersInput['resizeTerminal']
  readonly retryTerminalRuntime?: TerminalIpcHandlersInput['retryTerminalRuntime']
  readonly setTerminalRetention?: TerminalIpcHandlersInput['setTerminalRetention']
}): TerminalIpcHandlersInput {
  return {
    attachTerminalView: vi.fn(),
    detachTerminalView: vi.fn(),
    getTerminalRuntimeAvailability:
      input.getTerminalRuntimeAvailability ??
      (() => ({ phase: 'ready', epoch: 1, errorCode: null, retryable: false })),
    interruptTerminal: vi.fn(),
    ipcMain: input.ipcMain,
    launchTerminal: vi.fn(),
    listRecoveredTerminalServiceEndpoints: input.listRecoveredTerminalServiceEndpoints,
    listRecoveredTerminalSessions: input.listRecoveredTerminalSessions,
    listTerminalSessions: input.listTerminalSessions ?? vi.fn(() => []),
    listTerminalWorkingDirectories: input.listTerminalWorkingDirectories,
    logger: new SilentLogger(),
    openTerminalLink: vi.fn(),
    openTerminalServiceEndpoint: vi.fn(),
    resizeTerminal: input.resizeTerminal ?? vi.fn(),
    retryTerminalRuntime:
      input.retryTerminalRuntime ??
      vi.fn(async () => ({ phase: 'ready' as const, epoch: 1, errorCode: null, retryable: false })),
    setTerminalRetention: input.setTerminalRetention,
    startTerminal: vi.fn(),
    terminateTerminal: vi.fn(),
    updateTerminalScrollback: vi.fn(),
    writeTerminal: vi.fn()
  }
}

function sessionSnapshot(sessionId: string, status: 'running' | 'exited') {
  return {
    id: sessionId,
    sessionId,
    runId: 'run-1',
    generation: 1,
    projectId: 'project-1',
    projectDirectory: '/work/app',
    workspaceId: 'main',
    workspaceDirectory: '/work/app',
    gitBranch: 'main',
    blockId: 'block-1',
    terminalBlockId: 'block-1',
    workingDirectory: '/work/app',
    processId: status === 'running' ? 101 : null,
    status,
    kind: 'interactive' as const,
    retentionPolicy: 'terminate-on-application-exit' as const,
    recoveryKind: status === 'running' ? ('fresh' as const) : ('ended' as const),
    terminalSourceTheme: 'dark' as const,
    inputHistory: [],
    exitCode: status === 'exited' ? 0 : null,
    failureReason: null
  }
}
