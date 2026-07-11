import type { ProjectSnapshot } from '../../../../src/contexts/project/application/dto/ProjectSnapshot'
import type { GitWorkspacePort } from '../../../../src/contexts/project/application/ports/GitWorkspacePort'
import type { ProjectRepository } from '../../../../src/contexts/project/application/ports/ProjectRepository'
import type { WorkspaceAgentLifecyclePort } from '../../../../src/contexts/project/application/ports/WorkspaceAgentLifecyclePort'
import { CheckoutMainWorkspaceBranchUseCase } from '../../../../src/contexts/project/application/use-cases/CheckoutMainWorkspaceBranchUseCase'

describe('project Agent branch lifecycle', () => {
  it('suspends the main workspace Agent before checkout and resumes it if Git fails', async () => {
    const project: ProjectSnapshot = {
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
    }
    const projectRepository = {
      findByDirectory: vi.fn(async () => project),
      save: vi.fn(async () => undefined)
    } satisfies ProjectRepository
    const gitWorkspacePort = {
      checkoutBranch: vi.fn(async () => {
        throw new Error('checkout failed')
      }),
      createBranchWorktree: vi.fn(),
      inspectRepository: vi.fn(async () => ({
        branches: [
          { name: 'main', worktreeDirectory: '/work/app', isCurrent: true },
          { name: 'feature/free', worktreeDirectory: null, isCurrent: false }
        ],
        currentBranch: 'main',
        isGitRepository: true,
        localBranches: ['main', 'feature/free']
      })),
      isWorkingTreeClean: vi.fn(async () => true),
      pruneWorktrees: vi.fn(),
      removeBranchWorktree: vi.fn()
    } satisfies GitWorkspacePort
    const lifecycleCalls: string[] = []
    const workspaceAgentLifecyclePort = {
      resume: vi.fn(async (directory) => {
        lifecycleCalls.push(`resume:${directory}`)
      }),
      suspend: vi.fn(async (directory) => {
        lifecycleCalls.push(`suspend:${directory}`)
        return true
      })
    } satisfies WorkspaceAgentLifecyclePort
    const useCase = new CheckoutMainWorkspaceBranchUseCase(
      projectRepository,
      gitWorkspacePort,
      workspaceAgentLifecyclePort
    )

    await expect(
      useCase.execute({ projectDirectory: '/work/app', branchName: 'feature/free' })
    ).rejects.toThrow('checkout failed')

    expect(lifecycleCalls).toEqual(['suspend:/work/app', 'resume:/work/app'])
  })
})
