import type { ProjectSnapshot } from '../../../../src/contexts/project/application/dto/ProjectSnapshot'
import type { GitWorkspacePort } from '../../../../src/contexts/project/application/ports/GitWorkspacePort'
import type { ProjectRepository } from '../../../../src/contexts/project/application/ports/ProjectRepository'
import type { WorkspaceAgentLifecyclePort } from '../../../../src/contexts/project/application/ports/WorkspaceAgentLifecyclePort'
import { CheckoutMainWorkspaceBranchUseCase } from '../../../../src/contexts/project/application/use-cases/CheckoutMainWorkspaceBranchUseCase'
import { ProjectWorkspaceTransactionCoordinator } from '../../../../src/contexts/project/application/use-cases/ProjectWorkspaceTransactionCoordinator'
import { SynchronizeProjectGitStateUseCase } from '../../../../src/contexts/project/application/use-cases/SynchronizeProjectGitStateUseCase'

describe('project Agent branch lifecycle', () => {
  it('suspends the main workspace Agent before checkout and resumes it if Git fails', async () => {
    const { lifecycleCalls, useCase } = createFixture({ checkoutError: 'checkout failed' })

    await expect(
      useCase.execute({ projectDirectory: '/work/app', branchName: 'feature/free' })
    ).rejects.toThrow('checkout failed')

    expect(lifecycleCalls).toEqual(['suspend:/work/app', 'resume:/work/app', 'release:/work/app'])
  })

  it('does not checkout if the workspace becomes dirty while its Agents drain', async () => {
    const { checkoutBranches, lifecycleCalls, useCase } = createFixture({
      workingTreeCleanResults: [true, false]
    })

    await expect(
      useCase.execute({ projectDirectory: '/work/app', branchName: 'feature/free' })
    ).rejects.toMatchObject({ code: 'MAIN_WORKSPACE_HAS_UNCOMMITTED_CHANGES' })

    expect(checkoutBranches).toEqual([])
    expect(lifecycleCalls).toEqual(['suspend:/work/app', 'resume:/work/app', 'release:/work/app'])
  })

  it('rolls Git back before resuming the old Agent scope if project saving fails', async () => {
    const { checkoutBranches, lifecycleCalls, useCase } = createFixture({
      saveError: 'save failed'
    })

    await expect(
      useCase.execute({ projectDirectory: '/work/app', branchName: 'feature/free' })
    ).rejects.toThrow('save failed')

    expect(checkoutBranches).toEqual(['feature/free', 'main'])
    expect(lifecycleCalls).toEqual(['suspend:/work/app', 'resume:/work/app', 'resolve:/work/app'])
  })

  it('keeps old-scope attaches blocked if post-checkout rollback fails', async () => {
    const { checkoutBranches, lifecycleCalls, useCase } = createFixture({
      rollbackError: 'rollback failed',
      saveError: 'save failed'
    })

    await expect(
      useCase.execute({ projectDirectory: '/work/app', branchName: 'feature/free' })
    ).rejects.toThrow('save failed')

    expect(checkoutBranches).toEqual(['feature/free', 'main'])
    expect(lifecycleCalls).toEqual(['suspend:/work/app', 'quarantine:/work/app'])
  })

  it('preserves the Git error if restoring the old Agent scope also fails', async () => {
    const { lifecycleCalls, useCase } = createFixture({
      checkoutError: 'checkout failed',
      resumeError: 'resume failed'
    })

    await expect(
      useCase.execute({ projectDirectory: '/work/app', branchName: 'feature/free' })
    ).rejects.toThrow('checkout failed')

    expect(lifecycleCalls).toEqual(['suspend:/work/app', 'resume:/work/app', 'release:/work/app'])
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
          name,
          worktreeDirectory: name === currentBranch ? '/work/app' : null
        })),
        currentBranch,
        isGitRepository: true,
        localBranches: ['main', 'feature/free']
      })),
      isWorkingTreeClean: vi.fn(async () => true),
      pruneWorktrees: vi.fn(),
      removeBranchWorktree: vi.fn()
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
      lifecycle,
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
  resumeError?: string
  rollbackError?: string
  saveError?: string
  workingTreeCleanResults?: boolean[]
}): {
  readonly checkoutBranches: string[]
  readonly lifecycleCalls: string[]
  readonly useCase: CheckoutMainWorkspaceBranchUseCase
} {
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
        { name: 'main', worktreeDirectory: '/work/app', isCurrent: true },
        { name: 'feature/free', worktreeDirectory: null, isCurrent: false }
      ],
      currentBranch: 'main',
      isGitRepository: true,
      localBranches: ['main', 'feature/free']
    })),
    isWorkingTreeClean: vi.fn(async () => input.workingTreeCleanResults?.shift() ?? true),
    pruneWorktrees: vi.fn(),
    removeBranchWorktree: vi.fn()
  } satisfies GitWorkspacePort
  const lifecycleCalls: string[] = []
  const workspaceAgentLifecyclePort = {
    disposeProject: vi.fn(async () => ({
      wasQuarantined: false,
      quarantine: () => undefined,
      release: () => undefined,
      resolve: () => undefined
    })),
    disposeWorkspace: vi.fn(async () => ({
      wasQuarantined: false,
      quarantine: () => undefined,
      release: () => undefined,
      resolve: () => undefined
    })),
    isWorkspaceQuarantined: vi.fn(() => false),
    resolveProjectQuarantines: vi.fn(),
    suspend: vi.fn(async (directory) => {
      lifecycleCalls.push(`suspend:${directory}`)
      return {
        wasQuarantined: false,
        quarantine: () => lifecycleCalls.push(`quarantine:${directory}`),
        release: () => lifecycleCalls.push(`release:${directory}`),
        resolve: () => lifecycleCalls.push(`resolve:${directory}`),
        resume: async () => {
          lifecycleCalls.push(`resume:${directory}`)
          if (input.resumeError) throw new Error(input.resumeError)
        },
        wasSuspended: true
      }
    })
  } satisfies WorkspaceAgentLifecyclePort

  return {
    checkoutBranches,
    lifecycleCalls,
    useCase: new CheckoutMainWorkspaceBranchUseCase(
      projectRepository,
      gitWorkspacePort,
      workspaceAgentLifecyclePort
    )
  }
}

function createProjectSnapshot(): ProjectSnapshot {
  return {
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
