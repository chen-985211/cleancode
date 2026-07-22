import type {
  AgentProviderAvailability,
  AgentProviderContribution,
  AgentProviderDescriptor
} from './AgentProviderContribution'

export interface AgentProviderRegistryPort {
  inspect(providerId: string): Promise<AgentProviderAvailability>
  listDescriptors(): readonly AgentProviderDescriptor[]
  require(providerId: string): AgentProviderContribution
}
