import type { Project } from '../../domain/aggregates/Project'
import type { ProjectSnapshot } from '../dto/ProjectSnapshot'

export interface ProjectRepository {
  save(project: Project): Promise<void>
  findByDirectory(directory: string): Promise<ProjectSnapshot | null>
}
