import type { AgentProviderAvailability } from '../ports/AgentProviderContribution'
import type { AgentProviderRegistryPort } from '../ports/AgentProviderRegistryPort'

export class InspectAgentProviderUseCase {
  constructor(private readonly providers: AgentProviderRegistryPort) {}

  execute(providerId: string): Promise<AgentProviderAvailability> {
    return this.providers.inspect(providerId)
  }
}
