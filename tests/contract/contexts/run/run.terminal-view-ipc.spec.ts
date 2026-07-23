import type { TerminalSnapshot } from '../../../../src/contexts/run/application/dto/TerminalModelSnapshot'
import type { TerminalViewOutputEvent } from '../../../../src/contexts/run/application/ports/TerminalModelPort'
import {
  registerTerminalIpcHandlers,
  type TerminalIpcHandlersInput
} from '../../../../src/platform/electron-main/terminalIpcHandlers'
import { createExpectedAppError } from '../../../../src/shared-kernel/application/errors/AppError'
import type { IpcInvokeResult, IpcMainLike } from '../../../../src/platform/ipc/registerIpcHandler'
import type { Logger } from '../../../../src/platform/logging/Logger'

describe('terminal view IPC contract', () => {
  it('attaches an exact view identity, returns its snapshot and targets live output', async () => {
    const ipcMain = new FakeIpcMain()
    const sender = new FakeSender()
    let emitOutput: ((event: TerminalViewOutputEvent) => void) | undefined
    const attachTerminalView = vi.fn(async (command) => {
      emitOutput = command.onOutput
      return snapshot()
    })
    registerTerminalIpcHandlers(createInput({ ipcMain, attachTerminalView }))

    await expect(
      ipcMain.invoke('cleancode:attach-terminal-view', viewCommand(), sender)
    ).resolves.toEqual({ ok: true, value: snapshot() })

    const output = viewOutputEvent()
    emitOutput?.(output)

    expect(attachTerminalView).toHaveBeenCalledWith({
      ...viewCommand(),
      onOutput: expect.any(Function)
    })
    expect(sender.send).toHaveBeenCalledWith('cleancode:terminal-view-output', output)
  })

  it('detaches explicitly and also cleans up an attached view when its renderer is destroyed', async () => {
    const ipcMain = new FakeIpcMain()
    const sender = new FakeSender()
    const detachTerminalView = vi.fn(async () => undefined)
    registerTerminalIpcHandlers(createInput({ ipcMain, detachTerminalView }))

    await ipcMain.invoke('cleancode:attach-terminal-view', viewCommand(), sender)
    sender.destroy()

    await vi.waitFor(() => expect(detachTerminalView).toHaveBeenCalledWith(viewCommand()))

    const explicitSender = new FakeSender()
    await ipcMain.invoke('cleancode:attach-terminal-view', viewCommand('view-2'), explicitSender)
    await expect(
      ipcMain.invoke('cleancode:detach-terminal-view', viewCommand('view-2'), explicitSender)
    ).resolves.toEqual({ ok: true, value: undefined })

    expect(detachTerminalView).toHaveBeenCalledWith(viewCommand('view-2'))
    expect(explicitSender.listenerCount).toBe(0)
  })

  it('shares one renderer destruction listener across every view owned by the same sender', async () => {
    const ipcMain = new FakeIpcMain()
    const sender = new FakeSender()
    const detachTerminalView = vi.fn(
      async (command: ReturnType<typeof viewCommand>) => void command
    )
    registerTerminalIpcHandlers(createInput({ ipcMain, detachTerminalView }))
    const commands = Array.from({ length: 12 }, (_, index) => viewCommand(`view-${index + 1}`))

    await Promise.all(
      commands.map((command) => ipcMain.invoke('cleancode:attach-terminal-view', command, sender))
    )

    expect(sender.listenerCount).toBe(1)

    await ipcMain.invoke('cleancode:detach-terminal-view', commands[0], sender)
    expect(sender.listenerCount).toBe(1)

    sender.destroy()

    await vi.waitFor(() => expect(detachTerminalView).toHaveBeenCalledTimes(commands.length))
    expect(detachTerminalView.mock.calls.map(([command]) => command)).toEqual(
      expect.arrayContaining(commands)
    )
    expect(sender.listenerCount).toBe(0)
  })

  it('releases every registered view before application shutdown and ignores later destruction', async () => {
    const ipcMain = new FakeIpcMain()
    const firstSender = new FakeSender()
    const secondSender = new FakeSender()
    const detachTerminalView = vi.fn(async () => undefined)
    const lifecycle = registerTerminalIpcHandlers(createInput({ ipcMain, detachTerminalView }))

    await ipcMain.invoke('cleancode:attach-terminal-view', viewCommand('view-1'), firstSender)
    await ipcMain.invoke('cleancode:attach-terminal-view', viewCommand('view-2'), secondSender)

    await lifecycle.prepareApplicationShutdown()

    expect(detachTerminalView).toHaveBeenCalledTimes(2)
    expect(detachTerminalView).toHaveBeenCalledWith(viewCommand('view-1'))
    expect(detachTerminalView).toHaveBeenCalledWith(viewCommand('view-2'))
    expect(firstSender.listenerCount).toBe(0)
    expect(secondSender.listenerCount).toBe(0)

    firstSender.destroy()
    secondSender.destroy()
    await lifecycle.prepareApplicationShutdown()

    expect(detachTerminalView).toHaveBeenCalledTimes(2)
  })

  it('rejects new view attachments after application shutdown starts', async () => {
    const ipcMain = new FakeIpcMain()
    const attachTerminalView = vi.fn(async () => snapshot())
    const lifecycle = registerTerminalIpcHandlers(createInput({ ipcMain, attachTerminalView }))

    await lifecycle.prepareApplicationShutdown()

    await expect(
      ipcMain.invoke('cleancode:attach-terminal-view', viewCommand(), new FakeSender())
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'TERMINAL_RUNTIME_NOT_READY', isExpected: true }
    })
    expect(attachTerminalView).not.toHaveBeenCalled()
  })

  it('continues releasing remaining views when one shutdown release fails', async () => {
    const ipcMain = new FakeIpcMain()
    const detachTerminalView = vi.fn(async (command: ReturnType<typeof viewCommand>) => {
      if (command.viewId === 'view-1') {
        throw createExpectedAppError('TERMINAL_MODEL_NOT_FOUND', 'Terminal model was not found.')
      }
    })
    const lifecycle = registerTerminalIpcHandlers(createInput({ ipcMain, detachTerminalView }))

    await ipcMain.invoke('cleancode:attach-terminal-view', viewCommand('view-1'), new FakeSender())
    await ipcMain.invoke('cleancode:attach-terminal-view', viewCommand('view-2'), new FakeSender())

    await expect(lifecycle.prepareApplicationShutdown()).rejects.toMatchObject({
      code: 'TERMINAL_MODEL_NOT_FOUND'
    })
    expect(detachTerminalView).toHaveBeenCalledTimes(2)
    expect(detachTerminalView).toHaveBeenCalledWith(viewCommand('view-2'))
  })

  it('shares one detach when explicit release races with renderer destruction', async () => {
    const ipcMain = new FakeIpcMain()
    const sender = new FakeSender()
    let finishDetach: () => void = () => undefined
    const detachTerminalView = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishDetach = resolve
        })
    )
    registerTerminalIpcHandlers(createInput({ ipcMain, detachTerminalView }))
    await ipcMain.invoke('cleancode:attach-terminal-view', viewCommand(), sender)

    const explicitDetach = ipcMain.invoke('cleancode:detach-terminal-view', viewCommand(), sender)
    sender.destroy()

    expect(detachTerminalView).toHaveBeenCalledOnce()
    finishDetach()
    await expect(explicitDetach).resolves.toEqual({ ok: true, value: undefined })
    expect(detachTerminalView).toHaveBeenCalledOnce()
  })

  it('preserves structured errors when renderer destruction cannot release a view', async () => {
    const ipcMain = new FakeIpcMain()
    const sender = new FakeSender()
    const logger = createRecordingLogger()
    const detachTerminalView = vi.fn(async () => {
      throw createExpectedAppError('TERMINAL_MODEL_NOT_FOUND', 'Terminal model was not found.')
    })
    registerTerminalIpcHandlers(createInput({ ipcMain, detachTerminalView, logger }))
    await ipcMain.invoke('cleancode:attach-terminal-view', viewCommand(), sender)

    sender.destroy()

    await vi.waitFor(() => expect(logger.warn).toHaveBeenCalledOnce())
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        error: {
          code: 'TERMINAL_MODEL_NOT_FOUND',
          isExpected: true,
          message: 'Terminal model was not found.'
        },
        operation: 'detachDestroyedTerminalView',
        outcome: 'failure',
        scope: 'run.terminal-view'
      })
    )
  })

  it('rejects incomplete restore identities at the IPC boundary', async () => {
    const ipcMain = new FakeIpcMain()
    const attachTerminalView = vi.fn()
    registerTerminalIpcHandlers(createInput({ ipcMain, attachTerminalView }))

    await expect(
      ipcMain.invoke(
        'cleancode:attach-terminal-view',
        { ...viewCommand(), generation: 0 },
        new FakeSender()
      )
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_IPC_COMMAND', isExpected: true }
    })
    expect(attachTerminalView).not.toHaveBeenCalled()
  })

  it('forwards a typed Agent owner through the shared terminal view protocol', async () => {
    const ipcMain = new FakeIpcMain()
    const attachTerminalView = vi.fn(async () => snapshot())
    registerTerminalIpcHandlers(createInput({ ipcMain, attachTerminalView }))
    const command = {
      ...viewCommand(),
      blockId: 'agent-1',
      owner: { id: 'agent-1', kind: 'agent' as const }
    }

    await expect(
      ipcMain.invoke('cleancode:attach-terminal-view', command, new FakeSender())
    ).resolves.toMatchObject({ ok: true })
    expect(attachTerminalView).toHaveBeenCalledWith({
      ...command,
      onOutput: expect.any(Function)
    })
  })

  it('accepts only a supported terminal scrollback budget', async () => {
    const ipcMain = new FakeIpcMain()
    const updateTerminalScrollback = vi.fn()
    registerTerminalIpcHandlers(createInput({ ipcMain, updateTerminalScrollback }))

    await expect(
      ipcMain.invoke(
        'cleancode:update-terminal-scrollback',
        { scrollbackRows: 5000 },
        new FakeSender()
      )
    ).resolves.toEqual({ ok: true, value: undefined })
    await expect(
      ipcMain.invoke(
        'cleancode:update-terminal-scrollback',
        { scrollbackRows: 5001 },
        new FakeSender()
      )
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_IPC_COMMAND', isExpected: true }
    })

    expect(updateTerminalScrollback).toHaveBeenCalledTimes(1)
    expect(updateTerminalScrollback).toHaveBeenCalledWith(5000)
  })

  it('forwards a bounded link target with the exact terminal view identity', async () => {
    const ipcMain = new FakeIpcMain()
    const openTerminalLink = vi.fn(async () => ({
      kind: 'external' as const,
      target: 'https://example.com/'
    }))
    registerTerminalIpcHandlers(createInput({ ipcMain, openTerminalLink }))

    await expect(
      ipcMain.invoke(
        'cleancode:open-terminal-link',
        { ...viewCommand(), rawTarget: 'https://example.com/' },
        new FakeSender()
      )
    ).resolves.toEqual({
      ok: true,
      value: { kind: 'external', target: 'https://example.com/' }
    })
    await expect(
      ipcMain.invoke(
        'cleancode:open-terminal-link',
        { ...viewCommand(), rawTarget: 'x'.repeat(4_097) },
        new FakeSender()
      )
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_IPC_COMMAND', isExpected: true }
    })

    expect(openTerminalLink).toHaveBeenCalledTimes(1)
    expect(openTerminalLink).toHaveBeenCalledWith({
      ...viewCommand(),
      rawTarget: 'https://example.com/'
    })
  })
})

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
    sender: FakeSender
  ): Promise<IpcInvokeResult<TResult>> {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`No handler registered for ${channel}`)
    return handler({ sender }, command) as Promise<IpcInvokeResult<TResult>>
  }
}

