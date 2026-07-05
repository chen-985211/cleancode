import { ProjectRegistry } from '../../domain/aggregates/ProjectRegistry'
import type { ProjectRegistrySnapshot } from '../dto/ProjectRegistrySnapshot'
import type { ProjectRegistryRepository } from '../ports/ProjectRegistryRepository'

export interface ForgetProjectCommand {
  readonly directory: string
}

export class ForgetProjectUseCase {
  constructor(private readonly projectRegistryRepository: ProjectRegistryRepository) {}

  async execute(command: ForgetProjectCommand): Promise<ProjectRegistrySnapshot> {
    const registry = ProjectRegistry.fromSnapshot(await this.projectRegistryRepository.get())
    const rememberedRegistry = registry.forgetProject(command.directory)

    await this.projectRegistryRepository.save(rememberedRegistry)

    return rememberedRegistry.toSnapshot()
  }
}
