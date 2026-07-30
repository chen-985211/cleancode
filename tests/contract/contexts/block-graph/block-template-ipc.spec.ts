import type {
  BlockTemplateSnapshot,
  InstantiatedBlockTemplateSnapshot
} from '../../../../src/contexts/block-graph/domain/aggregates/BlockTemplateTypes'
import type { BlockGraphSnapshot } from '../../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { registerBlockTemplateIpcHandlers } from '../../../../src/platform/electron-main/blockTemplateIpcHandlers'
import type { IpcInvokeResult, IpcMainLike } from '../../../../src/platform/ipc/registerIpcHandler'
import type { Logger } from '../../../../src/platform/logging/Logger'

describe('block template IPC contract', () => {
  it('passes project-scoped save and list commands', async () => {
    const ipcMain = new FakeIpcMain()
    const template = createTemplate()
    const saveBlockTemplate = vi.fn(async () => template)
    const listBlockTemplates = vi.fn(async () => [template])
    registerBlockTemplateIpcHandlers({
      deleteBlockTemplate: vi.fn(),
      instantiateBlockTemplate: vi.fn(),
      ipcMain,
      listBlockTemplates,
      logger: silentLogger,
      moveBlockTemplate: vi.fn(),
      saveBlockTemplate,
      updateBlockTemplate: vi.fn()
    })
    const saveCommand = {
      description: 'Build workflow.',
      name: 'Build',
      projectDirectory: '/project',
      scope: { projectId: 'project-1', type: 'project' as const },
      selectedBlockIds: ['install', 'build'],
      workspaceId: 'workspace-1'
    }

    await expect(
      ipcMain.invoke<BlockTemplateSnapshot>('cleancode:save-block-template', saveCommand)
    ).resolves.toEqual({ ok: true, value: template })
    await ipcMain.invoke('cleancode:list-block-templates', {
      scope: { projectId: 'project-1', type: 'project' }
    })

    expect(saveBlockTemplate).toHaveBeenCalledWith(saveCommand)
    expect(listBlockTemplates).toHaveBeenCalledWith({
      scope: { projectId: 'project-1', type: 'project' }
    })
  })

  it('passes metadata, scope movement, deletion and instantiation commands', async () => {
    const ipcMain = new FakeIpcMain()
    const updateBlockTemplate = vi.fn(async () => createTemplate())
    const moveBlockTemplate = vi.fn(async () => createTemplate())
    const deleteBlockTemplate = vi.fn(async () => undefined)
    const instantiateBlockTemplate = vi.fn(async () => createInstantiation())
    registerBlockTemplateIpcHandlers({
      deleteBlockTemplate,
      instantiateBlockTemplate,
      ipcMain,
      listBlockTemplates: vi.fn(),
      logger: silentLogger,
      moveBlockTemplate,
      saveBlockTemplate: vi.fn(),
      updateBlockTemplate
    })

    await ipcMain.invoke('cleancode:update-block-template', {
      description: 'Updated.',
      name: 'Updated',
      templateId: 'template-1'
    })
    await ipcMain.invoke('cleancode:move-block-template', {
      scope: { type: 'global' },
      templateId: 'template-1'
    })
    await ipcMain.invoke('cleancode:delete-block-template', { templateId: 'template-1' })
    await ipcMain.invoke('cleancode:instantiate-block-template', {
      origin: { x: 400, y: 300 },
      projectDirectory: '/project',
      templateId: 'template-1',
      workspaceId: 'workspace-2'
    })

    expect(updateBlockTemplate).toHaveBeenCalledWith({
      description: 'Updated.',
      name: 'Updated',
      templateId: 'template-1'
    })
    expect(moveBlockTemplate).toHaveBeenCalledWith({
      scope: { type: 'global' },
      templateId: 'template-1'
    })
    expect(deleteBlockTemplate).toHaveBeenCalledWith({ templateId: 'template-1' })
    expect(instantiateBlockTemplate).toHaveBeenCalledWith({
      origin: { x: 400, y: 300 },
      projectDirectory: '/project',
      templateId: 'template-1',
      workspaceId: 'workspace-2'
    })
  })

  it('rejects invalid scopes and partial placement coordinates', async () => {
    const ipcMain = new FakeIpcMain()
    const listBlockTemplates = vi.fn()
    const instantiateBlockTemplate = vi.fn()
    registerBlockTemplateIpcHandlers({
      deleteBlockTemplate: vi.fn(),
      instantiateBlockTemplate,
      ipcMain,
      listBlockTemplates,
      logger: silentLogger,
      moveBlockTemplate: vi.fn(),
      saveBlockTemplate: vi.fn(),
      updateBlockTemplate: vi.fn()
    })

    await expect(
      ipcMain.invoke('cleancode:list-block-templates', {
        scope: { projectId: ' ', type: 'project' }
      })
    ).resolves.toMatchObject({
      error: { code: 'INVALID_IPC_COMMAND' },
      ok: false
    })
    await expect(
      ipcMain.invoke('cleancode:instantiate-block-template', {
        origin: { x: 100 },
        projectDirectory: '/project',
        templateId: 'template-1',
        workspaceId: 'workspace-2'
      })
    ).resolves.toMatchObject({
      error: { code: 'INVALID_IPC_COMMAND' },
      ok: false
    })
    expect(listBlockTemplates).not.toHaveBeenCalled()
    expect(instantiateBlockTemplate).not.toHaveBeenCalled()
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
    return handler({}, command) as Promise<IpcInvokeResult<TResult>>
  }
}

const silentLogger: Logger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined
}

function createTemplate(): BlockTemplateSnapshot {
  return {
    id: 'template-1',
    type: 'terminal',
    name: 'API',
    description: '',
    scope: { type: 'global' },
    createdAt: '2026-07-30T08:00:00.000Z',
    updatedAt: '2026-07-30T08:00:00.000Z',
    nodes: [
      {
        templateNodeId: 'template-node-1',
        name: 'API',
        description: '',
        launchCommand: 'pnpm api',
        executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null },
        position: { x: 0, y: 0 },
        size: { width: 640, height: 360 }
      }
    ],
    connections: []
  }
}

function createInstantiation(): {
  readonly graph: BlockGraphSnapshot
  readonly instance: InstantiatedBlockTemplateSnapshot
  readonly template: BlockTemplateSnapshot
} {
  return {
    graph: {
      blocks: [],
      connections: [],
      id: 'graph-1',
      projectId: 'project-1',
      terminalGroups: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      workspaceId: 'workspace-2'
    },
    instance: {
      blockIds: ['block-1'],
      executionScope: { blockIds: ['block-1'], type: 'block-set' },
      terminalGroupId: null
    },
    template: createTemplate()
  }
}