class FakeSender {
  readonly send = vi.fn()
  private readonly destroyedListeners = new Set<() => void>()

  get listenerCount(): number {
    return this.destroyedListeners.size
  }

  isDestroyed(): boolean {
    return false
  }

  once(_event: 'destroyed', listener: () => void): void {
    this.destroyedListeners.add(listener)
  }

  removeListener(_event: 'destroyed', listener: () => void): void {
    this.destroyedListeners.delete(listener)
  }

  destroy(): void {
    const listeners = [...this.destroyedListeners]
    this.destroyedListeners.clear()
    for (const listener of listeners) listener()
  }
}

function createInput(input: {
  readonly ipcMain: IpcMainLike
  readonly attachTerminalView?: TerminalIpcHandlersInput['attachTerminalView']
  readonly detachTerminalView?: TerminalIpcHandlersInput['detachTerminalView']
  readonly openTerminalLink?: TerminalIpcHandlersInput['openTerminalLink']
  readonly updateTerminalScrollback?: TerminalIpcHandlersInput['updateTerminalScrollback']
  readonly logger?: Logger
}): TerminalIpcHandlersInput {
  return {
    attachTerminalView: input.attachTerminalView ?? vi.fn(async () => snapshot()),
    detachTerminalView: input.detachTerminalView ?? vi.fn(async () => undefined),
    interruptTerminal: vi.fn(),
    ipcMain: input.ipcMain,
    launchTerminal: vi.fn(),
    listTerminalSessions: vi.fn(() => []),
    listTerminalWorkingDirectories: vi.fn(async () => []),
    logger: input.logger ?? new SilentLogger(),
    openTerminalLink: input.openTerminalLink ?? vi.fn(),
    openTerminalServiceEndpoint: vi.fn(),
    resizeTerminal: vi.fn(),
    startTerminal: vi.fn(),
    terminateTerminal: vi.fn(),
    updateTerminalScrollback: input.updateTerminalScrollback ?? vi.fn(),
    writeTerminal: vi.fn()
  }
}

