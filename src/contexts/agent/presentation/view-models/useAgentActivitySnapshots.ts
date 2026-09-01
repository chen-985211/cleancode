import { createContext, useContext, useSyncExternalStore } from 'react'

import type { TerminalAgentActivitySnapshot } from '../../application/dto/AgentActivityProtocol'
import type { AgentActivityStore } from './agentActivityStore'

export const AgentActivityStoreContext = createContext<AgentActivityStore | null>(null)

export function useAgentActivitySnapshots(): readonly TerminalAgentActivitySnapshot[] {
  const store = useContext(AgentActivityStoreContext)
  if (!store)
    throw new Error('useAgentActivitySnapshots must be used inside AgentActivityObserver.')

  return useSyncExternalStore(store.subscribe, store.getSnapshots, store.getSnapshots)
}
