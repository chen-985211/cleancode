import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useCallback, type MutableRefObject, type SetStateAction } from 'react'

import type {
  TerminalBlockSnapshot,
  TerminalGroupSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { readAgentIdFromFlowNodeId } from './agentConsoleFlowNode'
import { focusTerminalBlockInCanvas } from './focusTerminalBlockInCanvas'
import type { WorkbenchFlowNode } from './types'

interface UseMinimapNodeFocusInput {
  readonly terminalBlocksById: ReadonlyMap<string, TerminalBlockSnapshot>
  readonly terminalGroupsById: ReadonlyMap<string, TerminalGroupSnapshot>
  readonly reactFlowInstanceRef: MutableRefObject<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>
  readonly setSelectedAgentId: (agentId: string | null) => void
  readonly setHoveredTerminalBlockId: (blockId: string | null) => void
  readonly setSelectedTerminalBlockId: (value: SetStateAction<string | null>) => void
  readonly setSelectedTerminalBlockIds: (blockIds: string[]) => void
  readonly setSelectedTerminalGroupId: (groupId: string | null) => void
}

export function useMinimapNodeFocus({
  terminalBlocksById,
  terminalGroupsById,
  reactFlowInstanceRef,
  setSelectedAgentId,
  setHoveredTerminalBlockId,
  setSelectedTerminalBlockId,
  setSelectedTerminalBlockIds,
  setSelectedTerminalGroupId
}: UseMinimapNodeFocusInput) {
  const focusTerminalBlock = useCallback(
    (blockId: string, duration?: number, fallbackBlock?: TerminalBlockSnapshot) => {
      const block =
        terminalBlocksById.get(blockId) ?? (fallbackBlock?.id === blockId ? fallbackBlock : null)

      if (!block) {
        return
      }

      setSelectedAgentId(null)
      focusTerminalBlockInCanvas({
        block,
        duration,
        reactFlowInstance: reactFlowInstanceRef.current,
        setHoveredTerminalBlockId,
        setSelectedTerminalBlockId
      })
      setSelectedTerminalGroupId(null)
    },
    [
      reactFlowInstanceRef,
      setSelectedAgentId,
      setHoveredTerminalBlockId,
      setSelectedTerminalBlockId,
      setSelectedTerminalGroupId,
      terminalBlocksById
    ]
  )

  const focusTerminalGroup = useCallback(
    (groupId: string) => {
      const group = terminalGroupsById.get(groupId)

      if (!group) {
        return
      }

      setSelectedAgentId(null)
      setSelectedTerminalBlockIds([])
      setSelectedTerminalGroupId(group.id)
      setHoveredTerminalBlockId(null)

      const reactFlowInstance = reactFlowInstanceRef.current

      if (!reactFlowInstance) {
        return
      }

      const node = reactFlowInstance.getNode(group.id)
      const measuredWidth = node?.measured?.width ?? resolveDimension(node?.style?.width)
      const measuredHeight = node?.measured?.height ?? resolveDimension(node?.style?.height)
      const position = node?.position ?? group.position
      const nextZoom = Math.max(reactFlowInstance.getZoom(), 0.9)

      void reactFlowInstance.setCenter(
        position.x + (measuredWidth ?? group.size.width) / 2,
        position.y + (measuredHeight ?? group.size.height) / 2,
        {
          zoom: nextZoom,
          duration: 220
        }
      )
    },
    [
      reactFlowInstanceRef,
      setSelectedAgentId,
      setHoveredTerminalBlockId,
      setSelectedTerminalBlockIds,
      setSelectedTerminalGroupId,
      terminalGroupsById
    ]
  )

  const focusAgentConsole = useCallback(
    (nodeId: string) => {
      const agentId = readAgentIdFromFlowNodeId(nodeId)
      if (!agentId) return
      setSelectedAgentId(agentId)
      setSelectedTerminalBlockIds([])
      setSelectedTerminalGroupId(null)
      setHoveredTerminalBlockId(null)

      const reactFlowInstance = reactFlowInstanceRef.current
      const node = reactFlowInstance?.getNode(nodeId)

      if (!reactFlowInstance || !node) {
        return
      }

      const width = node.measured?.width ?? resolveDimension(node.style?.width) ?? 440
      const height = node.measured?.height ?? resolveDimension(node.style?.height) ?? 520
      const nextZoom = Math.max(reactFlowInstance.getZoom(), 0.9)

      void reactFlowInstance.setCenter(node.position.x + width / 2, node.position.y + height / 2, {
        zoom: nextZoom,
        duration: 220
      })
    },
    [
      reactFlowInstanceRef,
      setHoveredTerminalBlockId,
      setSelectedAgentId,
      setSelectedTerminalBlockIds,
      setSelectedTerminalGroupId
    ]
  )

  const focusWorkbenchNode = useCallback(
    (nodeId: string) => {
      if (readAgentIdFromFlowNodeId(nodeId)) {
        focusAgentConsole(nodeId)
        return
      }

      if (terminalBlocksById.has(nodeId)) {
        focusTerminalBlock(nodeId)
        return
      }

      if (terminalGroupsById.has(nodeId)) {
        focusTerminalGroup(nodeId)
      }
    },
    [
      focusAgentConsole,
      focusTerminalBlock,
      focusTerminalGroup,
      terminalBlocksById,
      terminalGroupsById
    ]
  )

  return {
    focusTerminalBlock,
    focusWorkbenchNode
  }
}

function resolveDimension(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsedValue = Number.parseFloat(value)

    return Number.isFinite(parsedValue) ? parsedValue : null
  }

  return null
}