function createRecordingLogger() {
  return {
    debug: vi.fn<Logger['debug']>(),
    error: vi.fn<Logger['error']>(),
    info: vi.fn<Logger['info']>(),
    warn: vi.fn<Logger['warn']>()
  } satisfies Logger
}

function viewCommand(viewId = 'view-1') {
  return {
    projectId: 'project-1',
    workspaceName: 'main',
    blockId: 'block-1',
    sessionId: 'session-1',
    runId: 'run-1',
    generation: 1,
    viewId
  }
}

function snapshot(): TerminalSnapshot {
  return {
    identity: {
      ...viewCommand(),
      projectDirectory: '/work/app',
      workspaceDirectory: '/work/app',
      gitBranch: 'main'
    },
    sequence: 2,
    scrollbackRows: 1000,
    unicodeVersion: '11',
    restoreMarker: { viewId: 'view-1', sequence: 2 },
    content: 'restored',
    transcript: 'restored',
    dimensions: { columns: 80, rows: 24 },
    title: '',
    workingDirectory: '/work/app',
    terminalSourceTheme: 'dark',
    modes: {
      applicationCursorKeysMode: false,
      applicationKeypadMode: false,
      bracketedPasteMode: false,
      insertMode: false,
      mouseTrackingMode: 'none',
      originMode: false,
      reverseWraparoundMode: false,
      sendFocusMode: false,
      synchronizedOutputMode: false,
      wraparoundMode: true
    }
  }
}

function viewOutputEvent(): TerminalViewOutputEvent {
  return {
    viewId: 'view-1',
    scope: snapshot().identity,
    sessionId: 'session-1',
    output: { sequence: 3, data: 'live' }
  }
}

class SilentLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}
