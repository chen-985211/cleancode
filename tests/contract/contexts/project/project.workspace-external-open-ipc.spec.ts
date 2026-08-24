import type { WorkspaceExternalOpenCapabilitiesSnapshot } from '../../../../src/contexts/project/application/dto/WorkspaceExternalOpen'
import { registerProjectIpcHandlers } from '../../../../src/platform/electron-main/projectIpcHandlers'
import type { IpcInvokeResult, IpcMainLike } from '../../../../src/platform/ipc/registerIpcHandler'
import type { Logger } from '../../../../src/platform/logging/Logger'

describe('workspace external open IPC contract', () => {
  it('returns the system capabilities without a renderer-supplied path', async () => {
    const ipcMain = new FakeIpcMain()
    const capabilities: WorkspaceExternalOpenCapabilitiesSnapshot = {
      vscode: { available: true, iconDataUrl: 'data:image/png;base64,vscode' }
    }
    const getWorkspaceExternalOpenCapabilities = vi.fn(async () => capabilities)

    registerProjectIpcHandlers({
      ...createProjectIpcHandlersInput(ipcMain),
      getWorkspaceExternalOpenCapabilities
    })

    await expect(
      ipcMain.invoke('cleancode:get-workspace-external-open-capabilities')
    ).resolves.toEqual({ ok: true, value: capabilities })
    expect(getWorkspaceExternalOpenCapabilities).toHaveBeenCalledWith()
  })

  it.each(['vscode', 'folder'] as const)('forwards the fixed %s target', async (target) => {
    const ipcMain = new FakeIpcMain()
    const openWorkspaceExternally = vi.fn(async () => undefined)

    registerProjectIpcHandlers({
      ...createProjectIpcHandlersInput(ipcMain),
      openWorkspaceExternally
    })

    await expect(
      ipcMain.invoke('cleancode:open-workspace-externally', {
        projectDirectory: '/work/app',
        target,
        workspaceId: 'feature'
      })
    ).resolves.toEqual({ ok: true, value: undefined })
    expect(openWorkspaceExternally).toHaveBeenCalledWith({
      projectDirectory: '/work/app',
      target,
      workspaceId: 'feature'
    })
  })

  it('rejects arbitrary application targets before invoking the use case', async () => {
    const ipcMain = new FakeIpcMain()
    const openWorkspaceExternally = vi.fn()

    registerProjectIpcHandlers({
      ...createProjectIpcHandlersInput(ipcMain),
      openWorkspaceExternally
    })

    await expect(
      ipcMain.invoke('cleancode:open-workspace-externally', {
        projectDirectory: '/work/app',
        target: 'terminal',
        workspaceId: 'main'
      })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_IPC_COMMAND', isExpected: true }
    })
    expect(openWorkspaceExternally).not.toHaveBeenCalled()
  })
})

function createProjectIpcHandlersInput(ipcMain: IpcMainLike) {
  return {
    archiveBranchWorkspace: vi.fn(),
    checkoutMainWorkspaceBranch: vi.fn(),
    createBranchWorkspace: vi.fn(),
    createOrOpenProject: vi.fn(),
    forgetProject: vi.fn(),
    getWorkspaceExternalOpenCapabilities: vi.fn(async () => ({
      vscode: { available: false, iconDataUrl: null }
    })),
    inferProjectName: (directory: string) => directory,
    ipcMain,
    loadRememberedWorkbenches: vi.fn(async () => []),
    loadWorkbench: vi.fn(),
    logger: new SilentLogger(),
    openWorkspaceExternally: vi.fn(),
    rememberProject: vi.fn(),
    reorderProjects: vi.fn(),
    selectCurrentProject: vi.fn(),
    selectProjectDirectory: vi.fn(async () => null),
    switchBranchWorkspace: vi.fn(),
    synchronizeProjectGitState: vi.fn()
  }
}

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
    if (!handler) throw new Error(`No handler registered for ${channel}`)

    return handler({}, command) as Promise<IpcInvokeResult<TResult>>
  }
}

class SilentLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}
