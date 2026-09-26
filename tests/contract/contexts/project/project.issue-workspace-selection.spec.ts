import { setImmediate } from 'node:timers/promises'
import { createDeferred } from '../../../fixtures/deferred'
import { Project } from '../../../../src/contexts/project/domain/aggregates/Project'
import type { ProjectSnapshot } from '../../../../src/contexts/project/application/dto/ProjectSnapshot'
import type { ProjectRegistrySnapshot } from '../../../../src/contexts/project/application/dto/ProjectRegistrySnapshot'
import type {
  GitBranchInspection,
  GitWorkspacePort
} from '../../../../src/contexts/project/application/ports/GitWorkspacePort'
import type { WorkspaceInitializationSnapshot } from '../../../../src/contexts/project/application/dto/WorkspaceInitializationDetails'
import { ProjectWorkspaceTransactionCoordinator } from '../../../../src/contexts/project/application/use-cases/ProjectWorkspaceTransactionCoordinator'
import { PrepareWorkspaceInitializationUseCase } from '../../../../src/contexts/project/application/use-cases/PrepareWorkspaceInitializationUseCase'
import { CreateBranchWorkspaceUseCase } from '../../../../src/contexts/project/application/use-cases/CreateBranchWorkspaceUseCase'
import { SwitchBranchWorkspaceUseCase } from '../../../../src/contexts/project/application/use-cases/SwitchBranchWorkspaceUseCase'
import { SelectCurrentProjectUseCase } from '../../../../src/contexts/project/application/use-cases/SelectCurrentProjectUseCase'
import { SynchronizeProjectGitStateUseCase } from '../../../../src/contexts/project/application/use-cases/SynchronizeProjectGitStateUseCase'
import { GitHubCliIssueAdapter } from '../../../../src/contexts/project/infrastructure/github/GitHubCliIssueAdapter'
import { GitCliIssueBaseAdapter } from '../../../../src/contexts/project/infrastructure/filesystem/GitCliIssueBaseAdapter'
import { registerProjectIssuesRuntime } from '../../../../src/platform/electron-main/projectIssuesRuntime'
import { registerProjectIpcHandlers } from '../../../../src/platform/electron-main/projectIpcHandlers'
import { loadRememberedWorkbenchList } from '../../../../src/platform/electron-main/loadRememberedWorkbenchList'
import type { IpcInvokeResult } from '../../../../src/platform/ipc/registerIpcHandler'
import type { WorkbenchSnapshot } from '../../../../src/presentation/app-shell/types/workbenchSnapshot'
import { createWorkbenchSnapshot } from '../../../fixtures/presentation/appShellFixtures'

const command = {
  projectDirectory: '/b',
  repository: 'owner/repo',
  number: 42,
  branchName: 'issue/42',
  baseBranch: 'main'
}

describe('issue creation and explicit workspace selection', () => {
  afterEach(() => vi.restoreAllMocks())

  it('keeps creation separate from selection and restores the accepted project and workspace', async () => {
    const f = fixture()
    const created = await f.invoke('cleancode:start-issue-workspace', command)
    expect(created.graph.workspaceId).not.toBe('main')
    expect(await f.selection()).toEqual(['/a', 'main'])
    expect(f.project('/b').workspaces.find((item) => item.isCurrent)?.workspaceId).toBe('main')
    await f.invoke('cleancode:switch-branch-workspace', {
      projectDirectory: '/b',
      workspaceId: created.graph.workspaceId
    })
    expect(await f.selection()).toEqual(['/b', created.graph.workspaceId])
  })

  it('persists the latest navigation when an earlier workbench load is slow', async () => {
    const f = fixture()
    const created = await f.invoke('cleancode:start-issue-workspace', command)
    const gate = createDeferred<void>()
    const entered = createDeferred<void>()
    const load = f.loadWorkbench.getMockImplementation()!
    f.loadWorkbench.mockImplementationOnce(async (project) => {
      entered.resolve()
      await gate.promise
      return load(project)
    })
    const older = f.invoke('cleancode:switch-branch-workspace', {
      projectDirectory: '/b',
      workspaceId: created.graph.workspaceId
    })
    await entered.promise
    const newer = f.invoke('cleancode:switch-branch-workspace', {
      projectDirectory: '/a',
      workspaceId: 'main'
    })
    // Drain runnable commands while the earlier load is held at an explicit gate.
    await setImmediate()
    gate.resolve()
    await Promise.all([older, newer])
    expect(await f.selection()).toEqual(['/a', 'main'])
  })

  it.each(['same-project', 'other-project'] as const)(
    'preserves a newer %s selection through completion, retry, Git sync and reload',
    async (selection) => {
      const f = fixture()
      const gate = createDeferred<string>()
      const entered = createDeferred<void>()
      vi.spyOn(GitCliIssueBaseAdapter.prototype, 'resolve').mockImplementationOnce(() => {
        entered.resolve()
        return gate.promise
      })
      const creation = f.invoke('cleancode:start-issue-workspace', command)
      await entered.promise
      const directory = selection === 'same-project' ? '/b' : '/a'
      await f.invoke('cleancode:switch-branch-workspace', {
        projectDirectory: directory,
        workspaceId: 'feature'
      })
      gate.resolve('a'.repeat(40))
      const created = await creation
      expect(created.project.workspaces.find((item) => item.isCurrent)?.workspaceId).toBe(
        created.graph.workspaceId
      )
      expect(await f.selection()).toEqual([directory, 'feature'])
      await f.invoke('cleancode:start-issue-workspace', command)
      expect(await f.selection()).toEqual([directory, 'feature'])
      expect(f.git.createBranchWorktree).toHaveBeenCalledOnce()
      f.addGitWorktree(directory, 'external', `${directory}-external`)
      await f.sync.execute({ projectDirectory: directory })
      expect(await f.selection()).toEqual([directory, 'feature'])
      expect(f.project('/b').workspaces.some((item) => item.issue?.id === 'I_42')).toBe(true)
    }
  )
})

