import { useContext, useEffect, useState, useSyncExternalStore } from 'react'

import {
  AgentTerminalEventContext,
  createAgentTerminalEventStore,
  type AgentTerminalEventState
} from './agentTerminalEventState'

export function useAgentTerminalEvents(): AgentTerminalEventState {
  const sharedStore = useContext(AgentTerminalEventContext)
  const [localStore] = useState(createAgentTerminalEventStore)

  useEffect(() => {
    if (sharedStore) return undefined
    return localStore.connect(window.cleancode)
  }, [localStore, sharedStore])

  return sharedStore ?? localStore
}

export function useAgentTerminalOutput(sessionId: string): string {
  const events = useAgentTerminalEvents()

  return useSyncExternalStore(
    events.subscribe,
    () => events.readOutput(sessionId),
    () => events.readOutput(sessionId)
  )
}
