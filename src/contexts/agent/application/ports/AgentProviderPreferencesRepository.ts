import type { AgentProviderPreferencesSnapshot } from '../../domain/aggregates/AgentProviderPreferences'
import { AgentProviderPreferences } from '../../domain/aggregates/AgentProviderPreferences'

export interface AgentProviderPreferencesRepository {
  load(): Promise<AgentProviderPreferencesSnapshot>
  save(preferences: AgentProviderPreferencesSnapshot): Promise<void>
}

export const defaultAgentProviderPreferencesRepository: AgentProviderPreferencesRepository = {
  load: async () => AgentProviderPreferences.create().toSnapshot(),
  save: async () => undefined
}
