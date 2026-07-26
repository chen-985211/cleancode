import { SynchronizeProjectGitStateUseCase } from '../../../../src/contexts/project/application/use-cases/SynchronizeProjectGitStateUseCase'
import type {
  CheckoutBranchCommand,
  CreateBranchWorktreeCommand,
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
  private readonly projects = new Map<string, ProjectSnapshot>()

  async save(project: Project): Promise<void> {
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
    isGitRepository: false,
    currentBranch: null,
    localBranches: [],
    branches: []
  }
  inspectionError: Error | null = null
  readonly checkoutBranchCalls: CheckoutBranchCommand[] = []

  async inspectRepository(): Promise<GitRepositoryInspection> {
    if (this.inspectionError) throw this.inspectionError
    return this.inspection
  }

  async createBranchWorktree(command: CreateBranchWorktreeCommand): Promise<void> {
    void command
  }

  async isWorkingTreeClean(): Promise<boolean> {
    return true
  }

  async checkoutBranch(command: CheckoutBranchCommand): Promise<void> {
    this.checkoutBranchCalls.push(command)
  }

  async lockBranchWorktree(): Promise<void> {}

  async removeBranchWorktree(command: RemoveBranchWorktreeCommand): Promise<void> {
    void command
  }

  async unlockBranchWorktree(): Promise<void> {}

  async pruneWorktrees(command: PruneWorktreesCommand): Promise<void> {
    void command
  }
}

