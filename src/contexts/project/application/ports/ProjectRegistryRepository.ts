import type { ProjectRegistry } from '../../domain/aggregates/ProjectRegistry'
import type { ProjectRegistrySnapshot } from '../dto/ProjectRegistrySnapshot'

export interface ProjectRegistryRepository {
  save(registry: ProjectRegistry): Promise<void>
  get(): Promise<ProjectRegistrySnapshot>
}
