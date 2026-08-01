import type { BlockGraphSnapshot } from '../../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import {
  registerBlockGraphIpcHandlers,
  type BlockGraphIpcHandlersInput
} from '../../../../src/platform/electron-main/blockGraphIpcHandlers'
import type { IpcInvokeResult, IpcMainLike } from '../../../../src/platform/ipc/registerIpcHandler'
import type { Logger } from '../../../../src/platform/logging/Logger'

describe('block graph terminal scope deletion IPC contract', () => {
  it.each([
    {
      target: {
        type: 'workflow' as const,
        terminalBlockIds: ['api', 'web']
      }
    },
    {
      target: {
        type: 'combination' as const,
        terminalGroupId: 'development',
        terminalBlockIds: ['api', 'web']
      }
    }
  ])('passes one complete $target.type target through IPC', async ({ target }) => {
    const ipcMain = new FakeIpcMain()
    const deleteTerminalScope = vi.fn(async () => createGraphSnapshot())
    registerBlockGraphIpcHandlers({
      deleteTerminalScope,
      ipcMain,
      logger: silentLogger
    } as unknown as BlockGraphIpcHandlersInput)
    const command = {
      projectDirectory: '/repo/app',
      target,
      workspaceId: 'main'
    }

    await expect(
      ipcMain.invoke<BlockGraphSnapshot>('cleancode:delete-terminal-scope', command)
    ).resolves.toEqual({ ok: true, value: createGraphSnapshot() })
    expect(deleteTerminalScope).toHaveBeenCalledWith(command)
  })

  it.each([
    { type: 'terminal', terminalBlockId: 'api' },
    { type: 'workflow', terminalBlockIds: [] },
    { type: 'combination', terminalGroupId: 'development', terminalBlockIds: [] },
    { type: 'combination', terminalBlockIds: ['api', 'web'] }
  ])('rejects malformed or unsupported target $type', async (target) => {
    const ipcMain = new FakeIpcMain()
    const deleteTerminalScope = vi.fn(async () => createGraphSnapshot())
    registerBlockGraphIpcHandlers({
      deleteTerminalScope,
      ipcMain,
      logger: silentLogger
    } as unknown as BlockGraphIpcHandlersInput)

    const result = await ipcMain.invoke('cleancode:delete-terminal-scope', {
      projectDirectory: '/repo/app',
      target,
      workspaceId: 'main'
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_IPC_COMMAND' } })
    expect(deleteTerminalScope).not.toHaveBeenCalled()
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

  invoke<TResult>(channel: string, command: unknown): Promise<IpcInvokeResult<TResult>> {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`No handler registered for ${channel}`)
    return handler({ sender: { isDestroyed: () => false, send: vi.fn() } }, command) as Promise<
      IpcInvokeResult<TResult>
    >
  }
}

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
}

function createGraphSnapshot(): BlockGraphSnapshot {
  return {
    id: 'graph-1',
    projectId: 'project-1',
    workspaceId: 'main',
    viewport: { x: 0, y: 0, zoom: 1 },
    blocks: [],
    connections: [],
    terminalGroups: []
  }
}
