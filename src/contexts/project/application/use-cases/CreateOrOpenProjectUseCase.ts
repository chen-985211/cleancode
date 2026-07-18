import { Project } from '../../domain/aggregates/Project'
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
  saveSynchronizedProject,
  synchronizeProjectGitBinding
} from '../services/ProjectGitStateSynchronization'
import { ProjectWorkspaceTransactionCoordinator } from './ProjectWorkspaceTransactionCoordinator'

export interface CreateOrOpenProjectCommand {
  readonly directory: string
  readonly name: string
}

export class CreateOrOpenProjectUseCase {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly gitWorkspacePort: GitWorkspacePort,
    private readonly workspaceAgentLifecyclePort: WorkspaceAgentLifecyclePort = noopWorkspaceAgentLifecyclePort,
    private readonly transactionCoordinator = new ProjectWorkspaceTransactionCoordinator(),
    private readonly workspaceRunLifecyclePort: WorkspaceRunLifecyclePort = noopWorkspaceRunLifecyclePort
  ) {}

  async execute(command: CreateOrOpenProjectCommand): Promise<ProjectSnapshot> {
    return this.transactionCoordinator.run(command.directory, () =>
      this.executeTransaction(command)
    )
  }

  private async executeTransaction(command: CreateOrOpenProjectCommand): Promise<ProjectSnapshot> {
    const existingProject = await this.projectRepository.findByDirectory(command.directory)
    const project = existingProject
      ? Project.fromSnapshot(existingProject)
      : Project.create({
          directory: command.directory,
          name: command.name
        })
    const inspection = await this.gitWorkspacePort.inspectRepository(project.directory)
    const synchronizedProject = synchronizeProjectGitBinding(project, inspection)

    await saveSynchronizedProject({
      afterCommit: () => {
        this.workspaceAgentLifecyclePort.resolveProjectQuarantines(synchronizedProject.directory)
        this.workspaceRunLifecyclePort.resolveProjectQuarantines(synchronizedProject.directory)
      },
      currentSnapshot: existingProject,
      project: synchronizedProject,
      projectRepository: this.projectRepository,
      workspaceRunLifecyclePort: this.workspaceRunLifecyclePort
    })

    return synchronizedProject.toSnapshot()
  }
}
