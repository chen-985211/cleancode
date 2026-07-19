import type { ReactNode } from 'react'

import { CodexCliStateContext, useCodexCliInspection } from './useCodexCliState'

export function CodexCliStateProvider({ children }: { readonly children: ReactNode }) {
  const controller = useCodexCliInspection(true)

  return (
    <CodexCliStateContext.Provider value={controller}>{children}</CodexCliStateContext.Provider>
  )
}
