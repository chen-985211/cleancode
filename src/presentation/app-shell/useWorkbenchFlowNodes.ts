import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'

import { createAgentConsoleFlowNode } from './agentConsoleFlowNode'
import { preserveWorkbenchNodeTransientLayout } from './preserveWorkbenchNodeTransientLayout'
import { createTerminalFlowNodes } from './terminalFlowNodes'
import type { TerminalGroupDropAction } from './terminalGroupDropTarget'
import type { TerminalViewState, WorkbenchFlowNode, WorkbenchSnapshot } from './types'

type TerminalFlowNodeHandlers = Parameters<typeof createTerminalFlowNodes>[0]['handlers']

interface UseWorkbenchFlowNodesInput {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: WorkbenchSnapshot['project']['workspaces'][number] | undefined
  readonly graph: WorkbenchSnapshot['graph'] | null
  readonly handlers: TerminalFlowNodeHandlers
  readonly hoveredTerminalBlockId: string | null
  readonly isAgentConsoleSelected: boolean
  readonly isTerminalGroupSelectionMode: boolean
  readonly selectedTerminalBlockIds: readonly string[]
  readonly selectedTerminalGroupId: string | null
  readonly selectedUngroupedTerminalBlockIds: readonly string[]
  readonly setCurrentGraph: (graph: WorkbenchSnapshot['graph']) => void
  readonly setNodes: Dispatch<SetStateAction<WorkbenchFlowNode[]>>
  readonly terminalGroupDropAction: TerminalGroupDropAction
  readonly terminalStates: Record<string, TerminalViewState>
}

export function useWorkbenchFlowNodes({
  currentWorkbench,
  currentWorkspace,
  graph,
  handlers,
  hoveredTerminalBlockId,
  isAgentConsoleSelected,
  isTerminalGroupSelectionMode,
  selectedTerminalBlockIds,
  selectedTerminalGroupId,
  selectedUngroupedTerminalBlockIds,
  setCurrentGraph,
  setNodes,
  terminalGroupDropAction,
  terminalStates
}: UseWorkbenchFlowNodesInput): void {
  const graphIdUsedForNodesRef = useRef<string | null>(null)

  useEffect(() => {
    setNodes((currentNodes) => {
      const terminalNodes = createTerminalFlowNodes({
        graph,
        handlers,
        hoveredTerminalBlockId,
        isTerminalGroupSelectionMode,
        selectedTerminalBlockIds,
        selectedTerminalGroupId,
        selectedUngroupedTerminalBlockIds,
        terminalGroupDropAction,
        terminalStates
      })
      const nextNodes = [
        createAgentConsoleFlowNode({
          currentWorkbench,
          currentWorkspace: currentWorkspace ?? null,
          isSelected: isAgentConsoleSelected,
          onGraphUpdated: setCurrentGraph
        }),
        ...terminalNodes
      ]
      const graphId = graph?.id ?? null
      const shouldPreserveTransientLayout = graphIdUsedForNodesRef.current === graphId
      graphIdUsedForNodesRef.current = graphId

      return shouldPreserveTransientLayout
        ? preserveWorkbenchNodeTransientLayout(nextNodes, currentNodes)
        : nextNodes
    })
  }, [
    currentWorkbench,
    currentWorkspace,
    graph,
    handlers,
    hoveredTerminalBlockId,
    isAgentConsoleSelected,
    isTerminalGroupSelectionMode,
    selectedTerminalBlockIds,
    selectedTerminalGroupId,
    selectedUngroupedTerminalBlockIds,
    setCurrentGraph,
    setNodes,
    terminalGroupDropAction,
    terminalStates
  ])
}
