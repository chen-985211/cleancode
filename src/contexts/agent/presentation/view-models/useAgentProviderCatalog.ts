import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore
} from 'react'

import type { AgentProviderDescriptor } from '../../application/ports/AgentProviderContribution'

export type AgentProviderCatalogState =
  | { readonly status: 'loading' }
  | { readonly providers: readonly AgentProviderDescriptor[]; readonly status: 'ready' }
  | { readonly status: 'unavailable' }

export class AgentProviderCatalogStore {
  private readonly listeners = new Set<() => void>()
  private started = false
  private state: AgentProviderCatalogState = window.cleancode
    ? { status: 'loading' }
    : { status: 'unavailable' }

  getState(): AgentProviderCatalogState {
    return this.state
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  ensure(): void {
    if (this.started) return
    this.started = true
    const listProviders = window.cleancode?.listAgentProviders
    if (!listProviders) {
      this.update({ status: 'unavailable' })
      return
    }
    void listProviders()
      .then((providers) => this.update({ providers, status: 'ready' }))
      .catch(() => this.update({ status: 'unavailable' }))
  }

  dispose(): void {
    this.listeners.clear()
  }

  private update(state: AgentProviderCatalogState): void {
    this.state = state
    for (const listener of this.listeners) listener()
  }
}

export const AgentProviderCatalogContext = createContext<AgentProviderCatalogStore | null>(null)

export function useAgentProviderCatalog(): AgentProviderCatalogState {
  const sharedStore = useContext(AgentProviderCatalogContext)
  const [localStore] = useState(() => new AgentProviderCatalogStore())
  const store = sharedStore ?? localStore
  const state = useSyncExternalStore(
    useCallback((listener) => store.subscribe(listener), [store]),
    useCallback(() => store.getState(), [store]),
    useCallback(() => store.getState(), [store])
  )
  useEffect(() => store.ensure(), [store])
  useEffect(
    () => () => {
      if (!sharedStore) localStore.dispose()
    },
    [localStore, sharedStore]
  )

  return state
}

export function useAgentProviderDescriptor(providerId: string): {
  readonly descriptor: AgentProviderDescriptor | null
  readonly isResolved: boolean
} {
  const state = useAgentProviderCatalog()
  return {
    descriptor:
      state.status === 'ready'
        ? (state.providers.find((provider) => provider.id === providerId) ?? null)
        : null,
    isResolved: state.status !== 'loading'
  }
}

export function formatProviderDisplayName(providerId: string): string {
  return providerId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
