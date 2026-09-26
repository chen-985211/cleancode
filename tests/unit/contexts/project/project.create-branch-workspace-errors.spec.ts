import { posix } from 'node:path'

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
import { Project } from '../../../../src/contexts/project/domain/aggregates/Project'

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
    return posix.join(input.projectDirectory, '.worktrees', input.branchName.replaceAll('/', '-'))
  }
}

describe('create branch workspace errors', () => {
  it('rechecks the issue repository inside the write transaction before touching Git', async () => {
    const repository = new InMemoryProjectRepository()
    const git = new FakeGitWorkspacePort()
    git.inspection = {
      isGitRepository: true,
      currentBranch: 'main',
      localBranches: ['main'],
      branches: []
    }
    await repository.save(
      Project.create({ directory: '/work/app', name: 'app' }).bindIssueRepository('new/repo')
    )
    await expect(
      new CreateBranchWorkspaceUseCase(
        repository,
        git,
        new FakeBranchWorkspaceDirectoryPort()
      ).execute({
        projectDirectory: '/work/app',
        branchName: 'issue/42',
        baseRef: 'a'.repeat(40),
        issue: {
          id: 'I_42',
          repository: 'old/repo',
          number: 42,
          title: 'Issue',
          url: 'https://github.com/old/repo/issues/42'
        }
      })
    ).rejects.toMatchObject({ code: 'PROJECT_ISSUE_INVALID' })
    expect(git.createBranchWorktreeCalls).toEqual([])
  })
  it('uses the workspace identity reserved by a persisted initialization request', async () => {
    const repository = new InMemoryProjectRepository()
    const git = new FakeGitWorkspacePort()
    git.inspection = {
      isGitRepository: true,
      currentBranch: 'main',
      localBranches: ['main'],
      branches: []
    }
    await new CreateOrOpenProjectUseCase(repository, git).execute({
      directory: '/work/app',
      name: 'app'
    })
    const result = await new CreateBranchWorkspaceUseCase(
      repository,
      git,
      new FakeBranchWorkspaceDirectoryPort()
    ).execute({
      projectDirectory: '/work/app',
      branchName: 'feature',
      workspaceId: 'reserved-workspace'
    })
    expect(
      result.workspaces.find((workspace) => workspace.gitBranch === 'feature')?.workspaceId
    ).toBe('reserved-workspace')
  })
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
