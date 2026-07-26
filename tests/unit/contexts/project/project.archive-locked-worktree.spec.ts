import type { ProjectSnapshot } from '../../../../src/contexts/project/application/dto/ProjectSnapshot'
import type {
  GitRepositoryInspection,
  GitWorkspacePort,
  LockBranchWorktreeCommand,
  RemoveBranchWorktreeCommand,
  UnlockBranchWorktreeCommand
} from '../../../../src/contexts/project/application/ports/GitWorkspacePort'
import type { ProjectRepository } from '../../../../src/contexts/project/application/ports/ProjectRepository'
import type { WorkspaceAgentLifecyclePort } from '../../../../src/contexts/project/application/ports/WorkspaceAgentLifecyclePort'
import { ArchiveBranchWorkspaceUseCase } from '../../../../src/contexts/project/application/use-cases/ArchiveBranchWorkspaceUseCase'
import type { Project } from '../../../../src/contexts/project/domain/aggregates/Project'

class InMemoryProjectRepository implements ProjectRepository {
  readonly savedProjects: ProjectSnapshot[] = []
  private readonly project: ProjectSnapshot = createProjectSnapshot()

  async findByDirectory(directory: string): Promise<ProjectSnapshot | null> {
    return directory === this.project.directory ? this.project : null
  }

  async save(project: Project): Promise<void> {
    this.savedProjects.push(project.toSnapshot())
  }
}

class LockedWorktreeGitPort implements GitWorkspacePort {
  readonly cleanChecks: string[] = []
  readonly inspectionCalls: string[] = []
  readonly lockCalls: LockBranchWorktreeCommand[] = []
  readonly removeCalls: RemoveBranchWorktreeCommand[] = []
  readonly unlockCalls: UnlockBranchWorktreeCommand[] = []
  inspections: GitRepositoryInspection[] = [createInspection('claude session test-c')]
  workingTreeCleanResults: boolean[] = []
  removeError: Error | null = null

  async inspectRepository(directory: string): Promise<GitRepositoryInspection> {
    this.inspectionCalls.push(directory)
    return this.inspections.shift() ?? createInspection('claude session test-c')
  }

  async createBranchWorktree(): Promise<void> {}

  async isWorkingTreeClean(directory: string): Promise<boolean> {
    this.cleanChecks.push(directory)
    return this.workingTreeCleanResults.shift() ?? true
  }

  async checkoutBranch(): Promise<void> {}

  async lockBranchWorktree(command: LockBranchWorktreeCommand): Promise<void> {
    this.lockCalls.push(command)
  }

  async removeBranchWorktree(command: RemoveBranchWorktreeCommand): Promise<void> {
    this.removeCalls.push(command)
    if (this.removeError) throw this.removeError
  }

  async unlockBranchWorktree(command: UnlockBranchWorktreeCommand): Promise<void> {
    this.unlockCalls.push(command)
  }

  async pruneWorktrees(): Promise<void> {}
}

