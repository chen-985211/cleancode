import { registerWorkspaceInitializationIpcHandlers } from '../../../../src/platform/electron-main/workspaceInitializationIpcHandlers'
import type { IpcMainLike } from '../../../../src/platform/ipc/registerIpcHandler'
import type { Logger } from '../../../../src/platform/logging/Logger'

describe('workspace initialization IPC', () => {
  it('passes explicit defaults and a complete workspace identity through the boundary', async () => {
    const { invoke, saveDefaults, apply } = setup()
    const defaults = {
      templates: [{ templateId: 'startup', runAfterPlacement: false }],
      agents: [
        { providerId: 'provider', count: 2 },
        { providerId: 'another', count: 1 }
      ]
    }
    await invoke('cleancode:save-workspace-defaults', { projectDirectory: '/project', defaults })
    expect(saveDefaults).toHaveBeenCalledWith('/project', defaults)
    const command = {
      initializationId: 'request',
      projectId: 'project',
      workspaceId: 'workspace',
      positions: [{ itemId: 'item', x: 1, y: 2 }]
    }
    await invoke('cleancode:apply-workspace-initialization', command)
    expect(apply).toHaveBeenCalledWith(command)
  })
  it.each([0, 1.5, 101])('rejects invalid quantities before saving (%s)', async (count) => {
    const { invoke, saveDefaults } = setup()
    expect(
      await invoke('cleancode:save-workspace-defaults', {
        projectDirectory: '/project',
        defaults: { templates: [], agents: [{ providerId: 'provider', count }] }
      })
    ).toMatchObject({ ok: false })
    expect(saveDefaults).not.toHaveBeenCalled()
  })
  it.each([
    { initializationId: 'request', projectId: 'project', positions: [] },
    {
      initializationId: 'request',
      projectId: 'project',
      workspaceId: 'workspace',
      positions: [{ itemId: 'item', x: Infinity, y: 0 }]
    },
    {
      initializationId: 'request',
      projectId: 'project',
      workspaceId: 'workspace',
      positions: [],
      retryItemId: 'item',
      skipItemId: 'item'
    },
    {
      initializationId: 'request',
      projectId: 'project',
      workspaceId: 'workspace',
      positions: [
        { itemId: 'item', x: 0, y: 0 },
        { itemId: 'item', x: 1, y: 1 }
      ]
    }
  ])(
    'rejects malformed or conflicting initialization commands before side effects',
    async (command) => {
      const { invoke, apply } = setup()
      expect(await invoke('cleancode:apply-workspace-initialization', command)).toMatchObject({
        ok: false,
        error: { code: 'INVALID_IPC_COMMAND' }
      })
      expect(apply).not.toHaveBeenCalled()
    }
  )
})

function setup() {
  const handlers = new Map<string, (event: unknown, command: unknown) => unknown>()
  const ipcMain: IpcMainLike = {
    handle: (channel, handler) => {
      handlers.set(channel, handler)
    }
  }
  const logger: Logger = { debug() {}, info() {}, warn() {}, error() {} }
  const saveDefaults = vi.fn(async () => {})
  const apply = vi.fn()
  registerWorkspaceInitializationIpcHandlers({
    ipcMain,
    logger,
    saveDefaults,
    apply,
    cancel: vi.fn(),
    getDefaults: vi.fn(),
    list: vi.fn(),
    begin: vi.fn()
  })
  return {
    saveDefaults,
    apply,
    invoke: (channel: string, command: unknown) => handlers.get(channel)!({}, command)
  }
}
