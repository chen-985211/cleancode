import type { ProjectRepository } from '../ports/ProjectRepository'
import type { ProjectRegistryRepository } from '../ports/ProjectRegistryRepository'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

export class ProjectIssueScope {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly registry: ProjectRegistryRepository
  ) {}
  async require(directory: string) {
    const project = await this.projects.findByDirectory(directory)
    if (!project) throw createExpectedAppError('PROJECT_NOT_FOUND', 'Project was not found.')
    if (!(await this.registry.get()).projectDirectories.includes(project.directory))
      throw createExpectedAppError('PROJECT_NOT_REMEMBERED', 'Project is no longer remembered.')
    return project
  }
}
