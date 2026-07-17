import { ProjectRegistry } from '../../domain/aggregates/ProjectRegistry'
import type { ProjectRegistrySnapshot } from '../dto/ProjectRegistrySnapshot'
import type { ProjectRegistryRepository } from '../ports/ProjectRegistryRepository'
import { ProjectRegistryTransactionCoordinator } from './ProjectRegistryTransactionCoordinator'

export interface RememberProjectCommand {
  readonly directory: string
}

export class RememberProjectUseCase {
  constructor(
    private readonly projectRegistryRepository: ProjectRegistryRepository,
    private readonly transactionCoordinator = new ProjectRegistryTransactionCoordinator()
  ) {}

  async execute(command: RememberProjectCommand): Promise<ProjectRegistrySnapshot> {
    return this.transactionCoordinator.run(() => this.executeTransaction(command))
  }

  private async executeTransaction(
    command: RememberProjectCommand
  ): Promise<ProjectRegistrySnapshot> {
    const registry = ProjectRegistry.fromSnapshot(await this.projectRegistryRepository.get())
    const rememberedRegistry = registry.rememberProject(command.directory)

    await this.projectRegistryRepository.save(rememberedRegistry)

    return rememberedRegistry.toSnapshot()
  }
}
