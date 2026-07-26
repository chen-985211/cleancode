import type { ProjectSnapshot } from '../../../../src/contexts/project/application/dto/ProjectSnapshot'
import type { GitWorkspacePort } from '../../../../src/contexts/project/application/ports/GitWorkspacePort'
import type { ProjectRepository } from '../../../../src/contexts/project/application/ports/ProjectRepository'
import type { WorkspaceAgentLifecyclePort } from '../../../../src/contexts/project/application/ports/WorkspaceAgentLifecyclePort'
import { CheckoutMainWorkspaceBranchUseCase } from '../../../../src/contexts/project/application/use-cases/CheckoutMainWorkspaceBranchUseCase'
import { ProjectWorkspaceTransactionCoordinator } from '../../../../src/contexts/project/application/use-cases/ProjectWorkspaceTransactionCoordinator'
import { SynchronizeProjectGitStateUseCase } from '../../../../src/contexts/project/application/use-cases/SynchronizeProjectGitStateUseCase'

describe('project Agent branch lifecycle', () => {
  it('does not suspend the physical workspace Agent when Git checkout fails', async () => {
    const { useCase } = createFixture({ checkoutError: 'checkout failed' })

    await expect(
      useCase.execute({ projectDirectory: '/work/app', branchName: 'feature/free' })
    ).rejects.toThrow('checkout failed')
  })

  it('does not preemptively stop checkout based on an application-level dirty-tree check', async () => {
    const { checkoutBranches, useCase } = createFixture({
      workingTreeCleanResults: [true, false]
    })

    await expect(
      useCase.execute({ projectDirectory: '/work/app', branchName: 'feature/free' })
    ).resolves.toMatchObject({
      workspaces: [expect.objectContaining({ gitBranch: 'feature/free' })]
    })

    expect(checkoutBranches).toEqual(['feature/free'])
  })

  it('rolls Git back if project saving fails', async () => {
    const { checkoutBranches, useCase } = createFixture({ saveError: 'save failed' })

    await expect(
      useCase.execute({ projectDirectory: '/work/app', branchName: 'feature/free' })
    ).rejects.toThrow('save failed')

    expect(checkoutBranches).toEqual(['feature/free', 'main'])
  })

  it('preserves the save error if post-checkout rollback fails', async () => {
    const { checkoutBranches, useCase } = createFixture({
      rollbackError: 'rollback failed',
      saveError: 'save failed'
    })

    await expect(
      useCase.execute({ projectDirectory: '/work/app', branchName: 'feature/free' })
    ).rejects.toThrow('save failed')

    expect(checkoutBranches).toEqual(['feature/free', 'main'])
  })

  it('preserves the Git checkout error', async () => {
    const { useCase } = createFixture({ checkoutError: 'checkout failed' })

    await expect(
      useCase.execute({ projectDirectory: '/work/app', branchName: 'feature/free' })
    ).rejects.toThrow('checkout failed')
  })

  it('serializes checkout with automatic Git synchronization from the first repository read', async () => {
    let currentBranch = 'main'
    let project = createProjectSnapshot()
    const checkoutStarted = createDeferred<void>()
    const continueCheckout = createDeferred<void>()
    const projectRepository = {
      findByDirectory: vi.fn(async () => project),
      save: vi.fn(async (updatedProject) => {
        project = updatedProject.toSnapshot()
      })
    } satisfies ProjectRepository
    const gitWorkspacePort = {
      checkoutBranch: vi.fn(async (command) => {
        checkoutStarted.resolve()
        await continueCheckout.promise
        currentBranch = command.branchName
      }),
      createBranchWorktree: vi.fn(),
      inspectRepository: vi.fn(async () => ({
        branches: ['main', 'feature/free'].map((name) => ({
          isCurrent: name === currentBranch,
          isLocked: false,
          lockReason: null,
          name,
          worktreeDirectory: name === currentBranch ? '/work/app' : null
        })),
        currentBranch,
        isGitRepository: true,
        localBranches: ['main', 'feature/free']
      })),
      isWorkingTreeClean: vi.fn(async () => true),
      lockBranchWorktree: vi.fn(),
      pruneWorktrees: vi.fn(),
      removeBranchWorktree: vi.fn(),
      unlockBranchWorktree: vi.fn()
    } satisfies GitWorkspacePort
    const lease = {
      wasQuarantined: false,
      quarantine: vi.fn(),
      release: vi.fn(),
      resolve: vi.fn()
    }
    const lifecycle = {
      disposeProject: vi.fn(async () => lease),
      disposeWorkspace: vi.fn(async () => lease),
      isWorkspaceQuarantined: vi.fn(() => false),
      resolveProjectQuarantines: vi.fn(),
      suspend: vi.fn(async () => ({
        ...lease,
        resume: vi.fn(async () => undefined),
        wasSuspended: false
      }))
    } satisfies WorkspaceAgentLifecyclePort
    const transactions = new ProjectWorkspaceTransactionCoordinator()
    const checkout = new CheckoutMainWorkspaceBranchUseCase(
      projectRepository,
      gitWorkspacePort,
      transactions
    )
    const synchronize = new SynchronizeProjectGitStateUseCase(
      projectRepository,
      gitWorkspacePort,
      lifecycle,
      transactions
    )

    const checkoutPromise = checkout.execute({
      projectDirectory: '/work/app',
      branchName: 'feature/free'
    })
    await checkoutStarted.promise
    const synchronizePromise = synchronize.execute({ projectDirectory: '/work/app' })
    await Promise.resolve()
    expect(projectRepository.findByDirectory).toHaveBeenCalledTimes(1)

    continueCheckout.resolve()
    await checkoutPromise
    await expect(synchronizePromise).resolves.toBeNull()
    expect(project.workspaces[0]?.gitBranch).toBe('feature/free')
    expect(lifecycle.resolveProjectQuarantines).toHaveBeenCalledWith('/work/app')
  })
})

