import type { AgentProviderAvailability } from '../ports/AgentProviderContribution'
import type { AgentProviderAvailabilityService } from '../services/AgentProviderAvailabilityService'

export class InspectAgentProviderUseCase {
  constructor(private readonly availability: AgentProviderAvailabilityService) {}

  execute(providerId: string): Promise<AgentProviderAvailability> {
    return this.availability.inspect(providerId, { refresh: true })
  }
}
