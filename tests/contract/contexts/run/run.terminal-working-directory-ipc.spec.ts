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
})

function createTerminalIpcHandlersInput(input: {
  readonly ipcMain: IpcMainLike
  readonly listTerminalWorkingDirectories: TerminalIpcHandlersInput['listTerminalWorkingDirectories']
}): TerminalIpcHandlersInput {
  return {
    interruptTerminal: vi.fn(),
    ipcMain: input.ipcMain,
    launchTerminal: vi.fn(),
    listTerminalWorkingDirectories: input.listTerminalWorkingDirectories,
    logger: new SilentLogger(),
    openTerminalServiceEndpoint: vi.fn(),
    resizeTerminal: vi.fn(),
    startTerminal: vi.fn(),
    terminateTerminal: vi.fn(),
    writeTerminal: vi.fn()
  }
}
