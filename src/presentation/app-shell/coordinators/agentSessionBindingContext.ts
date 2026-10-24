import { createContext } from 'react'

import type { AgentSessionBindingStore } from './agentSessionBindingStore'

export const AgentSessionBindingContext = createContext<AgentSessionBindingStore | null>(null)
