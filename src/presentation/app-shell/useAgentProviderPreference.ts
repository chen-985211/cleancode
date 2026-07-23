import { useCallback, useState } from 'react'

import {
  readAgentProviderPreference,
  writeAgentProviderPreference
} from './agentProviderPreference'

export function useAgentProviderPreference() {
  const [preferredProviderId, setPreferredProviderId] = useState<string | null>(
    readAgentProviderPreference
  )

  const changePreferredProvider = useCallback((providerId: string): void => {
    try {
      writeAgentProviderPreference(providerId)
    } catch {
      // Storage is best effort; the active session still uses the new preference.
    }
    setPreferredProviderId(providerId)
  }, [])

  return { changePreferredProvider, preferredProviderId }
}
