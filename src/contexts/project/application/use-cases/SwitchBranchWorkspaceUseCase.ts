import { Project } from '../../domain/aggregates/Project'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { ProjectSnapshot } from '../dto/ProjectSnapshot'
import type { ProjectRepository } from '../ports/ProjectRepository'
import { ProjectWorkspaceTransactionCoordinator } from './ProjectWorkspaceTransactionCoordinator'

export interface SwitchBranchWorkspaceCommand {
  readonly projectDirectory: string
  readonly workspaceName: string
}

export class SwitchBranchWorkspaceUseCase {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly transactionCoordinator = new ProjectWorkspaceTransactionCoordinator()
  ) {}

  async execute(command: SwitchBranchWorkspaceCommand): Promise<ProjectSnapshot> {
    return this.transactionCoordinator.run(command.projectDirectory, () =>
      this.executeTransaction(command)
    )
  }

  private async executeTransaction(
    command: SwitchBranchWorkspaceCommand
  ): Promise<ProjectSnapshot> {
    const projectSnapshot = await this.projectRepository.findByDirectory(command.projectDirectory)

    if (!projectSnapshot) {
      throw createExpectedAppError('PROJECT_NOT_FOUND', 'Project was not found.')
    }

    const project = Project.fromSnapshot(projectSnapshot).switchCurrentWorkspace(
      command.workspaceName
    )

    await this.projectRepository.save(project)

    return project.toSnapshot()
  }
}
