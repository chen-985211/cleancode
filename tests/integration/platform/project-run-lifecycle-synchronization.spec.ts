import type { GitWorkspacePort } from '../../../src/contexts/project/application/ports/GitWorkspacePort'
import type { ProjectRepository } from '../../../src/contexts/project/application/ports/ProjectRepository'
import type { ProjectSnapshot } from '../../../src/contexts/project/application/dto/ProjectSnapshot'
import { SynchronizeProjectGitStateUseCase } from '../../../src/contexts/project/application/use-cases/SynchronizeProjectGitStateUseCase'
import type { Project } from '../../../src/contexts/project/domain/aggregates/Project'
import { RunLifecycleService } from '../../../src/contexts/run/application/use-cases/RunLifecycleService'
import type { TerminalRunOwner } from '../../../src/contexts/run/domain/value-objects/TerminalRunScope'
import { createRunLifecycleAdapters } from '../../../src/platform/electron-main/runLifecycleAdapters'

describe('Project Git synchronization with the Run lifecycle adapter', () => {
  it('disposes only a physically rebound linked workspace before committing', async () => {
    const repository = new InMemoryProjectRepository()
    const lifecycle = new RunLifecycleService()
    const disposedWorkspaces: string[] = []
    const mainOwner = createOwner('main', '/work/app', 'main')
    const worktreeOwner = createOwner('feature/sidebar', '/work/app-sidebar', 'feature/sidebar')
    lifecycle.track(mainOwner, async () => {
      disposedWorkspaces.push(mainOwner.workspaceId)
    })
    lifecycle.track(worktreeOwner, async () => {
      disposedWorkspaces.push(worktreeOwner.workspaceId)
    })
    const { workspaceRuns } = createRunLifecycleAdapters(lifecycle)
    const synchronize = new SynchronizeProjectGitStateUseCase(
      repository,
      gitWorkspace,
      undefined,
      undefined,
      workspaceRuns
    )

    const synchronized = await expectWithin(
      synchronize.execute({ projectDirectory: '/work/app' }),
      synchronizationTimeoutMs
    )

    expect(synchronized?.workspaces).toEqual([
      {
        workspaceId: 'main',
        workspaceKind: 'default',
        displayName: 'main',
        directory: '/work/app',
        gitBranch: 'feature/current',
        isCurrent: true
      },
      {
        workspaceId: 'feature/sidebar',
        workspaceKind: 'linked-worktree',
        displayName: 'feature/sidebar',
        directory: '/work/app-sidebar-moved',
        gitBranch: 'feature/sidebar',
        isCurrent: false
      }
    ])
    expect(disposedWorkspaces).toEqual(['feature/sidebar'])
    expect(repository.saveCount).toBe(1)
    expect(
      lifecycle.isWorkspaceQuarantined({
        projectDirectory: '/work/app',
        workspaceId: 'main'
      })
    ).toBe(false)
    expect(
      lifecycle.isWorkspaceQuarantined({
        projectDirectory: '/work/app',
        workspaceId: 'feature/sidebar'
      })
    ).toBe(false)
  })

  it('quarantines only a physically rebound linked workspace when saving fails', async () => {
    const repository = new InMemoryProjectRepository()
    repository.saveError = new Error('save failed')
    const lifecycle = new RunLifecycleService()
    const { workspaceRuns } = createRunLifecycleAdapters(lifecycle)
    const synchronize = new SynchronizeProjectGitStateUseCase(
      repository,
      gitWorkspace,
      undefined,
      undefined,
      workspaceRuns
    )

    await expect(
      expectWithin(synchronize.execute({ projectDirectory: '/work/app' }), synchronizationTimeoutMs)
    ).rejects.toThrow('save failed')

    expect(
      lifecycle.isWorkspaceQuarantined({
        projectDirectory: '/work/app',
        workspaceId: 'main'
      })
    ).toBe(false)
    expect(
      lifecycle.isWorkspaceQuarantined({
        projectDirectory: '/work/app',
        workspaceId: 'feature/sidebar'
      })
    ).toBe(true)

    lifecycle.resolveProjectQuarantines('/work/app')
    expect(
      lifecycle.isWorkspaceQuarantined({
        projectDirectory: '/work/app',
        workspaceId: 'main'
      })
    ).toBe(false)
    expect(
      lifecycle.isWorkspaceQuarantined({
        projectDirectory: '/work/app',
        workspaceId: 'feature/sidebar'
      })
    ).toBe(false)
  })
})

class InMemoryProjectRepository implements ProjectRepository {
  saveCount = 0
  saveError: Error | null = null
  private project: ProjectSnapshot = initialProject

  async findByDirectory() {
    return this.project
  }

  async save(project: Project): Promise<void> {
    this.saveCount += 1
    if (this.saveError) throw this.saveError
    this.project = project.toSnapshot()
  }
}

const gitWorkspace: GitWorkspacePort = {
  inspectRepository: async () => ({
    isGitRepository: true,
    currentBranch: 'feature/current',
    localBranches: ['feature/current', 'feature/sidebar'],
    branches: [
      {
        name: 'feature/current',
        worktreeDirectory: '/work/app',
        isCurrent: true,
        isLocked: false,
        lockReason: null
      },
      {
        name: 'feature/sidebar',
        worktreeDirectory: '/work/app-sidebar-moved',
        isCurrent: false,
        isLocked: false,
        lockReason: null
      }
    ]
  }),
  isWorkingTreeClean: async () => true,
  checkoutBranch: async () => undefined,
  createBranchWorktree: async () => undefined,
  lockBranchWorktree: async () => undefined,
  pruneWorktrees: async () => undefined,
  removeBranchWorktree: async () => undefined,
  unlockBranchWorktree: async () => undefined
}

const initialProject: ProjectSnapshot = {
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
      workspaceId: 'feature/sidebar',
      workspaceKind: 'linked-worktree',
      displayName: 'feature/sidebar',
      directory: '/work/app-sidebar',
      gitBranch: 'feature/sidebar',
      isCurrent: false
    }
  ]
}

const synchronizationTimeoutMs = 1_000

function createOwner(
  workspaceId: string,
  workspaceDirectory: string,
  gitBranch: string
): TerminalRunOwner {
  return {
    projectId: 'project-1',
    projectDirectory: '/work/app',
    workspaceId,
    workspaceDirectory,
    gitBranch,
    blockId: `terminal-${workspaceId}`
  }
}

async function expectWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Project synchronization timed out.')), timeoutMs)
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}
