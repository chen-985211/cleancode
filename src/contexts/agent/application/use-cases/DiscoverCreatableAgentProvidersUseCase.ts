import type { CreatableAgentProviderSnapshot } from '../dto/AgentProviderDiscoverySnapshot'
import type { PrepareAgentProviderDetectionEnvironmentOptions } from '../ports/AgentProviderDetectionEnvironmentPort'
import type { AgentProviderAvailabilityService } from '../services/AgentProviderAvailabilityService'

export class DiscoverCreatableAgentProvidersUseCase {
  constructor(private readonly availability: AgentProviderAvailabilityService) {}

  execute(
    options: PrepareAgentProviderDetectionEnvironmentOptions = {}
  ): Promise<readonly CreatableAgentProviderSnapshot[]> {
    return this.availability.discoverCreatableProviders(options)
  }
}
