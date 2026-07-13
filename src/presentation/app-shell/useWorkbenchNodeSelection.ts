import type { NodeChange } from '@xyflow/react'
import { useCallback, type Dispatch, type MouseEvent, type SetStateAction } from 'react'

import { readAgentIdFromFlowNodeId } from './agentConsoleFlowNode'
import { applyWorkbenchNodeChanges } from './applyWorkbenchNodeChanges'
import type { WorkbenchFlowNode } from './types'

export function useWorkbenchNodeSelection({
  isTerminalGroupSelectionMode,
  selectTerminalBlock,
  selectTerminalGroup,
  setNodes,
  setSelectedAgentId,
  setSelectedTerminalBlockIds,
  setSelectedTerminalGroupId
}: {
  readonly isTerminalGroupSelectionMode: boolean
  readonly selectTerminalBlock: (blockId: string, additive: boolean) => void
  readonly selectTerminalGroup: (groupId: string) => void
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
    },
    [selectTerminalGroup, setSelectedAgentId]
  )

  const selectAgentFromTitle = useCallback(
    (agentId: string) => {
      setSelectedAgentId(agentId)
      setSelectedTerminalBlockIds([])
      setSelectedTerminalGroupId(null)
    },
    [setSelectedAgentId, setSelectedTerminalBlockIds, setSelectedTerminalGroupId]
  )

  const selectTerminalFromTitle = useCallback(
    (blockId: string, additive: boolean) => {
      setSelectedAgentId(null)
      setSelectedTerminalGroupId(null)
      selectTerminalBlock(blockId, additive)
    },
    [selectTerminalBlock, setSelectedAgentId, setSelectedTerminalGroupId]
  )

  const clearWorkbenchSelection = useCallback(() => {
    setSelectedAgentId(null)
    setSelectedTerminalBlockIds([])
    setSelectedTerminalGroupId(null)
  }, [setSelectedAgentId, setSelectedTerminalBlockIds, setSelectedTerminalGroupId])

  return {
    clearWorkbenchSelection,
    onNodesChange,
    selectAgentFromTitle,
    selectTerminalFromTitle,
    selectWorkbenchNode
  }
}

function isWorkbenchNodeTitleClick(event: MouseEvent): boolean {
  const target = event.target

  return (
    target instanceof Element &&
    Boolean(target.closest('[data-workbench-node-title="true"]')) &&
    !target.closest('button, input, form, [role="menu"]')
  )
}
