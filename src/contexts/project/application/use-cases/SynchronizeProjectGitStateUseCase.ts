import { Project } from '../../domain/aggregates/Project'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { ProjectSnapshot } from '../dto/ProjectSnapshot'
import type { GitWorkspacePort } from '../ports/GitWorkspacePort'
import type { ProjectRepository } from '../ports/ProjectRepository'
import {
  noopWorkspaceAgentLifecyclePort,
  type WorkspaceAgentLifecyclePort
} from '../ports/WorkspaceAgentLifecyclePort'
import {
  noopWorkspaceRunLifecyclePort,
  type WorkspaceRunLifecyclePort
} from '../ports/WorkspaceRunLifecyclePort'
import {
  areProjectSnapshotsEqual,
  saveSynchronizedProject,
  synchronizeProjectGitBinding
} from '../services/ProjectGitStateSynchronization'
import { ProjectWorkspaceTransactionCoordinator } from './ProjectWorkspaceTransactionCoordinator'

export interface SynchronizeProjectGitStateCommand {
  readonly projectDirectory: string
}

export class SynchronizeProjectGitStateUseCase {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly gitWorkspacePort: GitWorkspacePort,
    private readonly workspaceAgentLifecyclePort: WorkspaceAgentLifecyclePort = noopWorkspaceAgentLifecyclePort,
    private readonly transactionCoordinator = new ProjectWorkspaceTransactionCoordinator(),
    private readonly workspaceRunLifecyclePort: WorkspaceRunLifecyclePort = noopWorkspaceRunLifecyclePort
  ) {}

  async execute(command: SynchronizeProjectGitStateCommand): Promise<ProjectSnapshot | null> {
    return this.transactionCoordinator.run(command.projectDirectory, () =>
      this.executeTransaction(command)
    )
  }

  private async executeTransaction(
    command: SynchronizeProjectGitStateCommand
  ): Promise<ProjectSnapshot | null> {
    const projectSnapshot = await this.projectRepository.findByDirectory(command.projectDirectory)

    if (!projectSnapshot) {
      throw createExpectedAppError('PROJECT_NOT_FOUND', 'Project was not found.')
    }

    const project = Project.fromSnapshot(projectSnapshot)
    const inspection = await this.gitWorkspacePort.inspectRepository(project.directory)
    const synchronizedProject = synchronizeProjectGitBinding(project, inspection)
    const synchronizedSnapshot = synchronizedProject.toSnapshot()

    if (areProjectSnapshotsEqual(projectSnapshot, synchronizedSnapshot)) {
      this.workspaceAgentLifecyclePort.resolveProjectQuarantines(project.directory)
      this.workspaceRunLifecyclePort.resolveProjectQuarantines(project.directory)
      return null
    }

    await saveSynchronizedProject({
      afterCommit: () => {
        this.workspaceAgentLifecyclePort.resolveProjectQuarantines(project.directory)
        this.workspaceRunLifecyclePort.resolveProjectQuarantines(project.directory)
      },
      currentSnapshot: projectSnapshot,
      project: synchronizedProject,
      projectRepository: this.projectRepository,
      workspaceRunLifecyclePort: this.workspaceRunLifecyclePort
    })

    return synchronizedSnapshot
  }
}
