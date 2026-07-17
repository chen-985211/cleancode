import { ProjectRegistry } from '../../domain/aggregates/ProjectRegistry'
import type { ProjectRegistrySnapshot } from '../dto/ProjectRegistrySnapshot'
import type { ProjectRegistryRepository } from '../ports/ProjectRegistryRepository'
import {
  noopWorkspaceAgentLifecyclePort,
  type WorkspaceAgentLifecyclePort
} from '../ports/WorkspaceAgentLifecyclePort'
import { ProjectRegistryTransactionCoordinator } from './ProjectRegistryTransactionCoordinator'
import { ProjectWorkspaceTransactionCoordinator } from './ProjectWorkspaceTransactionCoordinator'

export interface ForgetProjectCommand {
  readonly directory: string
}

export class ForgetProjectUseCase {
  constructor(
    private readonly projectRegistryRepository: ProjectRegistryRepository,
    private readonly workspaceAgentLifecyclePort: WorkspaceAgentLifecyclePort = noopWorkspaceAgentLifecyclePort,
    private readonly workspaceTransactionCoordinator = new ProjectWorkspaceTransactionCoordinator(),
    private readonly registryTransactionCoordinator = new ProjectRegistryTransactionCoordinator()
  ) {}

  async execute(command: ForgetProjectCommand): Promise<ProjectRegistrySnapshot> {
    return this.workspaceTransactionCoordinator.run(command.directory, () =>
      this.executeTransaction(command)
    )
  }

  private async executeTransaction(
    command: ForgetProjectCommand
  ): Promise<ProjectRegistrySnapshot> {
    const agentLease = await this.workspaceAgentLifecyclePort.disposeProject(command.directory)
    let transactionCommitted = false
    try {
      const registry = await this.registryTransactionCoordinator.run(() =>
        this.forgetFromRegistry(command)
      )
      transactionCommitted = true

      return registry
    } finally {
      if (transactionCommitted) agentLease.resolve()
      else agentLease.release()
    }
  }

  private async forgetFromRegistry(
    command: ForgetProjectCommand
  ): Promise<ProjectRegistrySnapshot> {
    const registry = ProjectRegistry.fromSnapshot(await this.projectRegistryRepository.get())
    const rememberedRegistry = registry.forgetProject(command.directory)

    await this.projectRegistryRepository.save(rememberedRegistry)

    return rememberedRegistry.toSnapshot()
  }
}
