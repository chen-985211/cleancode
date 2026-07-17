import { ProjectRegistry } from '../../domain/aggregates/ProjectRegistry'
import type { ProjectRegistrySnapshot } from '../dto/ProjectRegistrySnapshot'
import type { ProjectRegistryRepository } from '../ports/ProjectRegistryRepository'
import { ProjectRegistryTransactionCoordinator } from './ProjectRegistryTransactionCoordinator'

export interface SelectCurrentProjectCommand {
  readonly directory: string | null
}

export class SelectCurrentProjectUseCase {
  constructor(
    private readonly projectRegistryRepository: ProjectRegistryRepository,
    private readonly transactionCoordinator = new ProjectRegistryTransactionCoordinator()
  ) {}

  async execute(command: SelectCurrentProjectCommand): Promise<ProjectRegistrySnapshot> {
    return this.transactionCoordinator.run(async () => {
      const registry = ProjectRegistry.fromSnapshot(await this.projectRegistryRepository.get())
      const selectedRegistry = registry.selectCurrentProject(command.directory)

      await this.projectRegistryRepository.save(selectedRegistry)

      return selectedRegistry.toSnapshot()
    })
  }
}
