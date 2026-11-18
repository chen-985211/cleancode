import type { ProjectSnapshot } from '../dto/ProjectSnapshot'
import type { ProjectRepository } from '../ports/ProjectRepository'

export interface FindProjectByDirectoryQuery {
  readonly directory: string
}

export class FindProjectByDirectoryUseCase {
  constructor(private readonly projects: ProjectRepository) {}

  execute(query: FindProjectByDirectoryQuery): Promise<ProjectSnapshot | null> {
    return this.projects.findByDirectory(query.directory)
  }
}
