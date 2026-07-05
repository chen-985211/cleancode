import type { ProjectRegistrySnapshot } from '../dto/ProjectRegistrySnapshot'
import type { ProjectRegistryRepository } from '../ports/ProjectRegistryRepository'

export class ListRememberedProjectsUseCase {
  constructor(private readonly projectRegistryRepository: ProjectRegistryRepository) {}

  async execute(): Promise<ProjectRegistrySnapshot> {
    return this.projectRegistryRepository.get()
  }
}
