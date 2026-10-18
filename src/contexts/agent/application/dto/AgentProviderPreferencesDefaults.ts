import { AgentProviderPreferences } from '../../domain/aggregates/AgentProviderPreferences'

export const defaultAgentProviderPreferences = AgentProviderPreferences.create().toSnapshot()
