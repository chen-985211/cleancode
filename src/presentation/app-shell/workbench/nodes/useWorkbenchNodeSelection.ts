import type { NodeChange } from '@xyflow/react'
import { useCallback, type Dispatch, type MouseEvent, type SetStateAction } from 'react'

import {
  readAgentIdFromFlowNodeId,
  toAgentFlowNodeId
} from '../../projections/agentConsoleFlowNode'
import { applyWorkbenchNodeChanges } from './applyWorkbenchNodeChanges'
import type { WorkbenchFlowNode } from '../../types/workbenchFlowNode'

export function useWorkbenchNodeSelection({
  focusSelectedWorkbenchNode,
  isTerminalGroupSelectionMode,
  returnToGlobalCanvasView,
  selectTerminalBlock,
  selectTerminalGroup,
  selectedAgentId,
  selectedTerminalBlockIds,
  selectedTerminalGroupId,
  setNodes,
  setSelectedAgentId,
  setSelectedTerminalBlockIds,
  setSelectedTerminalGroupId
}: {
  readonly focusSelectedWorkbenchNode: (nodeId: string) => void
  readonly isTerminalGroupSelectionMode: boolean
  readonly returnToGlobalCanvasView: (anchorNodeId: string | null) => void
  readonly selectTerminalBlock: (blockId: string, additive: boolean) => void
  readonly selectTerminalGroup: (groupId: string) => void
  readonly selectedAgentId: string | null
  readonly selectedTerminalBlockIds: readonly string[]
  readonly selectedTerminalGroupId: string | null
  readonly setNodes: Dispatch<SetStateAction<WorkbenchFlowNode[]>>
  readonly setSelectedAgentId: Dispatch<SetStateAction<string | null>>
  readonly setSelectedTerminalBlockIds: Dispatch<SetStateAction<string[]>>
  readonly setSelectedTerminalGroupId: Dispatch<SetStateAction<string | null>>
}) {
  const onNodesChange = useCallback(
    (changes: NodeChange<WorkbenchFlowNode>[]) => {
      const agentSelectionChange = changes.find(
        (change) => change.type === 'select' && readAgentIdFromFlowNodeId(change.id)
      )

      if (agentSelectionChange?.type === 'select') {
        const agentId = readAgentIdFromFlowNodeId(agentSelectionChange.id)
        setSelectedAgentId(agentSelectionChange.selected ? agentId : null)
      }

      setNodes((currentNodes) =>
        applyWorkbenchNodeChanges(changes, currentNodes, {
          shouldResizeExpandedTerminalGroups: !isTerminalGroupSelectionMode
        })
      )
    },
    [isTerminalGroupSelectionMode, setNodes, setSelectedAgentId]
  )

  const selectWorkbenchNode = useCallback(
    (event: MouseEvent, node: WorkbenchFlowNode) => {
      if (node.type !== 'terminalGroup' || !isWorkbenchNodeTitleClick(event)) return

      setSelectedAgentId(null)
      selectTerminalGroup(node.id)
      focusSelectedWorkbenchNode(node.id)
    },
    [focusSelectedWorkbenchNode, selectTerminalGroup, setSelectedAgentId]
  )

  const selectAgent = useCallback(
    (agentId: string, shouldFocus: boolean) => {
      setSelectedAgentId(agentId)
      setSelectedTerminalBlockIds([])
      setSelectedTerminalGroupId(null)
      if (shouldFocus) focusSelectedWorkbenchNode(toAgentFlowNodeId(agentId))
    },
    [
      focusSelectedWorkbenchNode,
      setSelectedAgentId,
      setSelectedTerminalBlockIds,
      setSelectedTerminalGroupId
    ]
  )
  const selectAgentFromTitle = useCallback(
    (agentId: string) => selectAgent(agentId, true),
    [selectAgent]
  )

  const selectTerminal = useCallback(
    (blockId: string, shouldFocus: boolean) => {
      setSelectedAgentId(null)
      setSelectedTerminalGroupId(null)
      selectTerminalBlock(blockId, false)
      if (shouldFocus && !isTerminalGroupSelectionMode) {
        focusSelectedWorkbenchNode(blockId)
      }
    },
    [
      focusSelectedWorkbenchNode,
      isTerminalGroupSelectionMode,
      selectTerminalBlock,
      setSelectedAgentId,
      setSelectedTerminalGroupId
    ]
  )
  const selectTerminalFromTitle = useCallback(
    (blockId: string) => selectTerminal(blockId, true),
    [selectTerminal]
  )

  const selectWorkbenchNodeFromShortcut = useCallback(
    (node: WorkbenchFlowNode) => {
      if (node.type === 'terminal') {
        selectTerminal(node.id, false)
        return
      }

      if (node.type === 'terminalGroup') {
        setSelectedAgentId(null)
        selectTerminalGroup(node.id)
        return
      }

      const agentId = readAgentIdFromFlowNodeId(node.id)
      if (agentId) {
        selectAgent(agentId, false)
      }
    },
    [selectAgent, selectTerminal, selectTerminalGroup, setSelectedAgentId]
  )

  const clearWorkbenchSelection = useCallback(() => {
    const anchorNodeId = resolveWorkbenchSelectionAnchorNodeId({
      isTerminalGroupSelectionMode,
      selectedAgentId,
      selectedTerminalBlockIds,
      selectedTerminalGroupId
    })
    setSelectedAgentId(null)
    setSelectedTerminalBlockIds([])
    setSelectedTerminalGroupId(null)
    returnToGlobalCanvasView(anchorNodeId)
  }, [
    isTerminalGroupSelectionMode,
    returnToGlobalCanvasView,
    selectedAgentId,
    selectedTerminalBlockIds,
    selectedTerminalGroupId,
    setSelectedAgentId,
    setSelectedTerminalBlockIds,
    setSelectedTerminalGroupId
  ])

  return {
    clearWorkbenchSelection,
    onNodesChange,
    selectAgentFromTitle,
    selectTerminalFromTitle,
    selectWorkbenchNodeFromShortcut,
    selectWorkbenchNode
  }
}

function resolveWorkbenchSelectionAnchorNodeId({
  isTerminalGroupSelectionMode,
  selectedAgentId,
  selectedTerminalBlockIds,
  selectedTerminalGroupId
}: {
  readonly isTerminalGroupSelectionMode: boolean
  readonly selectedAgentId: string | null
  readonly selectedTerminalBlockIds: readonly string[]
  readonly selectedTerminalGroupId: string | null
}): string | null {
  if (isTerminalGroupSelectionMode || selectedTerminalBlockIds.length > 1) return null
  if (selectedAgentId) return toAgentFlowNodeId(selectedAgentId)
  return selectedTerminalGroupId ?? selectedTerminalBlockIds[0] ?? null
}

function isWorkbenchNodeTitleClick(event: MouseEvent): boolean {
  const target = event.target

  return (
    target instanceof Element &&
    Boolean(target.closest('[data-workbench-node-title="true"]')) &&
    !target.closest('button, input, form, [role="menu"]')
  )
}
