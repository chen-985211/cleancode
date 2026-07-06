import { CreateBranchWorkspaceUseCase } from '../../../../src/contexts/project/application/use-cases/CreateBranchWorkspaceUseCase'
import { CreateOrOpenProjectUseCase } from '../../../../src/contexts/project/application/use-cases/CreateOrOpenProjectUseCase'
import { CheckoutMainWorkspaceBranchUseCase } from '../../../../src/contexts/project/application/use-cases/CheckoutMainWorkspaceBranchUseCase'
import { ListGitBranchNavigationUseCase } from '../../../../src/contexts/project/application/use-cases/ListGitBranchNavigationUseCase'
import type { BranchWorkspaceDirectoryPort } from '../../../../src/contexts/project/application/ports/BranchWorkspaceDirectoryPort'
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
  createBranchWorktreeCalls: CreateBranchWorktreeCommand[] = []
  createBranchWorktreeError: Error | null = null
  checkoutBranchCalls: CheckoutBranchCommand[] = []
  removeBranchWorktreeCalls: RemoveBranchWorktreeCommand[] = []
  pruneWorktreesCalls: PruneWorktreesCommand[] = []
  workingTreeClean = true

  async inspectRepository(): Promise<GitRepositoryInspection> {
    return this.inspection
  }

  async createBranchWorktree(command: CreateBranchWorktreeCommand): Promise<void> {
    this.createBranchWorktreeCalls.push(command)

    if (this.createBranchWorktreeError) {
      throw this.createBranchWorktreeError
    }
  }

  async isWorkingTreeClean(): Promise<boolean> {
    return this.workingTreeClean
  }

  async checkoutBranch(command: CheckoutBranchCommand): Promise<void> {
    this.checkoutBranchCalls.push(command)
  }

  async removeBranchWorktree(command: RemoveBranchWorktreeCommand): Promise<void> {
    this.removeBranchWorktreeCalls.push(command)
  }

  async pruneWorktrees(command: PruneWorktreesCommand): Promise<void> {
    this.pruneWorktreesCalls.push(command)
  }
}

class FakeBranchWorkspaceDirectoryPort implements BranchWorkspaceDirectoryPort {
  resolveBranchWorkspaceDirectory(input: {
    readonly projectDirectory: string
    readonly branchName: string
  }): string {
    return `${input.projectDirectory}/.worktrees/${input.branchName.replaceAll('/', '-')}`
  }
}

