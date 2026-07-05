import { ProjectRegistry } from '../../domain/aggregates/ProjectRegistry'
import type { ProjectRegistrySnapshot } from '../dto/ProjectRegistrySnapshot'
import type { ProjectRegistryRepository } from '../ports/ProjectRegistryRepository'

export interface RememberProjectCommand {
  readonly directory: string
}

export class RememberProjectUseCase {
  constructor(private readonly projectRegistryRepository: ProjectRegistryRepository) {}

  async execute(command: RememberProjectCommand): Promise<ProjectRegistrySnapshot> {
    const registry = ProjectRegistry.fromSnapshot(await this.projectRegistryRepository.get())
    const rememberedRegistry = registry.rememberProject(command.directory)

    await this.projectRegistryRepository.save(rememberedRegistry)

    return rememberedRegistry.toSnapshot()
  }
}
