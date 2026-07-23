import type {
  AgentProviderAvailability,
  AgentProviderDescriptor
} from '../ports/AgentProviderContribution'

type InstalledAgentProviderAvailability = Extract<
  AgentProviderAvailability,
  { readonly status: 'installed' }
>

export interface CreatableAgentProviderSnapshot {
  readonly availability: InstalledAgentProviderAvailability
  readonly descriptor: AgentProviderDescriptor
}
