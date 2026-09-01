import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore
} from 'react'

import type { AgentProviderAvailability } from '../../application/ports/AgentProviderContribution'

export type AgentProviderPanelState =
  | { readonly status: 'unavailable' }
  | { readonly status: 'checking'; readonly visible: boolean }
  | { readonly availability: AgentProviderAvailability; readonly status: 'ready' }

export interface AgentProviderStateController {
  readonly retry: () => void
  readonly state: AgentProviderPanelState
}

interface ProviderEntry {
  checkingTimer: ReturnType<typeof setTimeout> | null
  generation: number
  listeners: Set<() => void>
  retryTimer: ReturnType<typeof setTimeout> | null
  started: boolean
  state: AgentProviderPanelState
}

const checkingNoticeDelayMs = 400
const automaticRetryDelayMs = 600

export class AgentProviderStateStore {
  private readonly entries = new Map<string, ProviderEntry>()

  getState(providerId: string): AgentProviderPanelState {
    return this.requireEntry(providerId).state
  }

  subscribe(providerId: string, listener: () => void): () => void {
    const entry = this.requireEntry(providerId)
    entry.listeners.add(listener)
    return () => entry.listeners.delete(listener)
  }

  ensure(providerId: string): void {
    const entry = this.requireEntry(providerId)
    if (entry.started) return
    entry.started = true
    this.retry(providerId)
  }

  retry(providerId: string): void {
    const entry = this.requireEntry(providerId)
    entry.generation += 1
    const generation = entry.generation
    clearEntryTimers(entry)

    const inspectProvider = resolveProviderInspector(providerId)
    if (!inspectProvider) {
      this.update(entry, { status: 'unavailable' })
      return
    }

    this.update(entry, { status: 'checking', visible: false })
    entry.checkingTimer = setTimeout(() => {
      if (generation !== entry.generation || entry.state.status !== 'checking') return
      this.update(entry, { status: 'checking', visible: true })
    }, checkingNoticeDelayMs)

    const inspect = async (isAutomaticRetry: boolean): Promise<void> => {
      const availability = await inspectProvider().catch((): AgentProviderAvailability => ({
        providerId,
        reason: 'command_failed',
        status: 'temporarily_unavailable',
        version: null
      }))
      if (generation !== entry.generation) return
      if (!isAutomaticRetry && availability.status !== 'installed') {
        entry.retryTimer = setTimeout(() => void inspect(true), automaticRetryDelayMs)
        return
      }
      clearEntryTimers(entry)
      this.update(entry, { availability, status: 'ready' })
    }

    void inspect(false)
  }

  dispose(): void {
    for (const entry of this.entries.values()) {
      entry.generation += 1
      clearEntryTimers(entry)
      entry.listeners.clear()
    }
    this.entries.clear()
  }

  private requireEntry(providerId: string): ProviderEntry {
    const existing = this.entries.get(providerId)
    if (existing) return existing
    const entry: ProviderEntry = {
      checkingTimer: null,
      generation: 0,
      listeners: new Set(),
      retryTimer: null,
      started: false,
      state: window.cleancode ? { status: 'checking', visible: false } : { status: 'unavailable' }
    }
    this.entries.set(providerId, entry)
    return entry
  }

  private update(entry: ProviderEntry, state: AgentProviderPanelState): void {
    entry.state = state
    for (const listener of entry.listeners) listener()
  }
}

export const AgentProviderStateContext = createContext<AgentProviderStateStore | null>(null)

export function useAgentProviderState(providerId: string): AgentProviderStateController {
  const sharedStore = useContext(AgentProviderStateContext)
  const [localStore] = useState(() => new AgentProviderStateStore())
  const store = sharedStore ?? localStore
  const state = useSyncExternalStore(
    useCallback((listener) => store.subscribe(providerId, listener), [providerId, store]),
    useCallback(() => store.getState(providerId), [providerId, store]),
    useCallback(() => store.getState(providerId), [providerId, store])
  )

  useEffect(() => {
    store.ensure(providerId)
  }, [providerId, store])
  useEffect(
    () => () => {
      if (!sharedStore) localStore.dispose()
    },
    [localStore, sharedStore]
  )

  const retry = useCallback(() => store.retry(providerId), [providerId, store])
  return { retry, state }
}

function resolveProviderInspector(
  providerId: string
): (() => Promise<AgentProviderAvailability>) | null {
  const inspectAgentProvider = window.cleancode?.inspectAgentProvider
  return inspectAgentProvider ? () => inspectAgentProvider({ providerId }) : null
}

function clearEntryTimers(entry: ProviderEntry): void {
  if (entry.checkingTimer !== null) clearTimeout(entry.checkingTimer)
  if (entry.retryTimer !== null) clearTimeout(entry.retryTimer)
  entry.checkingTimer = null
  entry.retryTimer = null
}
