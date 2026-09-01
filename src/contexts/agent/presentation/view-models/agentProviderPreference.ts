export const agentProviderPreferenceStorageKey = 'cleancode:default-agent-provider'

export function readAgentProviderPreference(
  storage: Pick<Storage, 'getItem'> = window.localStorage
): string | null {
  const stored = storage.getItem(agentProviderPreferenceStorageKey)
  if (stored === null) return null
  try {
    const value = JSON.parse(stored) as {
      readonly providerId?: unknown
      readonly version?: unknown
    }
    return value.version === 1 &&
      typeof value.providerId === 'string' &&
      value.providerId.length > 0 &&
      value.providerId === value.providerId.trim()
      ? value.providerId
      : null
  } catch {
    return null
  }
}

export function writeAgentProviderPreference(
  providerId: string,
  storage: Pick<Storage, 'setItem'> = window.localStorage
): void {
  storage.setItem(agentProviderPreferenceStorageKey, JSON.stringify({ providerId, version: 1 }))
}

export function resolveEffectiveAgentProviderId(
  preferredProviderId: string | null,
  installedProviderIds: readonly string[]
): string | null {
  if (preferredProviderId === null) return installedProviderIds[0] ?? null
  return installedProviderIds.includes(preferredProviderId) ? preferredProviderId : null
}