function createFixture(input: {
  checkoutError?: string
  rollbackError?: string
  saveError?: string
  workingTreeCleanResults?: boolean[]
}): {
  readonly checkoutBranches: string[]
  readonly useCase: CheckoutMainWorkspaceBranchUseCase
} {
  const project: ProjectSnapshot = {
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
      }
    ]
  }
  const projectRepository = {
    findByDirectory: vi.fn(async () => project),
    save: vi.fn(async () => {
      if (input.saveError) throw new Error(input.saveError)
    })
  } satisfies ProjectRepository
  const checkoutBranches: string[] = []
  const gitWorkspacePort = {
    checkoutBranch: vi.fn(async (command) => {
      checkoutBranches.push(command.branchName)
      if (checkoutBranches.length === 1 && input.checkoutError) {
        throw new Error(input.checkoutError)
      }
      if (checkoutBranches.length === 2 && input.rollbackError) {
        throw new Error(input.rollbackError)
      }
    }),
    createBranchWorktree: vi.fn(),
    inspectRepository: vi.fn(async () => ({
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
        }
      ],
      currentBranch: 'main',
      isGitRepository: true,
      localBranches: ['main', 'feature/free']
    })),
    isWorkingTreeClean: vi.fn(async () => input.workingTreeCleanResults?.shift() ?? true),
    lockBranchWorktree: vi.fn(),
    pruneWorktrees: vi.fn(),
    removeBranchWorktree: vi.fn(),
    unlockBranchWorktree: vi.fn()
  } satisfies GitWorkspacePort
  return {
    checkoutBranches,
    useCase: new CheckoutMainWorkspaceBranchUseCase(projectRepository, gitWorkspacePort)
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
      }
    ]
  }
}

function createDeferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value?: T) => void
} {
  let resolve: (value?: T) => void = () => undefined
  const promise = new Promise<T>((promiseResolve) => {
    resolve = (value) => promiseResolve(value as T)
  })
  return { promise, resolve }
}
