import { useCallback } from 'react'

import { resolveEffectiveAgentProviderId } from './agentProviderPreference'
import { useAgentProviderPreferences } from './useAgentProviderPreferences'
import { useCreatableAgentProviders } from './useCreatableAgentProviders'

export function useAgentCreationProviders() {
  const agentProviderPreferences = useAgentProviderPreferences()
  const creatableAgentProviders = useCreatableAgentProviders()
  const enabledCreatableAgentProviders = creatableAgentProviders.state.providers.filter(
    (provider) =>
      !agentProviderPreferences.state.preferences.disabledProviderIds.includes(
        provider.descriptor.id
      )
  )
  const effectiveAgentProviderId = resolveEffectiveAgentProviderId(
    agentProviderPreferences.state.preferences.defaultProviderId,
    enabledCreatableAgentProviders.map((provider) => provider.descriptor.id)
  )
  const updatePreferences = agentProviderPreferences.update
  const changePreferredProvider = useCallback(
    (providerId: string): void => {
      void updatePreferences({ defaultProviderId: providerId })
    },
    [updatePreferences]
  )

  return {
    agentProviderPreferences,
    changePreferredProvider,
    creatableAgentProviders,
    effectiveAgentProviderId,
    enabledCreatableAgentProviders
  }
}
