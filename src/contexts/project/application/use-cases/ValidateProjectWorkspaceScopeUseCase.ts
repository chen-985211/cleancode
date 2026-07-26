import type { ProjectRegistryRepository } from '../ports/ProjectRegistryRepository'
import type { ProjectRepository } from '../ports/ProjectRepository'

export interface ValidateProjectWorkspaceScopeCommand {
  readonly projectDirectory: string
  readonly projectId: string
  readonly workspaceDirectory: string
  readonly workspaceId: string
}

export class ValidateProjectWorkspaceScopeUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly projectRegistry: ProjectRegistryRepository
  ) {}

  async execute(command: ValidateProjectWorkspaceScopeCommand): Promise<boolean> {
    const [project, registry] = await Promise.all([
      this.projects.findByDirectory(command.projectDirectory),
      this.projectRegistry.get()
    ])
    if (
      !project ||
      project.id !== command.projectId ||
      !registry.projectDirectories.includes(command.projectDirectory)
    ) {
      return false
    }

    return project.workspaces.some(
      (workspace) =>
        workspace.workspaceId === command.workspaceId &&
        workspace.directory === command.workspaceDirectory
    )
  }
}
