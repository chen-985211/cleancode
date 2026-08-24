import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { WorkspaceExternalOpenTarget } from '../dto/WorkspaceExternalOpen'
import type { ProjectRepository } from '../ports/ProjectRepository'
import type { WorkspaceExternalOpenPort } from '../ports/WorkspaceExternalOpenPort'

export interface OpenWorkspaceExternallyCommand {
  readonly projectDirectory: string
  readonly target: WorkspaceExternalOpenTarget
  readonly workspaceId: string
}

export class OpenWorkspaceExternallyUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly externalOpen: WorkspaceExternalOpenPort
  ) {}

  async execute(command: OpenWorkspaceExternallyCommand): Promise<void> {
    const project = await this.projects.findByDirectory(command.projectDirectory)

    if (!project) {
      throw createExpectedAppError('PROJECT_NOT_FOUND', 'Project was not found.')
    }

    const workspace = project.workspaces.find(
      (candidate) => candidate.workspaceId === command.workspaceId
    )

    if (!workspace) {
      throw createExpectedAppError('BRANCH_WORKSPACE_NOT_FOUND', 'Workspace was not found.')
    }

    await this.externalOpen.open({
      directory: workspace.directory,
      target: command.target
    })
  }
}
