import { useCallback, useEffect, useRef, useState } from 'react'

import type { CreatableAgentProviderSnapshot } from '../../contexts/agent/application/dto/AgentProviderDiscoverySnapshot'

export type CreatableAgentProvidersState =
  | { readonly status: 'loading'; readonly providers: readonly [] }
  | {
      readonly status: 'ready'
      readonly providers: readonly CreatableAgentProviderSnapshot[]
    }
  | { readonly status: 'error'; readonly providers: readonly [] }

export function useCreatableAgentProviders() {
  const [state, setState] = useState<CreatableAgentProvidersState>(() =>
    window.cleancode ? { providers: [], status: 'loading' } : { providers: [], status: 'ready' }
  )
  const generationRef = useRef(0)

  const refresh = useCallback(async (force = true): Promise<void> => {
    const discover = window.cleancode?.discoverCreatableAgentProviders
    const generation = ++generationRef.current
    if (!discover) {
      setState({ providers: [], status: 'ready' })
      return
    }
    setState((current) =>
      current.status === 'ready' && !force ? current : { providers: [], status: 'loading' }
    )
    try {
      const providers = await discover(force ? { refresh: true } : undefined)
      if (generation === generationRef.current) setState({ providers, status: 'ready' })
    } catch {
      if (generation === generationRef.current) setState({ providers: [], status: 'error' })
    }
  }, [])

  useEffect(() => {
    void refresh(false)
    return () => {
      generationRef.current += 1
    }
  }, [refresh])

  return { refresh, state }
}
