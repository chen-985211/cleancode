import { useEffect, useState, type ReactNode } from 'react'

import type { TerminalSurfaceRegistry } from '../../../contexts/run/presentation/terminal-surface/terminalSurfaceRegistry'
import { AgentSessionBindingContext } from '../coordinators/agentSessionBindingContext'
import { AgentSessionBindingStore } from '../coordinators/agentSessionBindingStore'

export function AgentSessionBindingProvider({
  children,
  registry
}: {
  readonly children: ReactNode
  readonly registry: TerminalSurfaceRegistry
}) {
  const [store] = useState(() => new AgentSessionBindingStore(registry))
  useEffect(() => {
    const unsubscribeRuntime = window.cleancode?.onAgentRuntimeChanged?.((event) =>
      store.accept(event)
    )
    const unsubscribeRetention = registry.onRetentionChange(store.prune)
    return () => {
      unsubscribeRuntime?.()
      unsubscribeRetention()
    }
  }, [registry, store])
  return (
    <AgentSessionBindingContext.Provider value={store}>
      {children}
    </AgentSessionBindingContext.Provider>
  )
}
