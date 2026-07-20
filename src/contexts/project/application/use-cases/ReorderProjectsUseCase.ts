import { ProjectRegistry } from '../../domain/aggregates/ProjectRegistry'
import type { ProjectRegistrySnapshot } from '../dto/ProjectRegistrySnapshot'
import type { ProjectRegistryRepository } from '../ports/ProjectRegistryRepository'
import { ProjectRegistryTransactionCoordinator } from './ProjectRegistryTransactionCoordinator'

export interface ReorderProjectsCommand {
  readonly projectDirectory: string
  readonly beforeProjectDirectory: string | null
}

export class ReorderProjectsUseCase {
  constructor(
    private readonly projectRegistryRepository: ProjectRegistryRepository,
    private readonly transactionCoordinator = new ProjectRegistryTransactionCoordinator()
  ) {}

  async execute(command: ReorderProjectsCommand): Promise<ProjectRegistrySnapshot> {
    return this.transactionCoordinator.run(async () => {
      const registry = ProjectRegistry.fromSnapshot(await this.projectRegistryRepository.get())
      const reorderedRegistry = registry.moveProjectBefore(
        command.projectDirectory,
        command.beforeProjectDirectory
      )

      await this.projectRegistryRepository.save(reorderedRegistry)

      return reorderedRegistry.toSnapshot()
    })
  }
}
