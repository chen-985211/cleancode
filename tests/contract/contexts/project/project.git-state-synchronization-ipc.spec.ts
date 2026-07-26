import type { BlockGraphSnapshot } from '../../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { GitBranchNavigationItemSnapshot } from '../../../../src/contexts/project/application/dto/GitBranchNavigationSnapshot'
import type { ProjectSnapshot } from '../../../../src/contexts/project/application/dto/ProjectSnapshot'
import {
  registerProjectIpcHandlers,
  type ProjectIpcHandlersInput
} from '../../../../src/platform/electron-main/projectIpcHandlers'
import type { IpcInvokeResult, IpcMainLike } from '../../../../src/platform/ipc/registerIpcHandler'
import type { Logger } from '../../../../src/platform/logging/Logger'

interface WorkbenchSnapshot {
  readonly project: ProjectSnapshot
  readonly gitBranches: readonly GitBranchNavigationItemSnapshot[]
  readonly graph: BlockGraphSnapshot
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

describe('project git state synchronization IPC contract', () => {
  it('forwards one-time locked worktree confirmation to archive', async () => {
    const ipcMain = new FakeIpcMain()
    const project = createProjectSnapshot('main')
    const workbench = createWorkbenchSnapshot(project)
    const archiveBranchWorkspace = vi.fn(async () => project)

    registerProjectIpcHandlers(
      createProjectIpcHandlersInput({
        ipcMain,
        archiveBranchWorkspace,
        loadWorkbench: vi.fn(async () => workbench)
      })
    )

    await expect(
      ipcMain.invoke<WorkbenchSnapshot>('cleancode:archive-branch-workspace', {
        projectDirectory: '/work/app',
        workspaceId: 'test-c',
        lockedWorktreeConfirmation: { lockReason: 'external agent session' }
      })
    ).resolves.toMatchObject({ ok: true })
    expect(archiveBranchWorkspace).toHaveBeenCalledWith({
      projectDirectory: '/work/app',
      workspaceId: 'test-c',
      lockedWorktreeConfirmation: { lockReason: 'external agent session' }
    })
  })

  it('rejects a malformed locked worktree confirmation', async () => {
    const ipcMain = new FakeIpcMain()
    const archiveBranchWorkspace = vi.fn()

    registerProjectIpcHandlers(
      createProjectIpcHandlersInput({
        ipcMain,
        archiveBranchWorkspace,
        loadWorkbench: vi.fn()
      })
    )

    await expect(
      ipcMain.invoke('cleancode:archive-branch-workspace', {
        projectDirectory: '/work/app',
        workspaceId: 'test-c',
        lockedWorktreeConfirmation: { lockReason: 42 }
      })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_IPC_COMMAND', isExpected: true }
    })
    expect(archiveBranchWorkspace).not.toHaveBeenCalled()
  })

  it('persists the selected project after switching and loading its workbench', async () => {
    const ipcMain = new FakeIpcMain()
    const project = createProjectSnapshot('main')
    const workbench = createWorkbenchSnapshot(project)
    const switchBranchWorkspace = vi.fn(async () => project)
    const loadWorkbench = vi.fn(async () => workbench)
    const selectCurrentProject = vi.fn(async () => undefined)

    registerProjectIpcHandlers(
      createProjectIpcHandlersInput({
        ipcMain,
        loadWorkbench,
        selectCurrentProject,
        switchBranchWorkspace
      })
    )

    await expect(
      ipcMain.invoke<WorkbenchSnapshot>('cleancode:switch-branch-workspace', {
        projectDirectory: '/work/app',
        workspaceId: 'main'
      })
    ).resolves.toEqual({
      ok: true,
      value: workbench
    })
    expect(selectCurrentProject).toHaveBeenCalledWith(project.directory)
    expect(loadWorkbench.mock.invocationCallOrder[0]).toBeLessThan(
      selectCurrentProject.mock.invocationCallOrder[0]!
    )
  })

  it('returns a reloaded workbench when project git state changes', async () => {
    const ipcMain = new FakeIpcMain()
    const project = createProjectSnapshot('feature/free')
    const workbench = createWorkbenchSnapshot(project)
    const synchronizeProjectGitState = vi.fn(async () => project)
    const loadWorkbench = vi.fn(async () => workbench)

    registerProjectIpcHandlers(
      createProjectIpcHandlersInput({
        ipcMain,
        loadWorkbench,
        synchronizeProjectGitState
      })
    )

    await expect(
      ipcMain.invoke<WorkbenchSnapshot | null>('cleancode:synchronize-project-git-state', {
        projectDirectory: '/work/app'
      })
    ).resolves.toEqual({
      ok: true,
      value: workbench
    })
    expect(synchronizeProjectGitState).toHaveBeenCalledWith({ projectDirectory: '/work/app' })
    expect(loadWorkbench).toHaveBeenCalledWith(project)
  })

  it('returns null without loading a workbench when project git state is unchanged', async () => {
    const ipcMain = new FakeIpcMain()
    const synchronizeProjectGitState = vi.fn(async () => null)
    const loadWorkbench = vi.fn()

    registerProjectIpcHandlers(
      createProjectIpcHandlersInput({
        ipcMain,
        loadWorkbench,
        synchronizeProjectGitState
      })
    )

    await expect(
      ipcMain.invoke<WorkbenchSnapshot | null>('cleancode:synchronize-project-git-state', {
        projectDirectory: '/work/app'
      })
    ).resolves.toEqual({
      ok: true,
      value: null
    })
    expect(loadWorkbench).not.toHaveBeenCalled()
  })
})

