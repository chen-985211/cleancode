import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useCallback, type MutableRefObject, type SetStateAction } from 'react'

import type {
  TerminalBlockSnapshot,
  TerminalGroupSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import { readAgentIdFromFlowNodeId } from './agentConsoleFlowNode'
import { focusAgentConsoleInCanvas } from './focusAgentConsoleInCanvas'
import { focusTerminalBlockInCanvas } from './focusTerminalBlockInCanvas'
import { readMinimapFocusCanvasSize, resolveMinimapFocusDuration } from './minimapFocusTransition'
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
    (
      blockId: string,
      duration?: number,
      fallbackBlock?: TerminalBlockSnapshot,
      interpolate?: 'smooth' | 'linear'
    ) => {
      const block =
        terminalBlocksById.get(blockId) ?? (fallbackBlock?.id === blockId ? fallbackBlock : null)

      if (!block) {
        return
      }

      setSelectedAgentId(null)
      focusTerminalBlockInCanvas({
        block,
        duration,
        interpolate,
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
      const targetCenter = {
        x: position.x + (measuredWidth ?? group.size.width) / 2,
        y: position.y + (measuredHeight ?? group.size.height) / 2
      }

      void reactFlowInstance.setCenter(targetCenter.x, targetCenter.y, {
        zoom: nextZoom,
        duration: resolveFocusDuration(reactFlowInstance, targetCenter, nextZoom),
        interpolate: 'linear'
      })
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
    (agent: WorkspaceAgentSnapshot) => {
      focusAgentConsoleInCanvas({
        agent,
        reactFlowInstance: reactFlowInstanceRef.current,
        setSelectedAgentId,
        setSelectedTerminalBlockIds,
        setSelectedTerminalGroupId,
        setHoveredTerminalBlockId
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
        const reactFlowInstance = reactFlowInstanceRef.current
        const node = reactFlowInstance?.getNode(nodeId)

        if (!reactFlowInstance || node?.type !== 'agentConsole') {
          return
        }

        focusAgentConsoleInCanvas({
          agent: node.data.agent,
          interpolate: 'linear',
          reactFlowInstance,
          resolveDuration: ({ targetCenter, targetZoom }) =>
            resolveFocusDuration(reactFlowInstance, targetCenter, targetZoom),
          setSelectedAgentId,
          setSelectedTerminalBlockIds,
          setSelectedTerminalGroupId,
          setHoveredTerminalBlockId
        })
        return
      }

      if (terminalBlocksById.has(nodeId)) {
        const block = terminalBlocksById.get(nodeId)
        const reactFlowInstance = reactFlowInstanceRef.current
        let duration: number | undefined

        if (block && reactFlowInstance) {
          const node = reactFlowInstance.getNode(nodeId)
          const position = node?.position ?? block.position
          const targetCenter = {
            x: position.x + (node?.measured?.width ?? block.size.width) / 2,
            y: position.y + (node?.measured?.height ?? block.size.height) / 2
          }
          const nextZoom = Math.max(reactFlowInstance.getZoom(), 0.9)

          duration = resolveFocusDuration(reactFlowInstance, targetCenter, nextZoom)
        }

        focusTerminalBlock(nodeId, duration, undefined, 'linear')
        return
      }

      if (terminalGroupsById.has(nodeId)) {
        focusTerminalGroup(nodeId)
      }
    },
    [
      focusTerminalBlock,
      focusTerminalGroup,
      reactFlowInstanceRef,
      setHoveredTerminalBlockId,
      setSelectedAgentId,
      setSelectedTerminalBlockIds,
      setSelectedTerminalGroupId,
      terminalBlocksById,
      terminalGroupsById
    ]
  )

  return {
    focusAgentConsole,
    focusTerminalBlock,
    focusWorkbenchNode
  }
}

function resolveFocusDuration(
  reactFlowInstance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
  targetCenter: { readonly x: number; readonly y: number },
  targetZoom: number
): number {
  return resolveMinimapFocusDuration({
    currentViewport: reactFlowInstance.getViewport(),
    canvasSize: readMinimapFocusCanvasSize(),
    targetCenter,
    targetZoom
  })
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
