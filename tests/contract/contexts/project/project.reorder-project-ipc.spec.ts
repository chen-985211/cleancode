import type { BlockGraphSnapshot } from '../../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { GitBranchNavigationItemSnapshot } from '../../../../src/contexts/project/application/dto/GitBranchNavigationSnapshot'
import type { ProjectSnapshot } from '../../../../src/contexts/project/application/dto/ProjectSnapshot'
import { registerProjectIpcHandlers } from '../../../../src/platform/electron-main/projectIpcHandlers'
import type { IpcInvokeResult, IpcMainLike } from '../../../../src/platform/ipc/registerIpcHandler'
import type { Logger } from '../../../../src/platform/logging/Logger'

interface WorkbenchSnapshot {
  readonly project: ProjectSnapshot
  readonly gitBranches: readonly GitBranchNavigationItemSnapshot[]
  readonly graph: BlockGraphSnapshot
}

describe('project reorder IPC contract', () => {
  it('reorders a project before a remembered sibling and returns the authoritative list', async () => {
    const ipcMain = new FakeIpcMain()
    const workbench = createWorkbenchSnapshot()
    const reorderProjects = vi.fn(async () => undefined)
    const loadRememberedWorkbenches = vi.fn(async () => [workbench])

    registerProjectIpcHandlers({
      ...createProjectIpcHandlersInput(ipcMain),
      loadRememberedWorkbenches,
      reorderProjects
    })

    await expect(
      ipcMain.invoke<WorkbenchSnapshot[]>('cleancode:reorder-project', {
        projectDirectory: '/work/gamma',
        beforeProjectDirectory: '/work/alpha'
      })
    ).resolves.toEqual({ ok: true, value: [workbench] })
    expect(reorderProjects).toHaveBeenCalledWith({
      projectDirectory: '/work/gamma',
      beforeProjectDirectory: '/work/alpha'
    })
    expect(loadRememberedWorkbenches).toHaveBeenCalledOnce()
  })

  it('accepts null as the target for moving a project to the end', async () => {
    const ipcMain = new FakeIpcMain()
    const reorderProjects = vi.fn(async () => undefined)

    registerProjectIpcHandlers({
      ...createProjectIpcHandlersInput(ipcMain),
      reorderProjects
    })

    await expect(
      ipcMain.invoke('cleancode:reorder-project', {
        projectDirectory: '/work/alpha',
        beforeProjectDirectory: null
      })
    ).resolves.toMatchObject({ ok: true })
    expect(reorderProjects).toHaveBeenCalledWith({
      projectDirectory: '/work/alpha',
      beforeProjectDirectory: null
    })
  })

  it('rejects malformed project reorder commands before invoking the use case', async () => {
    const ipcMain = new FakeIpcMain()
    const reorderProjects = vi.fn()

    registerProjectIpcHandlers({
      ...createProjectIpcHandlersInput(ipcMain),
      reorderProjects
    })

    await expect(
      ipcMain.invoke('cleancode:reorder-project', {
        projectDirectory: '/work/gamma',
        beforeProjectDirectory: 42
      })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_IPC_COMMAND', isExpected: true }
    })
    expect(reorderProjects).not.toHaveBeenCalled()
  })
})

function createProjectIpcHandlersInput(ipcMain: IpcMainLike) {
  return {
    archiveBranchWorkspace: vi.fn(),
    checkoutMainWorkspaceBranch: vi.fn(),
    createBranchWorkspace: vi.fn(),
    createOrOpenProject: vi.fn(),
    forgetProject: vi.fn(),
    inferProjectName: (directory: string) => directory,
    ipcMain,
    loadRememberedWorkbenches: vi.fn(async () => []),
    loadWorkbench: vi.fn(),
    logger: new SilentLogger(),
    rememberProject: vi.fn(),
    reorderProjects: vi.fn(),
    selectCurrentProject: vi.fn(),
    selectProjectDirectory: vi.fn(async () => null),
    switchBranchWorkspace: vi.fn(),
    synchronizeProjectGitState: vi.fn()
  }
}

function createWorkbenchSnapshot(): WorkbenchSnapshot {
  const project: ProjectSnapshot = {
    id: 'project-1',
    directory: '/work/app',
    name: 'app',
    workspaces: [
      {
        name: 'main',
        directory: '/work/app',
        gitBranch: 'main',
        isCurrent: true
      }
    ]
  }

  return {
    project,
    gitBranches: [],
    graph: {
      id: 'graph-1',
      projectId: project.id,
      workspaceName: 'main',
      viewport: { x: 0, y: 0, zoom: 1 },
      blocks: [],
      terminalGroups: []
    }
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

    if (!handler) {
      throw new Error(`No handler registered for ${channel}`)
    }

    return handler({}, command) as Promise<IpcInvokeResult<TResult>>
  }
}

class SilentLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}
