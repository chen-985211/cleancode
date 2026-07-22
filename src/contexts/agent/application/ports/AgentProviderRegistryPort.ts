import type {
  AgentProviderAvailability,
  AgentProviderContribution,
  AgentProviderDescriptor
} from './AgentProviderContribution'
import type {
  ProviderSessionRef,
  ProviderSessionRefSnapshot
} from '../../domain/value-objects/ProviderSessionRef'

export interface AgentProviderRegistryPort {
  inspect(providerId: string): Promise<AgentProviderAvailability>
  listDescriptors(): readonly AgentProviderDescriptor[]
  parseSessionRef(providerId: string, sessionRef: ProviderSessionRefSnapshot): ProviderSessionRef
  require(providerId: string): AgentProviderContribution
}