describe('project git workspace use cases', () => {
  it('opens a git project by binding main to the branch checked out in the main directory', async () => {
    const repository = new InMemoryProjectRepository()
    const git = new FakeGitWorkspacePort()
    const createOrOpenProject = new CreateOrOpenProjectUseCase(repository, git)
    git.inspection = {
      isGitRepository: true,
      currentBranch: 'feature/current',
      localBranches: ['feature/current', 'main'],
      branches: [
        {
          name: 'feature/current',
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

    const project = await createOrOpenProject.execute({
      directory: '/work/app',
      name: 'app'
    })

    expect(project.workspaces).toEqual([
      {
        name: 'main',
        directory: '/work/app',
        gitBranch: 'feature/current',
        isCurrent: true
      }
    ])
  })

  it('opens a git project without a main branch by binding main to the current branch', async () => {
    const repository = new InMemoryProjectRepository()
    const git = new FakeGitWorkspacePort()
    const createOrOpenProject = new CreateOrOpenProjectUseCase(repository, git)
    git.inspection = {
      isGitRepository: true,
      currentBranch: 'trunk',
      localBranches: ['trunk'],
      branches: [
        {
          name: 'trunk',
          worktreeDirectory: '/work/app',
          isCurrent: true
        }
      ]
    }

    const project = await createOrOpenProject.execute({
      directory: '/work/app',
      name: 'app'
    })

    expect(project.workspaces[0]).toMatchObject({
      name: 'main',
      gitBranch: 'trunk'
    })
  })

  it('creates a real branch worktree before saving the new branch workspace', async () => {
    const repository = new InMemoryProjectRepository()
    const git = new FakeGitWorkspacePort()
    const directories = new FakeBranchWorkspaceDirectoryPort()
    const createOrOpenProject = new CreateOrOpenProjectUseCase(repository, git)
    const createBranchWorkspace = new CreateBranchWorkspaceUseCase(repository, git, directories)
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
    await createOrOpenProject.execute({
      directory: '/work/app',
      name: 'app'
    })

    const project = await createBranchWorkspace.execute({
      projectDirectory: '/work/app',
      branchName: 'feature/sidebar'
    })

    expect(git.createBranchWorktreeCalls).toEqual([
      {
        repositoryDirectory: '/work/app',
        branchName: 'feature/sidebar',
        worktreeDirectory: '/work/app/.worktrees/feature-sidebar'
      }
    ])
    expect(project.workspaces.find((workspace) => workspace.isCurrent)).toMatchObject({
      name: 'feature/sidebar',
      directory: '/work/app/.worktrees/feature-sidebar',
      gitBranch: 'feature/sidebar'
    })
  })

  it('does not save a branch workspace when worktree creation fails', async () => {
    const repository = new InMemoryProjectRepository()
    const git = new FakeGitWorkspacePort()
    const directories = new FakeBranchWorkspaceDirectoryPort()
    const createOrOpenProject = new CreateOrOpenProjectUseCase(repository, git)
    const createBranchWorkspace = new CreateBranchWorkspaceUseCase(repository, git, directories)
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
    git.createBranchWorktreeError = new Error('git failed')
    await createOrOpenProject.execute({
      directory: '/work/app',
      name: 'app'
    })
    const saveCountBeforeCreate = repository.savedProjects.length

    await expect(
      createBranchWorkspace.execute({
        projectDirectory: '/work/app',
        branchName: 'feature/sidebar'
      })
    ).rejects.toThrow('git failed')

    expect(repository.savedProjects).toHaveLength(saveCountBeforeCreate)
  })

  it('opens an existing git project by adding already checked-out worktree branches', async () => {
    const repository = new InMemoryProjectRepository()
    const git = new FakeGitWorkspacePort()
    const createOrOpenProject = new CreateOrOpenProjectUseCase(repository, git)
    git.inspection = {
      isGitRepository: true,
      currentBranch: 'main',
      localBranches: ['main', 'feature/free', 'feature/worktree'],
      branches: [
        {
          name: 'main',
          worktreeDirectory: '/work/app',
          isCurrent: true
        },
        {
          name: 'feature/free',
          worktreeDirectory: null,
          isCurrent: false
        },
        {
          name: 'feature/worktree',
          worktreeDirectory: '/work/app-feature-worktree',
          isCurrent: false
        }
      ]
    }

    const project = await createOrOpenProject.execute({
      directory: '/work/app',
      name: 'app'
    })

    expect(project.workspaces).toEqual([
      {
        name: 'main',
        directory: '/work/app',
        gitBranch: 'main',
        isCurrent: true
      },
      {
        name: 'feature/worktree',
        directory: '/work/app-feature-worktree',
        gitBranch: 'feature/worktree',
        isCurrent: false
      }
    ])
  })

  it('lists branch navigation with worktree branches disabled under main', async () => {
    const repository = new InMemoryProjectRepository()
    const git = new FakeGitWorkspacePort()
    const createOrOpenProject = new CreateOrOpenProjectUseCase(repository, git)
    const listGitBranchNavigation = new ListGitBranchNavigationUseCase(repository, git)
    git.inspection = {
      isGitRepository: true,
      currentBranch: 'main',
      localBranches: ['main', 'feature/free', 'feature/worktree'],
      branches: [
        {
          name: 'main',
          worktreeDirectory: '/work/app',
          isCurrent: true
        },
        {
          name: 'feature/free',
          worktreeDirectory: null,
          isCurrent: false
        },
        {
          name: 'feature/worktree',
          worktreeDirectory: '/work/app-feature-worktree',
          isCurrent: false
        }
      ]
    }
    await createOrOpenProject.execute({
      directory: '/work/app',
      name: 'app'
    })

    const navigation = await listGitBranchNavigation.execute({ projectDirectory: '/work/app' })

    expect(navigation.branches.find((branch) => branch.name === 'feature/free')).toMatchObject({
      isSelectableInMainWorkspace: true,
      worktreeDirectory: null
    })
    expect(navigation.branches.find((branch) => branch.name === 'feature/worktree')).toMatchObject({
      isSelectableInMainWorkspace: false,
      worktreeDirectory: '/work/app-feature-worktree'
    })
  })

  it('rejects checking out a main workspace branch when the main directory is dirty', async () => {
    const repository = new InMemoryProjectRepository()
    const git = new FakeGitWorkspacePort()
    const checkoutMainWorkspaceBranch = new CheckoutMainWorkspaceBranchUseCase(repository, git)
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
        }
      ]
    })
    git.workingTreeClean = false
    git.inspection = {
      isGitRepository: true,
      currentBranch: 'main',
      localBranches: ['main', 'feature/free'],
      branches: [
        {
          name: 'main',
          worktreeDirectory: '/work/app',
          isCurrent: true
        },
        {
          name: 'feature/free',
          worktreeDirectory: null,
          isCurrent: false
        }
      ]
    }

    await expect(
      checkoutMainWorkspaceBranch.execute({
        projectDirectory: '/work/app',
        branchName: 'feature/free'
      })
    ).rejects.toMatchObject({ code: 'MAIN_WORKSPACE_HAS_UNCOMMITTED_CHANGES' })

    expect(git.checkoutBranchCalls).toEqual([])
  })

  it('rejects checking out a branch already attached to another worktree', async () => {
    const repository = new InMemoryProjectRepository()
    const git = new FakeGitWorkspacePort()
    const checkoutMainWorkspaceBranch = new CheckoutMainWorkspaceBranchUseCase(repository, git)
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
        }
      ]
    })
    git.inspection = {
      isGitRepository: true,
      currentBranch: 'main',
      localBranches: ['main', 'feature/worktree'],
      branches: [
        {
          name: 'main',
          worktreeDirectory: '/work/app',
          isCurrent: true
        },
        {
          name: 'feature/worktree',
          worktreeDirectory: '/work/app-feature-worktree',
          isCurrent: false
        }
      ]
    }

    await expect(
      checkoutMainWorkspaceBranch.execute({
        projectDirectory: '/work/app',
        branchName: 'feature/worktree'
      })
    ).rejects.toMatchObject({ code: 'GIT_BRANCH_CHECKED_OUT_IN_WORKTREE' })

    expect(git.checkoutBranchCalls).toEqual([])
  })

  it('checks out a selectable branch in the main workspace and switches current workspace to main', async () => {
    const repository = new InMemoryProjectRepository()
    const git = new FakeGitWorkspacePort()
    const checkoutMainWorkspaceBranch = new CheckoutMainWorkspaceBranchUseCase(repository, git)
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
          name: 'feature/worktree',
          directory: '/work/app-feature-worktree',
          gitBranch: 'feature/worktree',
          isCurrent: true
        }
      ]
    })
    git.inspection = {
      isGitRepository: true,
      currentBranch: 'main',
      localBranches: ['main', 'feature/free', 'feature/worktree'],
      branches: [
        {
          name: 'main',
          worktreeDirectory: '/work/app',
          isCurrent: true
        },
        {
          name: 'feature/free',
          worktreeDirectory: null,
          isCurrent: false
        },
        {
          name: 'feature/worktree',
          worktreeDirectory: '/work/app-feature-worktree',
          isCurrent: false
        }
      ]
    }

    const project = await checkoutMainWorkspaceBranch.execute({
      projectDirectory: '/work/app',
      branchName: 'feature/free'
    })

    expect(git.checkoutBranchCalls).toEqual([
      {
        repositoryDirectory: '/work/app',
        branchName: 'feature/free'
      }
    ])
    expect(project.workspaces).toEqual([
      {
        name: 'main',
        directory: '/work/app',
        gitBranch: 'feature/free',
        isCurrent: true
      },
      {
        name: 'feature/worktree',
        directory: '/work/app-feature-worktree',
        gitBranch: 'feature/worktree',
        isCurrent: false
      }
    ])
    expect(repository.savedProjects.at(-1)).toEqual(project)
  })
})
