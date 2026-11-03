import type { ProjectSnapshot } from '../../../../src/contexts/project/application/dto/ProjectSnapshot'
import type {
  GitRepositoryInspection,
  GitWorkspacePort
} from '../../../../src/contexts/project/application/ports/GitWorkspacePort'
import type { ProjectRepository } from '../../../../src/contexts/project/application/ports/ProjectRepository'
import { ListGitBranchNavigationUseCase } from '../../../../src/contexts/project/application/use-cases/ListGitBranchNavigationUseCase'
import type { Project } from '../../../../src/contexts/project/domain/aggregates/Project'

describe('git branch navigation use case', () => {
  it('returns detached checkout lock facts without inventing a branch', async () => {
    const repository = {
      findByDirectory: async () => createProjectSnapshot(),
      save: async () => undefined
    } satisfies ProjectRepository
    const git = createGitWorkspacePort({
      isGitRepository: true,
      currentBranch: 'main',
      localBranches: ['main'],
      branches: [],
      worktrees: [
        {
          directory: '/work/detached',
          branchName: null,
          head: '1234567',
          isCurrent: false,
          isLocked: true,
          lockReason: 'native session'
        }
      ]
    })
    const navigation = await new ListGitBranchNavigationUseCase(repository, git).execute({
      projectDirectory: '/work/app'
    })
    expect(navigation.branches).toEqual([])
    expect(navigation.worktrees).toEqual([
      { directory: '/work/detached', isLocked: true, lockReason: 'native session' }
    ])
  })

  it('disables worktree branches under main and exposes their transient lock state', async () => {
    const project = createProjectSnapshot()
    const repository = {
      findByDirectory: async () => project,
      save: async (updatedProject: Project) => {
        void updatedProject
      }
    } satisfies ProjectRepository
    const git = createGitWorkspacePort({
      isGitRepository: true,
      currentBranch: 'main',
      localBranches: ['main', 'feature/free', 'feature/worktree'],
      branches: [
        {
          name: 'main',
          worktreeDirectory: '/work/app',
          isCurrent: true,
          isLocked: false,
          lockReason: null
        },
        {
          name: 'feature/free',
          worktreeDirectory: null,
          isCurrent: false,
          isLocked: false,
          lockReason: null
        },
        {
          name: 'feature/worktree',
          worktreeDirectory: '/work/app-feature-worktree',
          isCurrent: false,
          isLocked: true,
          lockReason: 'external agent session'
        }
      ]
    })
    const listGitBranchNavigation = new ListGitBranchNavigationUseCase(repository, git)

    const navigation = await listGitBranchNavigation.execute({ projectDirectory: '/work/app' })

    expect(navigation.branches.find((branch) => branch.name === 'feature/free')).toMatchObject({
      isSelectableInMainWorkspace: true,
      worktreeDirectory: null,
      isLocked: false,
      lockReason: null
    })
    expect(navigation.branches.find((branch) => branch.name === 'feature/worktree')).toMatchObject({
      isSelectableInMainWorkspace: false,
      worktreeDirectory: '/work/app-feature-worktree',
      isLocked: true,
      lockReason: 'external agent session'
    })
  })
})

function createGitWorkspacePort(inspection: GitRepositoryInspection): GitWorkspacePort {
  return {
    checkoutBranch: async () => undefined,
    createBranchWorktree: async () => undefined,
    inspectRepository: async () => inspection,
    isWorkingTreeClean: async () => true,
    lockBranchWorktree: async () => undefined,
    pruneWorktrees: async () => undefined,
    removeBranchWorktree: async () => undefined,
    unlockBranchWorktree: async () => undefined
  }
}

function createProjectSnapshot(): ProjectSnapshot {
  return {
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
        workspaceId: 'feature/worktree',
        workspaceKind: 'linked-worktree',
        displayName: 'feature/worktree',
        directory: '/work/app-feature-worktree',
        gitBranch: 'feature/worktree',
        isCurrent: false
      }
    ]
  }
}
