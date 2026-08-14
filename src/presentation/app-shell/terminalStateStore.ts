import { useCallback, useSyncExternalStore } from 'react'

import { createIdleTerminalState, type TerminalStateStore, type TerminalViewState } from './types'

export type { TerminalStateStore } from './types'

const idleTerminalState = createIdleTerminalState()

export function createTerminalStateStore(
  initialStates: Readonly<Record<string, TerminalViewState>> = {}
): TerminalStateStore {
  let states = initialStates
  const listenersByTerminalId = new Map<string, Set<() => void>>()

  return {
    getDiagnostics: () => ({
      listenerCount: countListeners(listenersByTerminalId),
      stateCount: Object.keys(states).length
    }),
    getState: (terminalId) => states[terminalId] ?? idleTerminalState,
    replaceStates: (nextStates) => {
      if (nextStates === states) return
      const previousStates = states
      states = nextStates

      for (const [terminalId, listeners] of listenersByTerminalId) {
        if (
          (previousStates[terminalId] ?? idleTerminalState) ===
          (nextStates[terminalId] ?? idleTerminalState)
        ) {
          continue
        }
        for (const listener of listeners) listener()
      }
    },
    subscribe: (terminalId, listener) => {
      const listeners = listenersByTerminalId.get(terminalId) ?? new Set()
      listeners.add(listener)
      listenersByTerminalId.set(terminalId, listeners)

      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) listenersByTerminalId.delete(terminalId)
      }
    }
  }
}

export function useTerminalState(
  store: TerminalStateStore | undefined,
  terminalId: string,
  fallbackState: TerminalViewState | undefined = idleTerminalState,
  enabled = true
): TerminalViewState {
  const subscribe = useCallback(
    (listener: () => void) =>
      enabled ? (store?.subscribe(terminalId, listener) ?? (() => undefined)) : () => undefined,
    [enabled, store, terminalId]
  )
  const getSnapshot = useCallback(
    () => store?.getState(terminalId) ?? fallbackState ?? idleTerminalState,
    [fallbackState, store, terminalId]
  )

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

function countListeners(
  listenersByTerminalId: ReadonlyMap<string, ReadonlySet<() => void>>
): number {
  let listenerCount = 0
  for (const listeners of listenersByTerminalId.values()) listenerCount += listeners.size
  return listenerCount
}
