import type { BlockGraphSnapshot } from '../../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import {
  registerBlockGraphIpcHandlers,
  type BlockGraphIpcHandlersInput
} from '../../../../src/platform/electron-main/blockGraphIpcHandlers'
import type { IpcInvokeResult, IpcMainLike } from '../../../../src/platform/ipc/registerIpcHandler'
import type { Logger } from '../../../../src/platform/logging/Logger'

describe('block graph terminal container IPC contract', () => {
  it('creates an empty group at one exact canvas position', async () => {
    const ipcMain = new FakeIpcMain()
    const createTerminalGroup = vi.fn(async () => createGraphSnapshot())
    registerBlockGraphIpcHandlers({
      createTerminalGroup,
      ipcMain,
      logger: silentLogger
    } as unknown as BlockGraphIpcHandlersInput)
    const command = {
      name: '组合',
      position: { x: 480, y: 320 },
      projectDirectory: '/repo/app',
      workspaceId: 'main'
    }

    await expect(
      ipcMain.invoke<BlockGraphSnapshot>('cleancode:create-terminal-group', command)
    ).resolves.toEqual({ ok: true, value: createGraphSnapshot() })
    expect(createTerminalGroup).toHaveBeenCalledWith(command)

    await expect(
      ipcMain.invoke('cleancode:create-terminal-group', {
        ...command,
        memberBlockIds: ['terminal-1']
      })
    ).resolves.toMatchObject({ error: { code: 'INVALID_IPC_COMMAND' }, ok: false })
    expect(createTerminalGroup).toHaveBeenCalledTimes(1)
  })

  it('creates a terminal directly in an edited group without exposing batch membership channels', async () => {
    const ipcMain = new FakeIpcMain()
    const createTerminalBlock = vi.fn(async () => createGraphSnapshot())
    registerBlockGraphIpcHandlers({
      createTerminalBlock,
      ipcMain,
      logger: silentLogger
    } as unknown as BlockGraphIpcHandlersInput)
    const command = {
      description: 'Local shell',
      name: 'Terminal',
      position: { x: 520, y: 360 },
      projectDirectory: '/repo/app',
      terminalGroupId: 'development',
      workspaceId: 'main'
    }

    await expect(
      ipcMain.invoke<BlockGraphSnapshot>('cleancode:create-terminal-block', command)
    ).resolves.toEqual({ ok: true, value: createGraphSnapshot() })
    expect(createTerminalBlock).toHaveBeenCalledWith(command)
    expect(ipcMain.hasHandler('cleancode:add-terminal-to-group')).toBe(false)
    expect(ipcMain.hasHandler('cleancode:remove-terminal-from-group')).toBe(false)
  })

  it.each([null, 'development'])(
    'moves one complete workflow to target group %s',
    async (target) => {
      const ipcMain = new FakeIpcMain()
      const moveTerminalWorkflowToGroup = vi.fn(async () => createGraphSnapshot())
      registerBlockGraphIpcHandlers({
        ipcMain,
        logger: silentLogger,
        moveTerminalWorkflowToGroup
      } as unknown as BlockGraphIpcHandlersInput)
      const command = {
        blockId: 'terminal-1',
        position: { x: 640, y: 420 },
        projectDirectory: '/repo/app',
        targetTerminalGroupId: target,
        workspaceId: 'main'
      }

      await expect(
        ipcMain.invoke<BlockGraphSnapshot>('cleancode:move-terminal-workflow-to-group', command)
      ).resolves.toEqual({ ok: true, value: createGraphSnapshot() })
      expect(moveTerminalWorkflowToGroup).toHaveBeenCalledWith(command)

      await expect(
        ipcMain.invoke('cleancode:move-terminal-workflow-to-group', {
          ...command,
          position: undefined
        })
      ).resolves.toMatchObject({ error: { code: 'INVALID_IPC_COMMAND' }, ok: false })
      expect(moveTerminalWorkflowToGroup).toHaveBeenCalledTimes(1)
    }
  )
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

  hasHandler(channel: string): boolean {
    return this.handlers.has(channel)
  }
}

const silentLogger: Logger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined
}

function createGraphSnapshot(): BlockGraphSnapshot {
  return {
    blocks: [],
    connections: [],
    id: 'graph-1',
    projectId: 'project-1',
    quickExecutionSlots: [
      { number: 1, target: null },
      { number: 2, target: null },
      { number: 3, target: null },
      { number: 4, target: null },
      { number: 5, target: null }
    ],
    terminalGroups: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    workspaceId: 'main'
  }
}
