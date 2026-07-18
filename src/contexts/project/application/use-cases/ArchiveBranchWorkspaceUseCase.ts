import { Project } from '../../domain/aggregates/Project'
import {
  createExpectedAppError,
  createUnexpectedAppError
} from '../../../../shared-kernel/application/errors/AppError'
import type { ProjectSnapshot } from '../dto/ProjectSnapshot'
import type { GitWorkspacePort } from '../ports/GitWorkspacePort'
import type { ProjectRepository } from '../ports/ProjectRepository'
import {
  noopWorkspaceAgentLifecyclePort,
  type WorkspaceAgentAttachmentLease,
  type WorkspaceAgentLifecyclePort
} from '../ports/WorkspaceAgentLifecyclePort'
import {
  noopWorkspaceRunLifecyclePort,
  type WorkspaceRunLifecyclePort
} from '../ports/WorkspaceRunLifecyclePort'
import { ProjectWorkspaceTransactionCoordinator } from './ProjectWorkspaceTransactionCoordinator'

export interface ArchiveBranchWorkspaceCommand {
  readonly projectDirectory: string
  readonly workspaceName: string
  readonly lockedWorktreeConfirmation?: LockedWorktreeConfirmation
}

export interface LockedWorktreeConfirmation {
  readonly lockReason: string | null
}

interface WorktreeLock {
  readonly lockReason: string | null
}

