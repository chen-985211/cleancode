import { createContext } from 'react'

import type {
  AgentPtyExitEvent,
  AgentPtyOutputEvent
} from '../../contexts/agent/application/dto/AgentSessionProtocol'
import { AgentTerminalSurfaceRegistry } from './agentTerminalSurfaceRegistry'
import { appendTerminalOutputForSession } from './terminalOutputTail'

export interface AgentTerminalEventState {
  readonly exitedSessionIds: ReadonlySet<string>
  readonly surfaceRegistry: AgentTerminalSurfaceRegistry
  readOutput(sessionId: string): string
  subscribe(listener: () => void): () => void
  subscribeExit(listener: (event: AgentPtyExitEvent) => void): () => void
  subscribeOutput(listener: (event: AgentPtyOutputEvent, nextOutput: string) => void): () => void
}

export interface AgentTerminalEventStore extends AgentTerminalEventState {
  connect(api: Window['cleancode']): () => void
}

export const AgentTerminalEventContext = createContext<AgentTerminalEventStore | null>(null)

export function createAgentTerminalEventStore(
  surfaceRegistry = new AgentTerminalSurfaceRegistry()
): AgentTerminalEventStore {
  const exitedSessionIds = new Set<string>()
  const outputBySession = new Map<string, string>()
  const changeListeners = new Set<() => void>()
  const exitListeners = new Set<(event: AgentPtyExitEvent) => void>()
  const outputListeners = new Set<(event: AgentPtyOutputEvent, nextOutput: string) => void>()

  return {
    connect: (api) => {
      const unsubscribeOutput =
        api?.onAgentPtyOutput?.((event) => {
          surfaceRegistry.write(event)
          const nextOutput = appendTerminalOutputForSession(outputBySession, event)
          outputListeners.forEach((listener) => listener(event, nextOutput))
          changeListeners.forEach((listener) => listener())
        }) ?? (() => undefined)
      const unsubscribeExit =
        api?.onAgentPtyExit?.((event) => {
          exitedSessionIds.add(event.sessionId)
          exitListeners.forEach((listener) => listener(event))
          changeListeners.forEach((listener) => listener())
        }) ?? (() => undefined)

      return () => {
        unsubscribeOutput()
        unsubscribeExit()
      }
    },
    exitedSessionIds,
    surfaceRegistry,
    readOutput: (sessionId) => outputBySession.get(sessionId) ?? '',
    subscribe: (listener) => {
      changeListeners.add(listener)
      return () => changeListeners.delete(listener)
    },
    subscribeExit: (listener) => {
      exitListeners.add(listener)
      return () => exitListeners.delete(listener)
    },
    subscribeOutput: (listener) => {
      outputListeners.add(listener)
      return () => outputListeners.delete(listener)
    }
  }
}
