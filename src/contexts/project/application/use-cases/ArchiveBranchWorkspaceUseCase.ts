import { Project } from '../../domain/aggregates/Project'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { ProjectSnapshot } from '../dto/ProjectSnapshot'
import type { GitWorkspacePort } from '../ports/GitWorkspacePort'
import type { ProjectRepository } from '../ports/ProjectRepository'
import {
  noopWorkspaceAgentLifecyclePort,
  type WorkspaceAgentAttachmentLease,
  type WorkspaceAgentLifecyclePort
} from '../ports/WorkspaceAgentLifecyclePort'
import { ProjectWorkspaceTransactionCoordinator } from './ProjectWorkspaceTransactionCoordinator'

export interface ArchiveBranchWorkspaceCommand {
  readonly projectDirectory: string
  readonly workspaceName: string
}

export class ArchiveBranchWorkspaceUseCase {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly gitWorkspacePort: GitWorkspacePort,
    private readonly workspaceAgentLifecyclePort: WorkspaceAgentLifecyclePort = noopWorkspaceAgentLifecyclePort,
    private readonly transactionCoordinator = new ProjectWorkspaceTransactionCoordinator()
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
    const isRecoveringQuarantine = this.workspaceAgentLifecyclePort.isWorkspaceQuarantined({
      projectDirectory: project.directory,
      workspaceName
    })
    if (
      !isRecoveringQuarantine &&
      !(await this.gitWorkspacePort.isWorkingTreeClean(workspace.directory))
    ) {
      throw createDirtyWorkspaceError()
    }
    const agentLease = isRecoveringQuarantine
      ? await this.workspaceAgentLifecyclePort.disposeWorkspace({
          projectDirectory: project.directory,
          workspaceName
        })
      : await this.suspendAndDisposeWorkspace(project.directory, workspace.directory, workspaceName)
    let worktreeRemoved = agentLease.wasQuarantined
    let transactionCommitted = false
    try {
      if (!agentLease.wasQuarantined) {
        await this.gitWorkspacePort.removeBranchWorktree({
          repositoryDirectory: project.directory,
          worktreeDirectory: workspace.directory
        })
        worktreeRemoved = true
      }
      await this.gitWorkspacePort.pruneWorktrees({
        repositoryDirectory: project.directory
      })
      await this.projectRepository.save(archivedProject)
      transactionCommitted = true
      return archivedProject.toSnapshot()
    } finally {
      if (transactionCommitted) agentLease.resolve()
      else if (worktreeRemoved) agentLease.quarantine()
      else agentLease.release()
    }
  }

  private async suspendAndDisposeWorkspace(
    projectDirectory: string,
    workspaceDirectory: string,
    workspaceName: string
  ): Promise<WorkspaceAgentAttachmentLease> {
    const suspension = await this.workspaceAgentLifecyclePort.suspend(workspaceDirectory)
    try {
      if (!(await this.gitWorkspacePort.isWorkingTreeClean(workspaceDirectory))) {
        throw createDirtyWorkspaceError()
      }
      return await this.workspaceAgentLifecyclePort.disposeWorkspace({
        projectDirectory,
        workspaceName
      })
    } catch (error) {
      if (suspension.wasSuspended) await suspension.resume().catch(() => undefined)
      throw error
    } finally {
      suspension.release()
    }
  }
}

function createDirtyWorkspaceError() {
  return createExpectedAppError(
    'BRANCH_WORKSPACE_HAS_UNCOMMITTED_CHANGES',
    'Branch workspace has uncommitted changes.'
  )
}
