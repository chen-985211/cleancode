import { CreateBranchWorkspaceUseCase } from '../../../../src/contexts/project/application/use-cases/CreateBranchWorkspaceUseCase'
import { CreateOrOpenProjectUseCase } from '../../../../src/contexts/project/application/use-cases/CreateOrOpenProjectUseCase'
import type { BranchWorkspaceDirectoryPort } from '../../../../src/contexts/project/application/ports/BranchWorkspaceDirectoryPort'
import type {
  CreateBranchWorktreeCommand,
  GitRepositoryInspection,
  GitWorkspacePort
} from '../../../../src/contexts/project/application/ports/GitWorkspacePort'
import type { ProjectRepository } from '../../../../src/contexts/project/application/ports/ProjectRepository'
import type { ProjectSnapshot } from '../../../../src/contexts/project/application/dto/ProjectSnapshot'
import type { Project } from '../../../../src/contexts/project/domain/aggregates/Project'

class InMemoryProjectRepository implements ProjectRepository {
  private readonly projects = new Map<string, ProjectSnapshot>()

  async save(project: Project): Promise<void> {
    const snapshot = project.toSnapshot()

    this.projects.set(snapshot.directory, snapshot)
  }

  async findByDirectory(directory: string): Promise<ProjectSnapshot | null> {
    return this.projects.get(directory) ?? null
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

  async inspectRepository(): Promise<GitRepositoryInspection> {
    return this.inspection
  }

  async createBranchWorktree(command: CreateBranchWorktreeCommand): Promise<void> {
    this.createBranchWorktreeCalls.push(command)
  }

  async isWorkingTreeClean(): Promise<boolean> {
    return true
  }

  async checkoutBranch(): Promise<void> {}

  async lockBranchWorktree(): Promise<void> {}

  async removeBranchWorktree(): Promise<void> {}

  async unlockBranchWorktree(): Promise<void> {}

  async pruneWorktrees(): Promise<void> {}
}

class FakeBranchWorkspaceDirectoryPort implements BranchWorkspaceDirectoryPort {
  resolveBranchWorkspaceDirectory(input: {
    readonly projectDirectory: string
    readonly branchName: string
  }): string {
    return `${input.projectDirectory}/.worktrees/${input.branchName.replaceAll('/', '-')}`
  }
}

describe('create branch workspace errors', () => {
  it('rejects creating a branch workspace when the Git branch already exists with a stable code', async () => {
    const repository = new InMemoryProjectRepository()
    const git = new FakeGitWorkspacePort()
    const directories = new FakeBranchWorkspaceDirectoryPort()
    const createOrOpenProject = new CreateOrOpenProjectUseCase(repository, git)
    const createBranchWorkspace = new CreateBranchWorkspaceUseCase(repository, git, directories)
    git.inspection = {
      isGitRepository: true,
      currentBranch: 'main',
      localBranches: ['main', 'feature/sidebar'],
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
    await createOrOpenProject.execute({
      directory: '/work/app',
      name: 'app'
    })

    await expect(
      createBranchWorkspace.execute({
        projectDirectory: '/work/app',
        branchName: 'feature/sidebar'
      })
    ).rejects.toMatchObject({ code: 'GIT_BRANCH_ALREADY_EXISTS' })

    expect(git.createBranchWorktreeCalls).toEqual([])
  })
})
