import { useEffect, useState, type ReactNode } from 'react'

import {
  AgentProviderStateContext,
  AgentProviderStateStore
} from '../view-models/useAgentProviderState'
import {
  AgentProviderCatalogContext,
  AgentProviderCatalogStore
} from '../view-models/useAgentProviderCatalog'

export function AgentProviderStateProvider({ children }: { readonly children: ReactNode }) {
  const [store] = useState(() => new AgentProviderStateStore())
  const [catalog] = useState(() => new AgentProviderCatalogStore())
  useEffect(
    () => () => {
      catalog.dispose()
      store.dispose()
    },
    [catalog, store]
  )

  return (
    <AgentProviderCatalogContext.Provider value={catalog}>
      <AgentProviderStateContext.Provider value={store}>
        {children}
      </AgentProviderStateContext.Provider>
    </AgentProviderCatalogContext.Provider>
  )
}
