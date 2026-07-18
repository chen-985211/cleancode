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

  it('passes one complete terminal definition through the atomic update channel', async () => {
    const ipcMain = new FakeIpcMain()
    const updateTerminalDefinition = vi.fn(async () => createGraphSnapshot())
    registerBlockGraphIpcHandlers({
      ipcMain,
      logger: silentLogger,
      updateTerminalDefinition
    } as unknown as BlockGraphIpcHandlersInput)
    const command = {
      projectDirectory: '/repo/app',
      workspaceName: 'main',
      blockId: 'terminal-1',
      name: 'Web',
      description: 'Development server',
      launchCommand: 'pnpm dev',
      executionConfig: {
        mode: 'service' as const,
        readiness: { type: 'tcp' as const },
        readinessTimeoutMs: 30_000,
        port: {
          protocol: 'http' as const,
          policy: { type: 'preferred' as const, port: 5173 },
          binding: { type: 'environment' as const, variableName: 'PORT' }
        }
      }
    }

    await expect(
      ipcMain.invoke<BlockGraphSnapshot>('cleancode:update-terminal-definition', command)
    ).resolves.toEqual({ ok: true, value: createGraphSnapshot() })
    expect(updateTerminalDefinition).toHaveBeenCalledTimes(1)
    expect(updateTerminalDefinition).toHaveBeenCalledWith(command)
  })

  it('rejects malformed terminal definitions before invoking the use case', async () => {
    const ipcMain = new FakeIpcMain()
    const updateTerminalDefinition = vi.fn(async () => createGraphSnapshot())
    registerBlockGraphIpcHandlers({
      ipcMain,
      logger: silentLogger,
      updateTerminalDefinition
    } as unknown as BlockGraphIpcHandlersInput)

    const result = await ipcMain.invoke('cleancode:update-terminal-definition', {
      projectDirectory: '/repo/app',
      workspaceName: 'main',
      blockId: 'terminal-1',
      name: 'Web'
    })

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'INVALID_IPC_COMMAND' }
    })
    expect(updateTerminalDefinition).not.toHaveBeenCalled()
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
