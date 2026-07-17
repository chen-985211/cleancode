import { ArchiveBranchWorkspaceUseCase } from '../../../../src/contexts/project/application/use-cases/ArchiveBranchWorkspaceUseCase'
import type { AppErrorCode } from '../../../../src/shared-kernel/application/errors/AppError'
import type {
  GitRepositoryInspection,
  GitWorkspacePort,
  PruneWorktreesCommand,
  RemoveBranchWorktreeCommand
} from '../../../../src/contexts/project/application/ports/GitWorkspacePort'
import type { ProjectRepository } from '../../../../src/contexts/project/application/ports/ProjectRepository'
import type { WorkspaceAgentLifecyclePort } from '../../../../src/contexts/project/application/ports/WorkspaceAgentLifecyclePort'
import type { ProjectSnapshot } from '../../../../src/contexts/project/application/dto/ProjectSnapshot'
import type { Project } from '../../../../src/contexts/project/domain/aggregates/Project'

class InMemoryProjectRepository implements ProjectRepository {
  readonly savedProjects: ProjectSnapshot[] = []
  saveError: Error | null = null
  private readonly projects = new Map<string, ProjectSnapshot>()

  async save(project: Project): Promise<void> {
    if (this.saveError) throw this.saveError
    const snapshot = project.toSnapshot()

    this.savedProjects.push(snapshot)
    this.projects.set(snapshot.directory, snapshot)
  }

  async findByDirectory(directory: string): Promise<ProjectSnapshot | null> {
    return this.projects.get(directory) ?? null
  }

  remember(snapshot: ProjectSnapshot): void {
    this.projects.set(snapshot.directory, snapshot)
  }
}

class FakeGitWorkspacePort implements GitWorkspacePort {
  inspection: GitRepositoryInspection = {
    isGitRepository: true,
    currentBranch: 'main',
    localBranches: ['main'],
    branches: []
  }
  workingTreeClean = true
  workingTreeCleanResults: boolean[] = []
  cleanChecks: string[] = []
  removeBranchWorktreeCalls: RemoveBranchWorktreeCommand[] = []
  pruneWorktreesCalls: PruneWorktreesCommand[] = []

  async inspectRepository(): Promise<GitRepositoryInspection> {
    return this.inspection
  }

  async createBranchWorktree(): Promise<void> {}

  async isWorkingTreeClean(directory: string): Promise<boolean> {
    this.cleanChecks.push(directory)

    return this.workingTreeCleanResults.shift() ?? this.workingTreeClean
  }

  async checkoutBranch(): Promise<void> {}

  async removeBranchWorktree(command: RemoveBranchWorktreeCommand): Promise<void> {
    this.removeBranchWorktreeCalls.push(command)
  }

  async pruneWorktrees(command: PruneWorktreesCommand): Promise<void> {
    this.pruneWorktreesCalls.push(command)
  }
}

