import { useEffect, useState, type ReactNode } from 'react'

import {
  AgentTerminalEventContext,
  createAgentTerminalEventStore,
  type AgentTerminalEventStore
} from './agentTerminalEventState'

export function AgentTerminalEventProvider({
  children,
  store: providedStore
}: {
  readonly children: ReactNode
  readonly store?: AgentTerminalEventStore
}) {
  const [localStore] = useState(createAgentTerminalEventStore)
  const store = providedStore ?? localStore

  useEffect(() => store.connect(window.cleancode), [store])

  return (
    <AgentTerminalEventContext.Provider value={store}>
      {children}
    </AgentTerminalEventContext.Provider>
  )
}
