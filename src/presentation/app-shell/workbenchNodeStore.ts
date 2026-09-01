import { useSyncExternalStore, type Dispatch, type SetStateAction } from 'react'

import type { WorkbenchFlowNode } from './types/workbenchFlowNode'

export interface WorkbenchNodeStore {
  readonly getNodes: () => WorkbenchFlowNode[]
  readonly setNodes: Dispatch<SetStateAction<WorkbenchFlowNode[]>>
  readonly subscribe: (listener: () => void) => () => void
}

export function createWorkbenchNodeStore(
  initialNodes: WorkbenchFlowNode[] = []
): WorkbenchNodeStore {
  let nodes = initialNodes
  const listeners = new Set<() => void>()

  return {
    getNodes: () => nodes,
    setNodes: (value) => {
      const nextNodes = typeof value === 'function' ? value(nodes) : value

      if (nextNodes === nodes) return

      nodes = nextNodes
      listeners.forEach((listener) => listener())
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

export function useWorkbenchNodes(store: WorkbenchNodeStore): WorkbenchFlowNode[] {
  return useSyncExternalStore(store.subscribe, store.getNodes, store.getNodes)
}
