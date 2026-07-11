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
      if (node.type === 'agentConsole') {
        setSelectedAgentId(node.data.agent.agentId)
        setSelectedTerminalBlockIds([])
        setSelectedTerminalGroupId(null)
        return
      }

      setSelectedAgentId(null)

      if (node.type === 'terminal') {
        selectTerminalBlock(node.id, event.shiftKey)
        return
      }

      selectTerminalGroup(node.id)
    },
    [
      selectTerminalBlock,
      selectTerminalGroup,
      setSelectedAgentId,
      setSelectedTerminalBlockIds,
      setSelectedTerminalGroupId
    ]
  )

  return { onNodesChange, selectWorkbenchNode }
}
