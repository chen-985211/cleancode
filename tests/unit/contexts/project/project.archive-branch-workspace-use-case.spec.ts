import { ArchiveBranchWorkspaceUseCase } from '../../../../src/contexts/project/application/use-cases/ArchiveBranchWorkspaceUseCase'
import type {
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
    isGitRepository: true,
    currentBranch: 'main',
    localBranches: ['main'],
    branches: []
  }
  workingTreeClean = true
  cleanChecks: string[] = []
  removeBranchWorktreeCalls: RemoveBranchWorktreeCommand[] = []
  pruneWorktreesCalls: PruneWorktreesCommand[] = []

  async inspectRepository(): Promise<GitRepositoryInspection> {
    return this.inspection
  }

  async createBranchWorktree(): Promise<void> {}

  async isWorkingTreeClean(directory: string): Promise<boolean> {
    this.cleanChecks.push(directory)

    return this.workingTreeClean
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
    const archiveBranchWorkspace = new ArchiveBranchWorkspaceUseCase(repository, git)
    git.workingTreeClean = false
    repository.remember(createProjectWithFeatureWorkspace(true))

    await expect(
      archiveBranchWorkspace.execute({
        projectDirectory: '/work/app',
        workspaceName: 'feature/sidebar'
      })
    ).rejects.toThrow('Branch workspace has uncommitted changes.')

    expect(git.cleanChecks).toEqual(['/work/worktrees/app/feature/sidebar'])
    expect(git.removeBranchWorktreeCalls).toEqual([])
    expect(repository.savedProjects).toEqual([])
  })

  it('archives a clean current worktree and selects main in the saved project', async () => {
    const repository = new InMemoryProjectRepository()
    const git = new FakeGitWorkspacePort()
    const archiveBranchWorkspace = new ArchiveBranchWorkspaceUseCase(repository, git)
    repository.remember(createProjectWithFeatureWorkspace(true))

    const project = await archiveBranchWorkspace.execute({
      projectDirectory: '/work/app',
      workspaceName: 'feature/sidebar'
    })

    expect(git.cleanChecks).toEqual(['/work/worktrees/app/feature/sidebar'])
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
  })

  it('rejects archiving the main workspace', async () => {
    const repository = new InMemoryProjectRepository()
    const git = new FakeGitWorkspacePort()
    const archiveBranchWorkspace = new ArchiveBranchWorkspaceUseCase(repository, git)
    repository.remember(createProjectWithFeatureWorkspace(false))

    await expect(
      archiveBranchWorkspace.execute({
        projectDirectory: '/work/app',
        workspaceName: 'main'
      })
    ).rejects.toThrow('Main workspace cannot be archived.')

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
