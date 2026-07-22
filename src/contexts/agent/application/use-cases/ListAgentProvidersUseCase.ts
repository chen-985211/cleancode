import type { AgentProviderDescriptor } from '../ports/AgentProviderContribution'
import type { AgentProviderRegistryPort } from '../ports/AgentProviderRegistryPort'

export class ListAgentProvidersUseCase {
  constructor(private readonly providers: AgentProviderRegistryPort) {}

  execute(): readonly AgentProviderDescriptor[] {
    return this.providers.listDescriptors()
  }
}