describe('archive locked branch worktree', () => {
  it('never lets lock confirmation override dirty worktree protection', async () => {
    const repository = new InMemoryProjectRepository()
    const git = new LockedWorktreeGitPort()
    git.workingTreeCleanResults.push(false)
    const lifecycle = createLifecycle()
    const archive = new ArchiveBranchWorkspaceUseCase(repository, git, lifecycle.port)

    await expect(
      archive.execute({
        projectDirectory: '/work/app',
        workspaceId: 'test-c',
        lockedWorktreeConfirmation: { lockReason: 'claude session test-c' }
      })
    ).rejects.toMatchObject({ code: 'BRANCH_WORKSPACE_HAS_UNCOMMITTED_CHANGES' })

    expect(git.inspectionCalls).toEqual([])
    expect(lifecycle.calls).toEqual([])
    expect(git.unlockCalls).toEqual([])
    expect(git.removeCalls).toEqual([])
  })

  it('requires explicit confirmation before touching a clean locked worktree', async () => {
    const repository = new InMemoryProjectRepository()
    const git = new LockedWorktreeGitPort()
    const lifecycle = createLifecycle()
    const archive = new ArchiveBranchWorkspaceUseCase(repository, git, lifecycle.port)

    await expect(
      archive.execute({ projectDirectory: '/work/app', workspaceId: 'test-c' })
    ).rejects.toMatchObject({
      code: 'GIT_WORKTREE_LOCKED',
      details: { lockReason: 'claude session test-c' },
      isExpected: true
    })

    expect(git.cleanChecks).toEqual(['/work/app/.claude/worktrees/test-c'])
    expect(lifecycle.calls).toEqual([])
    expect(git.unlockCalls).toEqual([])
    expect(git.removeCalls).toEqual([])
    expect(repository.savedProjects).toEqual([])
  })

  it('unlocks and ordinarily removes a confirmed locked worktree', async () => {
    const repository = new InMemoryProjectRepository()
    const git = new LockedWorktreeGitPort()
    git.inspections.push(createInspection('claude session test-c'))
    const lifecycle = createLifecycle()
    const archive = new ArchiveBranchWorkspaceUseCase(repository, git, lifecycle.port)

    await archive.execute({
      projectDirectory: '/work/app',
      workspaceId: 'test-c',
      lockedWorktreeConfirmation: { lockReason: 'claude session test-c' }
    })

    expect(git.cleanChecks).toEqual([
      '/work/app/.claude/worktrees/test-c',
      '/work/app/.claude/worktrees/test-c'
    ])
    expect(git.unlockCalls).toEqual([
      {
        repositoryDirectory: '/work/app',
        worktreeDirectory: '/work/app/.claude/worktrees/test-c'
      }
    ])
    expect(git.removeCalls).toHaveLength(1)
    expect(git.lockCalls).toEqual([])
    expect(repository.savedProjects).toHaveLength(1)
    expect(lifecycle.calls).toEqual(['suspend', 'dispose', 'suspension-release', 'resolve'])
  })

  it('resumes suspended Agents if the lock reason changes while they drain', async () => {
    const repository = new InMemoryProjectRepository()
    const git = new LockedWorktreeGitPort()
    git.inspections = [
      createInspection('claude session test-c'),
      createInspection('new claude session')
    ]
    const lifecycle = createLifecycle(true)
    const archive = new ArchiveBranchWorkspaceUseCase(repository, git, lifecycle.port)

    await expect(
      archive.execute({
        projectDirectory: '/work/app',
        workspaceId: 'test-c',
        lockedWorktreeConfirmation: { lockReason: 'claude session test-c' }
      })
    ).rejects.toMatchObject({
      code: 'GIT_WORKTREE_LOCKED',
      details: { lockReason: 'new claude session' }
    })

    expect(lifecycle.calls).toEqual(['suspend', 'resume', 'suspension-release'])
    expect(git.unlockCalls).toEqual([])
    expect(git.removeCalls).toEqual([])
    expect(repository.savedProjects).toEqual([])
  })

  it('restores the original lock if ordinary removal fails after unlocking', async () => {
    const repository = new InMemoryProjectRepository()
    const git = new LockedWorktreeGitPort()
    git.inspections.push(createInspection('claude session test-c'))
    git.removeError = new Error('remove failed')
    const lifecycle = createLifecycle()
    const archive = new ArchiveBranchWorkspaceUseCase(repository, git, lifecycle.port)

    await expect(
      archive.execute({
        projectDirectory: '/work/app',
        workspaceId: 'test-c',
        lockedWorktreeConfirmation: { lockReason: 'claude session test-c' }
      })
    ).rejects.toThrow('remove failed')

    expect(git.lockCalls).toEqual([
      {
        repositoryDirectory: '/work/app',
        worktreeDirectory: '/work/app/.claude/worktrees/test-c',
        reason: 'claude session test-c'
      }
    ])
    expect(repository.savedProjects).toEqual([])
    expect(lifecycle.calls).toEqual(['suspend', 'dispose', 'suspension-release', 'release'])
  })
})

function createInspection(lockReason: string): GitRepositoryInspection {
  return {
    isGitRepository: true,
    currentBranch: 'main',
    localBranches: ['main', 'worktree-test-c'],
    branches: [
      {
        name: 'main',
        worktreeDirectory: '/work/app',
        isCurrent: true,
        isLocked: false,
        lockReason: null
      },
      {
        name: 'worktree-test-c',
        worktreeDirectory: '/work/app/.claude/worktrees/test-c',
        isCurrent: false,
        isLocked: true,
        lockReason
      }
    ]
  }
}

function createLifecycle(wasSuspended = false): {
  readonly calls: string[]
  readonly port: WorkspaceAgentLifecyclePort
} {
  const calls: string[] = []
  const attachmentLease = {
    wasQuarantined: false,
    quarantine: () => calls.push('quarantine'),
    release: () => calls.push('release'),
    resolve: () => calls.push('resolve')
  }
  return {
    calls,
    port: {
      disposeProject: async () => attachmentLease,
      disposeWorkspace: async () => {
        calls.push('dispose')
        return attachmentLease
      },
      isWorkspaceQuarantined: () => false,
      resolveProjectQuarantines: () => undefined,
      suspend: async () => {
        calls.push('suspend')
        return {
          ...attachmentLease,
          release: () => calls.push('suspension-release'),
          resume: async () => {
            calls.push('resume')
          },
          wasSuspended
        }
      }
    }
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
        workspaceId: 'test-c',
        workspaceKind: 'linked-worktree',
        displayName: 'test-c',
        directory: '/work/app/.claude/worktrees/test-c',
        gitBranch: 'worktree-test-c',
        isCurrent: false
      }
    ]
  }
}
