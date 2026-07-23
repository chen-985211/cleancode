import {
  agentProviderPreferenceStorageKey,
  readAgentProviderPreference,
  resolveEffectiveAgentProviderId,
  writeAgentProviderPreference
} from '../../../src/presentation/app-shell/agentProviderPreference'

describe('Agent Provider preference', () => {
  it('persists one application-level default Provider', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    }

    writeAgentProviderPreference('claude-code', storage)

    expect(values.get(agentProviderPreferenceStorageKey)).toBe(
      JSON.stringify({ providerId: 'claude-code', version: 1 })
    )
    expect(readAgentProviderPreference(storage)).toBe('claude-code')
  })

  it('rejects malformed stored values without inventing a Provider', () => {
    const storage = {
      getItem: () => JSON.stringify({ providerId: '  ', version: 1 })
    }

    expect(readAgentProviderPreference(storage)).toBeNull()
  })

  it('uses the first installed Provider only before a preference is set', () => {
    const providerIds = ['codex', 'claude-code']

    expect(resolveEffectiveAgentProviderId(null, providerIds)).toBe('codex')
    expect(resolveEffectiveAgentProviderId('claude-code', providerIds)).toBe('claude-code')
    expect(resolveEffectiveAgentProviderId('pi', providerIds)).toBeNull()
    expect(resolveEffectiveAgentProviderId(null, [])).toBeNull()
  })
})