describe('project git state synchronization use case', () => {
  it('synchronizes the main workspace branch after an external checkout', async () => {
    const repository = new InMemoryProjectRepository()
    const git = new FakeGitWorkspacePort()
    const synchronizeProjectGitState = new SynchronizeProjectGitStateUseCase(repository, git)
    repository.remember(createProjectSnapshot('main'))
    git.inspection = {
      isGitRepository: true,
      currentBranch: 'feature/free',
      localBranches: ['feature/free', 'main'],
      branches: [
        {
          name: 'feature/free',
          worktreeDirectory: '/work/app',
          isCurrent: true,
          isLocked: false,
          lockReason: null
        },
        {
          name: 'main',
          worktreeDirectory: null,
          isCurrent: false,
          isLocked: false,
          lockReason: null
        }
      ]
    }

    const project = await synchronizeProjectGitState.execute({ projectDirectory: '/work/app' })

    expect(project?.workspaces).toEqual([
      {
        workspaceId: 'workspace-main',
        workspaceKind: 'default',
        displayName: 'main',
        directory: '/work/app',
        gitBranch: 'feature/free',
        isCurrent: true
      }
    ])
    expect(repository.savedProjects.at(-1)).toEqual(project)
    expect(git.checkoutBranchCalls).toEqual([])
  })

  it('does not save when synchronized git state has not changed', async () => {
    const repository = new InMemoryProjectRepository()
    const git = new FakeGitWorkspacePort()
    const synchronizeProjectGitState = new SynchronizeProjectGitStateUseCase(repository, git)
    repository.remember(createProjectSnapshot('main'))
    git.inspection = {
      isGitRepository: true,
      currentBranch: 'main',
      localBranches: ['main'],
      branches: [
        {
          name: 'main',
          worktreeDirectory: '/work/app',
          isCurrent: true,
          isLocked: false,
          lockReason: null
        }
      ]
    }

    await expect(
      synchronizeProjectGitState.execute({ projectDirectory: '/work/app' })
    ).resolves.toBeNull()

    expect(repository.savedProjects).toEqual([])
  })

  it('synchronizes a non-git project back to the logical main workspace', async () => {
    const repository = new InMemoryProjectRepository()
    const git = new FakeGitWorkspacePort()
    const synchronizeProjectGitState = new SynchronizeProjectGitStateUseCase(repository, git)
    repository.remember(createProjectSnapshot('feature/stale'))

    const project = await synchronizeProjectGitState.execute({ projectDirectory: '/work/app' })

    expect(project?.workspaces).toEqual([
      {
        workspaceId: 'workspace-main',
        workspaceKind: 'default',
        displayName: 'main',
        directory: '/work/app',
        gitBranch: null,
        isCurrent: true
      }
    ])
    expect(repository.savedProjects.at(-1)).toEqual(project)
  })

  it('does not resolve Agent quarantines when Git inspection fails', async () => {
    const repository = new InMemoryProjectRepository()
    const git = new FakeGitWorkspacePort()
    const resolveProjectQuarantines = vi.fn()
    const lifecycle = {
      disposeProject: vi.fn(),
      disposeWorkspace: vi.fn(),
      isWorkspaceQuarantined: vi.fn(() => true),
      resolveProjectQuarantines,
      suspend: vi.fn()
    } satisfies WorkspaceAgentLifecyclePort
    const synchronizeProjectGitState = new SynchronizeProjectGitStateUseCase(
      repository,
      git,
      lifecycle
    )
    repository.remember(createProjectSnapshot('main'))
    git.inspectionError = new Error('git inspection failed')

    await expect(
      synchronizeProjectGitState.execute({ projectDirectory: '/work/app' })
    ).rejects.toThrow('git inspection failed')

    expect(repository.savedProjects).toEqual([])
    expect(resolveProjectQuarantines).not.toHaveBeenCalled()
  })

  it('discovers external worktrees and drops stale worktree workspaces', async () => {
    const repository = new InMemoryProjectRepository()
    const git = new FakeGitWorkspacePort()
    const synchronizeProjectGitState = new SynchronizeProjectGitStateUseCase(repository, git)

    repository.remember({
      id: 'project-1',
      directory: '/work/app',
      name: 'app',
      workspaces: [
        {
          workspaceId: 'main',
          workspaceKind: 'default',
          displayName: 'main',
          directory: '/work/app',
          gitBranch: 'main',
          isCurrent: true
        },
        {
          workspaceId: 'feature/stale',
          workspaceKind: 'linked-worktree',
          displayName: 'feature/stale',
          directory: '/work/app-stale',
          gitBranch: 'feature/stale',
          isCurrent: false
        }
      ]
    })
    git.inspection = {
      isGitRepository: true,
      currentBranch: 'main',
      localBranches: ['feature/sidebar', 'feature/stale', 'main'],
      branches: [
        {
          name: 'feature/sidebar',
          worktreeDirectory: '/work/app-sidebar',
          isCurrent: false,
          isLocked: false,
          lockReason: null
        },
        {
          name: 'feature/stale',
          worktreeDirectory: null,
          isCurrent: false,
          isLocked: false,
          lockReason: null
        },
        {
          name: 'main',
          worktreeDirectory: '/work/app',
          isCurrent: true,
          isLocked: false,
          lockReason: null
        }
      ]
    }

    const project = await synchronizeProjectGitState.execute({ projectDirectory: '/work/app' })

    expect(project?.workspaces).toEqual([
      {
        workspaceId: 'main',
        workspaceKind: 'default',
        displayName: 'main',
        directory: '/work/app',
        gitBranch: 'main',
        isCurrent: true
      },
      {
        workspaceId: expect.any(String),
        workspaceKind: 'linked-worktree',
        displayName: 'feature/sidebar',
        directory: '/work/app-sidebar',
        gitBranch: 'feature/sidebar',
        isCurrent: false
      }
    ])
  })

  it('falls back to the main workspace when the current worktree disappears', async () => {
    const repository = new InMemoryProjectRepository()
    const git = new FakeGitWorkspacePort()
    const synchronizeProjectGitState = new SynchronizeProjectGitStateUseCase(repository, git)

    repository.remember({
      id: 'project-1',
      directory: '/work/app',
      name: 'app',
      workspaces: [
        {
          workspaceId: 'main',
          workspaceKind: 'default',
          displayName: 'main',
          directory: '/work/app',
          gitBranch: 'main',
          isCurrent: false
        },
        {
          workspaceId: 'feature/sidebar',
          workspaceKind: 'linked-worktree',
          displayName: 'feature/sidebar',
          directory: '/work/app-sidebar',
          gitBranch: 'feature/sidebar',
          isCurrent: true
        }
      ]
    })
    git.inspection = {
      isGitRepository: true,
      currentBranch: 'main',
      localBranches: ['feature/sidebar', 'main'],
      branches: [
        {
          name: 'feature/sidebar',
          worktreeDirectory: null,
          isCurrent: false,
          isLocked: false,
          lockReason: null
        },
        {
          name: 'main',
          worktreeDirectory: '/work/app',
          isCurrent: true,
          isLocked: false,
          lockReason: null
        }
      ]
    }

    const project = await synchronizeProjectGitState.execute({ projectDirectory: '/work/app' })

    expect(project?.workspaces).toEqual([
      {
        workspaceId: 'main',
        workspaceKind: 'default',
        displayName: 'main',
        directory: '/work/app',
        gitBranch: 'main',
        isCurrent: true
      }
    ])
  })
})

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