describe('archive branch workspace use case', () => {
  it('rejects archiving a dirty worktree without removing it', async () => {
    const repository = new InMemoryProjectRepository()
    const git = new FakeGitWorkspacePort()
    const disposeWorkspace = vi.fn(async () => ({
      wasQuarantined: false,
      quarantine: () => undefined,
      release: () => undefined,
      resolve: () => undefined
    }))
    const noopLifecycle = createNoopLifecycle()
    const suspend = vi.fn(noopLifecycle.suspend)
    const lifecycle = {
      ...noopLifecycle,
      disposeWorkspace,
      suspend
    } satisfies WorkspaceAgentLifecyclePort
    const archiveBranchWorkspace = new ArchiveBranchWorkspaceUseCase(repository, git, lifecycle)
    git.workingTreeClean = false
    repository.remember(createProjectWithFeatureWorkspace(true))

    await expectAppErrorCode(
      archiveBranchWorkspace.execute({
        projectDirectory: '/work/app',
        workspaceName: 'feature/sidebar'
      }),
      'BRANCH_WORKSPACE_HAS_UNCOMMITTED_CHANGES'
    )

    expect(git.cleanChecks).toEqual(['/work/worktrees/app/feature/sidebar'])
    expect(git.removeBranchWorktreeCalls).toEqual([])
    expect(repository.savedProjects).toEqual([])
    expect(disposeWorkspace).not.toHaveBeenCalled()
    expect(suspend).not.toHaveBeenCalled()
  })

  it('archives a clean current worktree and selects main in the saved project', async () => {
    const repository = new InMemoryProjectRepository()
    const git = new FakeGitWorkspacePort()
    const lifecycleCalls: string[] = []
    const lifecycle = {
      disposeProject: vi.fn(async () => ({
        wasQuarantined: false,
        quarantine: () => undefined,
        release: () => undefined,
        resolve: () => undefined
      })),
      disposeWorkspace: vi.fn(async (command) => {
        lifecycleCalls.push(`dispose:${command.workspaceName}`)
        return {
          wasQuarantined: false,
          quarantine: () => lifecycleCalls.push(`quarantine:${command.workspaceName}`),
          release: () => lifecycleCalls.push(`release:${command.workspaceName}`),
          resolve: () => lifecycleCalls.push(`resolve:${command.workspaceName}`)
        }
      }),
      isWorkspaceQuarantined: vi.fn(() => false),
      resolveProjectQuarantines: vi.fn(),
      suspend: vi.fn(async () => ({
        wasQuarantined: false,
        quarantine: () => undefined,
        release: () => undefined,
        resolve: () => undefined,
        resume: async () => undefined,
        wasSuspended: false
      }))
    } satisfies WorkspaceAgentLifecyclePort
    const archiveBranchWorkspace = new ArchiveBranchWorkspaceUseCase(repository, git, lifecycle)
    repository.remember(createProjectWithFeatureWorkspace(true))

    const project = await archiveBranchWorkspace.execute({
      projectDirectory: '/work/app',
      workspaceName: 'feature/sidebar'
    })

    expect(git.cleanChecks).toEqual([
      '/work/worktrees/app/feature/sidebar',
      '/work/worktrees/app/feature/sidebar'
    ])
    expect(git.removeBranchWorktreeCalls).toEqual([
      {
        repositoryDirectory: '/work/app',
        worktreeDirectory: '/work/worktrees/app/feature/sidebar'
      }
    ])
    expect(git.pruneWorktreesCalls).toEqual([{ repositoryDirectory: '/work/app' }])
    expect(project.workspaces).toEqual([
      {
        name: 'main',
        directory: '/work/app',
        gitBranch: 'main',
        isCurrent: true
      }
    ])
    expect(repository.savedProjects.at(-1)).toEqual(project)
    expect(lifecycleCalls).toEqual(['dispose:feature/sidebar', 'resolve:feature/sidebar'])
  })

  it('keeps stale workspace attaches blocked if saving fails after worktree removal', async () => {
    const repository = new InMemoryProjectRepository()
    const git = new FakeGitWorkspacePort()
    const lifecycleCalls: string[] = []
    let isQuarantined = false
    const lifecycle = {
      disposeProject: vi.fn(async () => ({
        wasQuarantined: false,
        quarantine: () => undefined,
        release: () => undefined,
        resolve: () => undefined
      })),
      disposeWorkspace: vi.fn(async (command) => {
        lifecycleCalls.push(`dispose:${command.workspaceName}`)
        const wasQuarantined = isQuarantined
        return {
          wasQuarantined,
          quarantine: () => {
            isQuarantined = true
            lifecycleCalls.push(`quarantine:${command.workspaceName}`)
          },
          release: () => lifecycleCalls.push(`release:${command.workspaceName}`),
          resolve: () => {
            isQuarantined = false
            lifecycleCalls.push(`resolve:${command.workspaceName}`)
          }
        }
      }),
      isWorkspaceQuarantined: vi.fn(() => isQuarantined),
      resolveProjectQuarantines: vi.fn(),
      suspend: vi.fn(async () => ({
        wasQuarantined: false,
        quarantine: () => undefined,
        release: () => undefined,
        resolve: () => undefined,
        resume: async () => undefined,
        wasSuspended: false
      }))
    } satisfies WorkspaceAgentLifecyclePort
    repository.remember(createProjectWithFeatureWorkspace(true))
    repository.saveError = new Error('save failed')
    const archiveBranchWorkspace = new ArchiveBranchWorkspaceUseCase(repository, git, lifecycle)

    await expect(
      archiveBranchWorkspace.execute({
        projectDirectory: '/work/app',
        workspaceName: 'feature/sidebar'
      })
    ).rejects.toThrow('save failed')

    expect(git.removeBranchWorktreeCalls).toHaveLength(1)
    expect(lifecycleCalls).toEqual(['dispose:feature/sidebar', 'quarantine:feature/sidebar'])

    repository.saveError = null
    await archiveBranchWorkspace.execute({
      projectDirectory: '/work/app',
      workspaceName: 'feature/sidebar'
    })

    expect(git.cleanChecks).toHaveLength(2)
    expect(git.removeBranchWorktreeCalls).toHaveLength(1)
    expect(lifecycleCalls).toEqual([
      'dispose:feature/sidebar',
      'quarantine:feature/sidebar',
      'dispose:feature/sidebar',
      'resolve:feature/sidebar'
    ])
  })

  it('restores suspended Agents if the worktree becomes dirty while they drain', async () => {
    const repository = new InMemoryProjectRepository()
    const git = new FakeGitWorkspacePort()
    const lifecycleCalls: string[] = []
    const disposeWorkspace = vi.fn(createNoopLifecycle().disposeWorkspace)
    const lifecycle = {
      ...createNoopLifecycle(),
      disposeWorkspace,
      suspend: vi.fn(async (directory) => {
        lifecycleCalls.push(`suspend:${directory}`)
        return {
          wasQuarantined: false,
          quarantine: () => {
            lifecycleCalls.push(`quarantine:${directory}`)
          },
          release: () => {
            lifecycleCalls.push(`release:${directory}`)
          },
          resolve: () => {
            lifecycleCalls.push(`resolve:${directory}`)
          },
          resume: async () => {
            lifecycleCalls.push(`resume:${directory}`)
          },
          wasSuspended: true
        }
      })
    } satisfies WorkspaceAgentLifecyclePort
    const archiveBranchWorkspace = new ArchiveBranchWorkspaceUseCase(repository, git, lifecycle)
    git.workingTreeCleanResults.push(true, false)
    repository.remember(createProjectWithFeatureWorkspace(true))

    await expectAppErrorCode(
      archiveBranchWorkspace.execute({
        projectDirectory: '/work/app',
        workspaceName: 'feature/sidebar'
      }),
      'BRANCH_WORKSPACE_HAS_UNCOMMITTED_CHANGES'
    )

    expect(git.cleanChecks).toEqual([
      '/work/worktrees/app/feature/sidebar',
      '/work/worktrees/app/feature/sidebar'
    ])
    expect(disposeWorkspace).not.toHaveBeenCalled()
    expect(git.removeBranchWorktreeCalls).toEqual([])
    expect(lifecycleCalls).toEqual([
      'suspend:/work/worktrees/app/feature/sidebar',
      'resume:/work/worktrees/app/feature/sidebar',
      'release:/work/worktrees/app/feature/sidebar'
    ])
  })

  it('rejects archiving the main workspace', async () => {
    const repository = new InMemoryProjectRepository()
    const git = new FakeGitWorkspacePort()
    const archiveBranchWorkspace = new ArchiveBranchWorkspaceUseCase(repository, git)
    repository.remember(createProjectWithFeatureWorkspace(false))

    await expectAppErrorCode(
      archiveBranchWorkspace.execute({
        projectDirectory: '/work/app',
        workspaceName: 'main'
      }),
      'MAIN_WORKSPACE_CANNOT_BE_ARCHIVED'
    )

    expect(git.removeBranchWorktreeCalls).toEqual([])
    expect(repository.savedProjects).toEqual([])
  })
})

function createProjectWithFeatureWorkspace(featureIsCurrent: boolean): ProjectSnapshot {
  return {
    id: 'project-1',
    directory: '/work/app',
    name: 'app',
    workspaces: [
      {
        name: 'main',
        directory: '/work/app',
        gitBranch: 'main',
        isCurrent: !featureIsCurrent
      },
      {
        name: 'feature/sidebar',
        directory: '/work/worktrees/app/feature/sidebar',
        gitBranch: 'feature/sidebar',
        isCurrent: featureIsCurrent
      }
    ]
  }
}

async function expectAppErrorCode(promise: Promise<unknown>, code: AppErrorCode): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code })
}

function createNoopLifecycle(): WorkspaceAgentLifecyclePort {
  const lease = {
    wasQuarantined: false,
    quarantine: () => undefined,
    release: () => undefined,
    resolve: () => undefined
  }
  return {
    disposeProject: async () => lease,
    disposeWorkspace: async () => lease,
    isWorkspaceQuarantined: () => false,
    resolveProjectQuarantines: () => undefined,
    suspend: async () => ({
      ...lease,
      resume: async () => undefined,
      wasSuspended: false
    })
  }
}
