import type { BlockGraphSnapshot } from '../../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import {
  registerBlockGraphIpcHandlers,
  type BlockGraphIpcHandlersInput
} from '../../../../src/platform/electron-main/blockGraphIpcHandlers'
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

  invoke<TResult>(channel: string, command: unknown): Promise<IpcInvokeResult<TResult>> {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`No handler registered for ${channel}`)

    return handler({ sender: { isDestroyed: () => false, send: vi.fn() } }, command) as Promise<
      IpcInvokeResult<TResult>
    >
  }

  hasHandler(channel: string): boolean {
    return this.handlers.has(channel)
  }
}

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
}

describe('block graph terminal resize IPC contract', () => {
  it('does not expose a full graph snapshot overwrite channel', () => {
    const ipcMain = new FakeIpcMain()

    registerBlockGraphIpcHandlers({
      ipcMain,
      logger: silentLogger
    } as unknown as BlockGraphIpcHandlersInput)

    expect(ipcMain.hasHandler('cleancode:save-graph')).toBe(false)
  })

  it('passes the complete final terminal rectangle through IPC', async () => {
    const ipcMain = new FakeIpcMain()
    const resizeTerminalBlock = vi.fn(async () => createGraphSnapshot())
    registerBlockGraphIpcHandlers({
      ipcMain,
      logger: silentLogger,
      resizeTerminalBlock
    } as unknown as BlockGraphIpcHandlersInput)

    const command = {
      projectDirectory: '/repo/app',
      workspaceName: 'main',
      blockId: 'terminal-1',
      position: { x: 180, y: 140 },
      size: { width: 760, height: 420 }
    }
    const result = await ipcMain.invoke<BlockGraphSnapshot>(
      'cleancode:resize-terminal-block',
      command
    )

    expect(result).toEqual({ ok: true, value: createGraphSnapshot() })
    expect(resizeTerminalBlock).toHaveBeenCalledWith(command)
  })
})

function createGraphSnapshot(): BlockGraphSnapshot {
  return {
    id: 'graph-1',
    projectId: 'project-1',
    workspaceName: 'main',
    viewport: { x: 0, y: 0, zoom: 1 },
    terminalGroups: [],
    blocks: [
      {
        id: 'terminal-1',
        type: 'terminal',
        name: 'Terminal',
        description: 'Local shell',
        launchCommand: '',
        position: { x: 180, y: 140 },
        size: { width: 760, height: 420 }
      }
    ]
  }
}
