import { useCallback, useEffect, useRef, useState } from 'react'

import type { UpdateAgentProviderPreferencesCommand } from '../../contexts/agent/application/use-cases/UpdateAgentProviderPreferencesUseCase'
import type { AgentProviderPreferencesSnapshot } from '../../contexts/agent/domain/aggregates/AgentProviderPreferences'
import {
  agentProviderPreferenceStorageKey,
  readAgentProviderPreference
} from './agentProviderPreference'

const browserPreviewPreferences: AgentProviderPreferencesSnapshot = {
  defaultCleancodeMcpEnabled: true,
  defaultProviderId: null,
  disabledProviderIds: [],
  permissionMode: 'yolo',
  providerOverrides: {},
  version: 1
}

export type AgentProviderPreferencesState =
  | { readonly preferences: AgentProviderPreferencesSnapshot; readonly status: 'ready' }
  | { readonly preferences: AgentProviderPreferencesSnapshot; readonly status: 'loading' }
  | { readonly preferences: AgentProviderPreferencesSnapshot; readonly status: 'unavailable' }

export function useAgentProviderPreferences() {
  const [state, setState] = useState<AgentProviderPreferencesState>(() => ({
    preferences: browserPreviewPreferences,
    status: window.cleancode ? 'loading' : 'unavailable'
  }))
  const generationRef = useRef(0)

  const refresh = useCallback(async (): Promise<void> => {
    const api = window.cleancode
    const generation = ++generationRef.current
    if (!api) {
      setState({ preferences: browserPreviewPreferences, status: 'unavailable' })
      return
    }
    try {
      let preferences = await api.getAgentProviderPreferences()
      const legacyDefault = readAgentProviderPreference()
      if (preferences.defaultProviderId === null && legacyDefault) {
        try {
          preferences = await api.updateAgentProviderPreferences({
            defaultProviderId: legacyDefault
          })
        } catch {
          // A stale legacy Provider id should not block the settings surface.
        }
      }
      if (legacyDefault) {
        try {
          window.localStorage.removeItem(agentProviderPreferenceStorageKey)
        } catch {
          // Legacy storage cleanup is best effort.
        }
      }
      if (generation === generationRef.current) {
        setState({ preferences, status: 'ready' })
      }
    } catch {
      if (generation === generationRef.current) {
        setState({ preferences: browserPreviewPreferences, status: 'unavailable' })
      }
    }
  }, [])

  const update = useCallback(
    async (command: UpdateAgentProviderPreferencesCommand): Promise<void> => {
      const api = window.cleancode
      if (!api) return
      const generation = ++generationRef.current
      setState((current) => ({
        preferences: {
          ...current.preferences,
          ...command,
          disabledProviderIds: [
            ...(command.disabledProviderIds ?? current.preferences.disabledProviderIds)
          ],
          providerOverrides: {
            ...(command.providerOverrides ?? current.preferences.providerOverrides)
          },
          version: 1
        },
        status: 'ready'
      }))
      try {
        const preferences = await api.updateAgentProviderPreferences(command)
        if (generation === generationRef.current) {
          setState({ preferences, status: 'ready' })
        }
      } catch (error) {
        await refresh()
        throw error
      }
    },
    [refresh]
  )

  useEffect(() => {
    void refresh()
    return () => {
      generationRef.current += 1
    }
  }, [refresh])

  return { refresh, state, update }
}