function createProjectIpcHandlersInput(input: {
  readonly archiveBranchWorkspace?: ProjectIpcHandlersInput['archiveBranchWorkspace']
  readonly ipcMain: IpcMainLike
  readonly loadWorkbench: ProjectIpcHandlersInput['loadWorkbench']
  readonly selectCurrentProject?: (directory: string) => Promise<void>
  readonly switchBranchWorkspace?: ProjectIpcHandlersInput['switchBranchWorkspace']
  readonly synchronizeProjectGitState?: ProjectIpcHandlersInput['synchronizeProjectGitState']
}): ProjectIpcHandlersInput {
  return {
    archiveBranchWorkspace: input.archiveBranchWorkspace ?? vi.fn(),
    checkoutMainWorkspaceBranch: vi.fn(),
    createBranchWorkspace: vi.fn(),
    createOrOpenProject: vi.fn(),
    forgetProject: vi.fn(),
    inferProjectName: (directory) => directory,
    ipcMain: input.ipcMain,
    loadRememberedWorkbenches: vi.fn(async () => []),
    loadWorkbench: input.loadWorkbench,
    logger: new SilentLogger(),
    rememberProject: vi.fn(),
    reorderProjects: vi.fn(),
    selectCurrentProject: input.selectCurrentProject ?? vi.fn(),
    selectProjectDirectory: vi.fn(async () => null),
    switchBranchWorkspace: input.switchBranchWorkspace ?? vi.fn(),
    synchronizeProjectGitState: input.synchronizeProjectGitState ?? vi.fn()
  }
}

function createProjectSnapshot(gitBranch: string): ProjectSnapshot {
  return {
    id: 'project-1',
    directory: '/work/app',
    name: 'app',
    workspaces: [
      {
        workspaceId: 'workspace-main',
        workspaceKind: 'default',
        displayName: 'main',
        directory: '/work/app',
        gitBranch,
        isCurrent: true
      }
    ]
  }
}

function createWorkbenchSnapshot(project: ProjectSnapshot): WorkbenchSnapshot {
  return {
    project,
    gitBranches: [
      {
        name: project.workspaces[0]?.gitBranch ?? 'main',
        isCurrent: true,
        isMainWorkspaceBranch: true,
        worktreeDirectory: project.directory,
        isSelectableInMainWorkspace: false,
        isLocked: false,
        lockReason: null
      }
    ],
    graph: {
      id: 'graph-1',
      projectId: project.id,
      workspaceId: 'main',
      viewport: { x: 0, y: 0, zoom: 1 },
      blocks: [],
      terminalGroups: []
    }
  }
}