function fixture() {
  vi.spyOn(GitHubCliIssueAdapter.prototype, 'issue').mockResolvedValue({
    id: 'I_42',
    repository: 'owner/repo',
    number: 42,
    title: 'Task',
    url: 'https://github.com/owner/repo/issues/42',
    body: '',
    state: 'OPEN',
    labels: [],
    assignees: []
  })
  vi.spyOn(GitCliIssueBaseAdapter.prototype, 'resolve').mockResolvedValue('a'.repeat(40))
  const snapshots = new Map<string, ProjectSnapshot>(
    ['/a', '/b'].map((directory) => [
      directory,
      Project.create({ id: directory, directory, name: directory, defaultWorkspaceId: 'main' })
        .bindDefaultWorkspaceToGit({ directory, gitBranch: 'main' })
        .bindIssueRepository('owner/repo')
        .addLinkedWorktreeWorkspace({
          workspaceId: 'feature',
          displayName: 'feature',
          gitBranch: 'feature',
          directory: `${directory}-feature`
        })
        .switchCurrentWorkspace('main')
        .toSnapshot()
    ])
  )
  const project = (directory: string) => snapshots.get(directory)!
  const projects = {
    findByDirectory: async (directory: string) => snapshots.get(directory) ?? null,
    save: async (value: Project) => {
      snapshots.set(value.directory, value.toSnapshot())
    }
  }
  let registrySnapshot: ProjectRegistrySnapshot = {
    projectDirectories: ['/a', '/b'],
    currentProjectDirectory: '/a'
  }
  const registry = {
    get: async () => registrySnapshot,
    save: async (value: { toSnapshot: () => ProjectRegistrySnapshot }) => {
      registrySnapshot = value.toSnapshot()
    }
  }
  const branches = new Map<string, GitBranchInspection[]>(
    ['/a', '/b'].map((directory) => [
      directory,
      project(directory).workspaces.map((workspace) => ({
        name: workspace.gitBranch!,
        worktreeDirectory: workspace.directory,
        isCurrent: workspace.gitBranch === 'main',
        isLocked: false,
        lockReason: null
      }))
    ])
  )
  const addGitWorktree = (directory: string, name: string, worktreeDirectory: string) => {
    branches
      .get(directory)!
      .push({ name, worktreeDirectory, isCurrent: false, isLocked: false, lockReason: null })
  }
  const git = {
    inspectRepository: async (directory: string) => ({
      isGitRepository: true,
      currentBranch: 'main',
      localBranches: branches.get(directory)!.map((branch) => branch.name),
      branches: branches.get(directory)!
    }),
    createBranchWorktree: vi.fn<GitWorkspacePort['createBranchWorktree']>(async (value) => {
      addGitWorktree(value.repositoryDirectory, value.branchName, value.worktreeDirectory)
    }),
    isWorkingTreeClean: vi.fn(),
    checkoutBranch: vi.fn(),
    lockBranchWorktree: vi.fn(),
    removeBranchWorktree: vi.fn(),
    unlockBranchWorktree: vi.fn(),
    pruneWorktrees: vi.fn()
  }
  const directories = {
    resolveBranchWorkspaceDirectory: ({
      projectDirectory,
      branchName
    }: {
      projectDirectory: string
      branchName: string
    }) => `${projectDirectory}-${branchName.replaceAll('/', '-')}`
  }
  const transactions = new ProjectWorkspaceTransactionCoordinator()
  const create = new CreateBranchWorkspaceUseCase(projects, git, directories, transactions)
  const records = new Map<string, WorkspaceInitializationSnapshot>()
  const preparation = new PrepareWorkspaceInitializationUseCase({
    projects,
    registry,
    transactions,
    git,
    directories,
    repository: {
      getDefaults: async () => ({ templates: [], agents: [] }),
      saveDefaults: vi.fn(),
      find: async (id) => records.get(id) ?? null,
      list: async (id) => [...records.values()].filter((record) => record.projectId === id),
      save: async (snapshot) => {
        records.set(snapshot.id, structuredClone(snapshot))
      }
    },
    content: {
      listTemplateIds: async () => [],
      hasPreparedTemplate: vi.fn(),
      isEmpty: vi.fn(),
      prepareTemplate: vi.fn(),
      createTemplate: vi.fn(),
      createAgent: vi.fn(),
      run: vi.fn()
    },
    createWorkspace: (value, receipt) => create.execute(value, receipt)
  })
  const switchWorkspace = new SwitchBranchWorkspaceUseCase(projects, transactions)
  const select = new SelectCurrentProjectUseCase(registry)
  const selectCurrentProject = async (directory: string | null) => {
    await select.execute({ directory })
  }
  const sync = new SynchronizeProjectGitStateUseCase(projects, git, undefined, transactions)
  const handlers = new Map<
    string,
    (event: unknown, value?: unknown) => Promise<IpcInvokeResult<unknown>>
  >()
  const ipcMain = {
    handle: (
      channel: string,
      handler: (event: unknown, value?: unknown) => Promise<IpcInvokeResult<unknown>>
    ) => {
      handlers.set(channel, handler)
    }
  }
  const logger = { debug() {}, info() {}, warn() {}, error() {} }
  const loadWorkbench = vi.fn(async (value: ProjectSnapshot): Promise<WorkbenchSnapshot> => {
    const fixture = createWorkbenchSnapshot(value.directory, value.name)
    return {
      ...fixture,
      project: value,
      graph: {
        ...fixture.graph,
        workspaceId: value.workspaces.find((item) => item.isCurrent)!.workspaceId
      }
    }
  })
  const loadRememberedWorkbenches = () =>
    loadRememberedWorkbenchList({
      findProject: projects.findByDirectory,
      listRememberedProjects: registry.get,
      openProject: async ({ directory }) => project(directory),
      loadWorkbench,
      selectCurrentProject
    })
  registerProjectIssuesRuntime({
    projects,
    registry,
    transactions,
    preparation,
    loadWorkbench,
    ipcMain,
    logger
  })
  registerProjectIpcHandlers({
    ipcMain,
    logger,
    loadWorkbench,
    selectCurrentProject,
    loadRememberedWorkbenches,
    switchBranchWorkspace: (value) => switchWorkspace.execute(value),
    synchronizeProjectGitState: (value) => sync.execute(value),
    createBranchWorkspace: (value) => preparation.create(value),
    selectProjectDirectory: vi.fn(),
    inferProjectName: vi.fn(),
    createOrOpenProject: vi.fn(),
    archiveBranchWorkspace: vi.fn(),
    checkoutMainWorkspaceBranch: vi.fn(),
    forgetProject: vi.fn(),
    rememberProject: vi.fn(),
    reorderProjects: vi.fn(),
    getWorkspaceExternalOpenCapabilities: vi.fn(),
    openWorkspaceExternally: vi.fn()
  })
  return {
    git,
    sync,
    project,
    addGitWorktree,
    loadWorkbench,
    invoke: async (channel: string, value: unknown) => {
      const response = await handlers.get(channel)!({}, value)
      expect(response.ok).toBe(true)
      if (!response.ok) throw new Error(response.error.message)
      return response.value as WorkbenchSnapshot
    },
    selection: async () => {
      const reloaded = (await loadRememberedWorkbenches()).find((item) => item.isCurrentProject)!
      return [reloaded.project.directory, reloaded.graph.workspaceId]
    }
  }
}