export class ArchiveBranchWorkspaceUseCase {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly gitWorkspacePort: GitWorkspacePort,
    private readonly workspaceAgentLifecyclePort: WorkspaceAgentLifecyclePort = noopWorkspaceAgentLifecyclePort,
    private readonly transactionCoordinator = new ProjectWorkspaceTransactionCoordinator(),
    private readonly workspaceRunLifecyclePort: WorkspaceRunLifecyclePort = noopWorkspaceRunLifecyclePort
  ) {}

  async execute(command: ArchiveBranchWorkspaceCommand): Promise<ProjectSnapshot> {
    return this.transactionCoordinator.run(command.projectDirectory, () =>
      this.executeTransaction(command)
    )
  }

  private async executeTransaction(
    command: ArchiveBranchWorkspaceCommand
  ): Promise<ProjectSnapshot> {
    const projectSnapshot = await this.projectRepository.findByDirectory(command.projectDirectory)

    if (!projectSnapshot) {
      throw createExpectedAppError('PROJECT_NOT_FOUND', 'Project was not found.')
    }

    const project = Project.fromSnapshot(projectSnapshot)
    const workspaceName = command.workspaceName.trim()
    const workspace = project.workspaces.find((entry) => entry.name === workspaceName)

    if (!workspace) {
      throw createExpectedAppError('BRANCH_WORKSPACE_NOT_FOUND', 'Branch workspace was not found.')
    }

    const archivedProject = project.archiveBranchWorkspace(workspaceName)
    const workspaceScope = { projectDirectory: project.directory, workspaceName }
    const isRecoveringQuarantine =
      this.workspaceAgentLifecyclePort.isWorkspaceQuarantined(workspaceScope) ||
      this.workspaceRunLifecyclePort.isWorkspaceQuarantined(workspaceScope)
    if (
      !isRecoveringQuarantine &&
      !(await this.gitWorkspacePort.isWorkingTreeClean(workspace.directory))
    ) {
      throw createDirtyWorkspaceError()
    }
    const initialWorktreeLock = isRecoveringQuarantine
      ? null
      : await this.inspectWorktreeLock(project.directory, workspace.directory, workspace.gitBranch)
    assertWorktreeLockConfirmed(initialWorktreeLock, command.lockedWorktreeConfirmation)
    const preparation = isRecoveringQuarantine
      ? {
          agentLease: await this.workspaceAgentLifecyclePort.disposeWorkspace({
            projectDirectory: project.directory,
            workspaceName
          }),
          worktreeLock: null
        }
      : await this.suspendAndDisposeWorkspace(
          project.directory,
          workspace.directory,
          workspace.gitBranch,
          workspaceName,
          command.lockedWorktreeConfirmation
        )
    const { agentLease, worktreeLock } = preparation
    let runLease
    try {
      runLease = await this.workspaceRunLifecyclePort.disposeWorkspace(workspaceScope)
    } catch (error) {
      agentLease.release()
      throw error
    }
    let worktreeRemoved = agentLease.wasQuarantined || runLease.wasQuarantined
    let transactionCommitted = false
    try {
      if (!agentLease.wasQuarantined) {
        await this.removeWorktree(project.directory, workspace.directory, worktreeLock)
        worktreeRemoved = true
      }
      await this.gitWorkspacePort.pruneWorktrees({
        repositoryDirectory: project.directory
      })
      await this.projectRepository.save(archivedProject)
      transactionCommitted = true
      return archivedProject.toSnapshot()
    } finally {
      if (transactionCommitted) {
        agentLease.resolve()
        runLease.resolve()
      } else if (worktreeRemoved) {
        agentLease.quarantine()
        runLease.quarantine()
      } else {
        agentLease.release()
        runLease.release()
      }
    }
  }

  private async suspendAndDisposeWorkspace(
    projectDirectory: string,
    workspaceDirectory: string,
    gitBranch: string | null,
    workspaceName: string,
    lockedWorktreeConfirmation: LockedWorktreeConfirmation | undefined
  ): Promise<{
    readonly agentLease: WorkspaceAgentAttachmentLease
    readonly worktreeLock: WorktreeLock | null
  }> {
    const suspension = await this.workspaceAgentLifecyclePort.suspend(workspaceDirectory)
    try {
      if (!(await this.gitWorkspacePort.isWorkingTreeClean(workspaceDirectory))) {
        throw createDirtyWorkspaceError()
      }
      const worktreeLock = await this.inspectWorktreeLock(
        projectDirectory,
        workspaceDirectory,
        gitBranch
      )
      assertWorktreeLockConfirmed(worktreeLock, lockedWorktreeConfirmation)
      const agentLease = await this.workspaceAgentLifecyclePort.disposeWorkspace({
        projectDirectory,
        workspaceName
      })
      return { agentLease, worktreeLock }
    } catch (error) {
      if (suspension.wasSuspended) await suspension.resume().catch(() => undefined)
      throw error
    } finally {
      suspension.release()
    }
  }

  private async inspectWorktreeLock(
    projectDirectory: string,
    workspaceDirectory: string,
    gitBranch: string | null
  ): Promise<WorktreeLock | null> {
    const inspection = await this.gitWorkspacePort.inspectRepository(projectDirectory)
    const branch = inspection.branches.find(
      (candidate) =>
        candidate.name === gitBranch && candidate.worktreeDirectory === workspaceDirectory
    )

    return branch?.isLocked ? { lockReason: branch.lockReason } : null
  }

  private async removeWorktree(
    projectDirectory: string,
    workspaceDirectory: string,
    worktreeLock: WorktreeLock | null
  ): Promise<void> {
    if (worktreeLock) {
      await this.gitWorkspacePort.unlockBranchWorktree({
        repositoryDirectory: projectDirectory,
        worktreeDirectory: workspaceDirectory
      })
    }

    try {
      await this.gitWorkspacePort.removeBranchWorktree({
        repositoryDirectory: projectDirectory,
        worktreeDirectory: workspaceDirectory
      })
    } catch (removeError) {
      if (worktreeLock) {
        try {
          await this.gitWorkspacePort.lockBranchWorktree({
            repositoryDirectory: projectDirectory,
            worktreeDirectory: workspaceDirectory,
            reason: worktreeLock.lockReason
          })
        } catch (lockRestoreError) {
          throw createUnexpectedAppError('Failed to remove worktree and restore its Git lock.', {
            lockRestoreError: describeError(lockRestoreError),
            removeError: describeError(removeError)
          })
        }
      }
      throw removeError
    }
  }
}

function assertWorktreeLockConfirmed(
  worktreeLock: WorktreeLock | null,
  confirmation: LockedWorktreeConfirmation | undefined
): void {
  if (!worktreeLock) return
  if (confirmation && confirmation.lockReason === worktreeLock.lockReason) return

  throw createExpectedAppError('GIT_WORKTREE_LOCKED', 'Git worktree is locked.', {
    lockReason: worktreeLock.lockReason
  })
}

function createDirtyWorkspaceError() {
  return createExpectedAppError(
    'BRANCH_WORKSPACE_HAS_UNCOMMITTED_CHANGES',
    'Branch workspace has uncommitted changes.'
  )
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
