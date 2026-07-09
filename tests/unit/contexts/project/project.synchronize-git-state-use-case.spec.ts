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
  readonly checkoutBranchCalls: CheckoutBranchCommand[] = []

  async inspectRepository(): Promise<GitRepositoryInspection> {
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

  async removeBranchWorktree(command: RemoveBranchWorktreeCommand): Promise<void> {
    void command
  }

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
          isCurrent: true
        },
        {
          name: 'main',
          worktreeDirectory: null,
          isCurrent: false
        }
      ]
    }

    const project = await synchronizeProjectGitState.execute({ projectDirectory: '/work/app' })

    expect(project?.workspaces).toEqual([
      {
        name: 'main',
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
          isCurrent: true
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
        name: 'main',
        directory: '/work/app',
        gitBranch: null,
        isCurrent: true
      }
    ])
    expect(repository.savedProjects.at(-1)).toEqual(project)
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
          name: 'main',
          directory: '/work/app',
          gitBranch: 'main',
          isCurrent: true
        },
        {
          name: 'feature/stale',
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
          isCurrent: false
        },
        {
          name: 'feature/stale',
          worktreeDirectory: null,
          isCurrent: false
        },
        {
          name: 'main',
          worktreeDirectory: '/work/app',
          isCurrent: true
        }
      ]
    }

    const project = await synchronizeProjectGitState.execute({ projectDirectory: '/work/app' })

    expect(project?.workspaces).toEqual([
      {
        name: 'main',
        directory: '/work/app',
        gitBranch: 'main',
        isCurrent: true
      },
      {
        name: 'feature/sidebar',
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
          name: 'main',
          directory: '/work/app',
          gitBranch: 'main',
          isCurrent: false
        },
        {
          name: 'feature/sidebar',
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
          isCurrent: false
        },
        {
          name: 'main',
          worktreeDirectory: '/work/app',
          isCurrent: true
        }
      ]
    }

    const project = await synchronizeProjectGitState.execute({ projectDirectory: '/work/app' })

    expect(project?.workspaces).toEqual([
      {
        name: 'main',
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
        name: 'main',
        directory: '/work/app',
        gitBranch,
        isCurrent: true
      }
    ]
  }
}
