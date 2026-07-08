import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useCallback, type MutableRefObject, type SetStateAction } from 'react'

import type {
  TerminalBlockSnapshot,
  TerminalGroupSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { focusTerminalBlockInCanvas } from './focusTerminalBlockInCanvas'
import type { WorkbenchFlowNode } from './types'

interface UseMinimapNodeFocusInput {
  readonly terminalBlocksById: ReadonlyMap<string, TerminalBlockSnapshot>
  readonly terminalGroupsById: ReadonlyMap<string, TerminalGroupSnapshot>
  readonly reactFlowInstanceRef: MutableRefObject<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>
  readonly setHoveredTerminalBlockId: (blockId: string | null) => void
  readonly setSelectedTerminalBlockId: (value: SetStateAction<string | null>) => void
  readonly setSelectedTerminalBlockIds: (blockIds: string[]) => void
  readonly setSelectedTerminalGroupId: (groupId: string | null) => void
}

export function useMinimapNodeFocus({
  terminalBlocksById,
  terminalGroupsById,
  reactFlowInstanceRef,
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
      setHoveredTerminalBlockId,
      setSelectedTerminalBlockIds,
      setSelectedTerminalGroupId,
      terminalGroupsById
    ]
  )

  const focusWorkbenchNode = useCallback(
    (nodeId: string) => {
      if (terminalBlocksById.has(nodeId)) {
        focusTerminalBlock(nodeId)
        return
      }

      focusTerminalGroup(nodeId)
    },
    [focusTerminalBlock, focusTerminalGroup, terminalBlocksById]
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
