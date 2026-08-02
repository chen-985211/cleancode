import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useCallback, useEffect, useRef, type MutableRefObject, type SetStateAction } from 'react'

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
import {
  resolveWorkbenchNodeFocusZoom,
  resolveWorkbenchNodeSize,
  type WorkbenchNodeFocusSize
} from './workbenchNodeFocusViewport'
import { prefersReducedMotion } from './workbenchFocusTransition'

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

interface RevealTerminalBlockOptions {
  readonly activateTerminalInput: boolean
  readonly duration?: number
  readonly fallbackBlock?: TerminalBlockSnapshot
  readonly interpolate?: 'smooth' | 'linear'
  readonly targetZoom?: number
  readonly viewportIntent?: 'creation' | 'navigation'
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
  const cancelPendingWorkbenchInputFocusRef = useRef<(() => void) | null>(null)
  const cancelPendingWorkbenchInputFocus = useCallback(() => {
    cancelPendingWorkbenchInputFocusRef.current?.()
    cancelPendingWorkbenchInputFocusRef.current = null
  }, [])

  useEffect(() => () => cancelPendingWorkbenchInputFocus(), [cancelPendingWorkbenchInputFocus])
  useEffect(() => {
    const cancelAfterExternalPointer = (): void => cancelPendingWorkbenchInputFocus()
    const cancelAfterExternalFocus = (event: FocusEvent): void => {
      const target = event.target

      if (target instanceof Element && target.classList.contains('xterm-helper-textarea')) {
        return
      }
      cancelPendingWorkbenchInputFocus()
    }

    document.addEventListener('focusin', cancelAfterExternalFocus, true)
    document.addEventListener('pointerdown', cancelAfterExternalPointer, true)
    return () => {
      document.removeEventListener('focusin', cancelAfterExternalFocus, true)
      document.removeEventListener('pointerdown', cancelAfterExternalPointer, true)
    }
  }, [cancelPendingWorkbenchInputFocus])

  const revealTerminalBlock = useCallback(
    (blockId: string, options: RevealTerminalBlockOptions) => {
      const block =
        terminalBlocksById.get(blockId) ??
        (options.fallbackBlock?.id === blockId ? options.fallbackBlock : null)

      if (!block) {
        return
      }

      cancelPendingWorkbenchInputFocus()
      setSelectedAgentId(null)
      cancelPendingWorkbenchInputFocusRef.current = focusTerminalBlockInCanvas({
        block,
        activateTerminalInput: options.activateTerminalInput,
        duration: options.duration,
        interpolate: options.interpolate,
        targetZoom: options.targetZoom,
        viewportIntent: options.viewportIntent,
        reactFlowInstance: reactFlowInstanceRef.current,
        setHoveredTerminalBlockId,
        setSelectedTerminalBlockId
      })
      setSelectedTerminalGroupId(null)
    },
    [
      reactFlowInstanceRef,
      cancelPendingWorkbenchInputFocus,
      setSelectedAgentId,
      setHoveredTerminalBlockId,
      setSelectedTerminalBlockId,
      setSelectedTerminalGroupId,
      terminalBlocksById
    ]
  )

  const focusTerminalBlock = useCallback(
    (
      blockId: string,
      duration?: number,
      fallbackBlock?: TerminalBlockSnapshot,
      interpolate?: 'smooth' | 'linear',
      targetZoom?: number
    ) =>
      revealTerminalBlock(blockId, {
        activateTerminalInput: true,
        duration,
        fallbackBlock,
        interpolate,
        targetZoom
      }),
    [revealTerminalBlock]
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
      const nodeSize = node ? resolveWorkbenchNodeSize(node) : group.size
      const position = node?.position ?? group.position
      const nextZoom = resolveMinimapTargetZoom(reactFlowInstance, nodeSize)
      const targetCenter = {
        x: position.x + nodeSize.width / 2,
        y: position.y + nodeSize.height / 2
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

  const focusCreatedTerminalBlock = useCallback(
    (block: TerminalBlockSnapshot, duration = 220) =>
      revealTerminalBlock(block.id, {
        activateTerminalInput: true,
        duration,
        fallbackBlock: block,
        viewportIntent: 'creation'
      }),
    [revealTerminalBlock]
  )

  const focusAgentConsole = useCallback(
    (agent: WorkspaceAgentSnapshot) => {
      cancelPendingWorkbenchInputFocus()
      cancelPendingWorkbenchInputFocusRef.current = focusAgentConsoleInCanvas({
        activateAgentInput: true,
        agent,
        reactFlowInstance: reactFlowInstanceRef.current,
        viewportIntent: 'creation',
        setSelectedAgentId,
        setSelectedTerminalBlockIds,
        setSelectedTerminalGroupId,
        setHoveredTerminalBlockId
      })
    },
    [
      cancelPendingWorkbenchInputFocus,
      reactFlowInstanceRef,
      setHoveredTerminalBlockId,
      setSelectedAgentId,
      setSelectedTerminalBlockIds,
      setSelectedTerminalGroupId
    ]
  )

  const focusWorkbenchNode = useCallback(
    (nodeId: string) => {
      cancelPendingWorkbenchInputFocus()

      if (readAgentIdFromFlowNodeId(nodeId)) {
        const reactFlowInstance = reactFlowInstanceRef.current
        const node = reactFlowInstance?.getNode(nodeId)

        if (!reactFlowInstance || node?.type !== 'agentConsole') {
          return
        }

        cancelPendingWorkbenchInputFocusRef.current = focusAgentConsoleInCanvas({
          activateAgentInput: true,
          agent: node.data.agent,
          interpolate: 'linear',
          reactFlowInstance,
          targetZoom: resolveMinimapTargetZoom(reactFlowInstance, resolveWorkbenchNodeSize(node)),
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
        let targetZoom: number | undefined

        if (block && reactFlowInstance) {
          const node = reactFlowInstance.getNode(nodeId)
          const nodeSize = node ? resolveWorkbenchNodeSize(node) : block.size
          const position = node?.position ?? block.position
          const targetCenter = {
            x: position.x + nodeSize.width / 2,
            y: position.y + nodeSize.height / 2
          }
          targetZoom = resolveMinimapTargetZoom(reactFlowInstance, nodeSize)

          duration = resolveFocusDuration(reactFlowInstance, targetCenter, targetZoom)
        }

        revealTerminalBlock(nodeId, {
          activateTerminalInput: true,
          duration,
          interpolate: 'linear',
          targetZoom
        })
        return
      }

      if (terminalGroupsById.has(nodeId)) {
        focusTerminalGroup(nodeId)
      }
    },
    [
      cancelPendingWorkbenchInputFocus,
      focusTerminalGroup,
      reactFlowInstanceRef,
      setHoveredTerminalBlockId,
      setSelectedAgentId,
      setSelectedTerminalBlockIds,
      setSelectedTerminalGroupId,
      terminalBlocksById,
      terminalGroupsById,
      revealTerminalBlock
    ]
  )

  return {
    cancelPendingWorkbenchInputFocus,
    focusAgentConsole,
    focusCreatedTerminalBlock,
    focusTerminalBlock,
    focusWorkbenchNode
  }
}

function resolveFocusDuration(
  reactFlowInstance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
  targetCenter: { readonly x: number; readonly y: number },
  targetZoom: number
): number {
  if (prefersReducedMotion()) {
    return 0
  }

  return resolveMinimapFocusDuration({
    currentViewport: reactFlowInstance.getViewport(),
    canvasSize: readMinimapFocusCanvasSize(),
    targetCenter,
    targetZoom
  })
}

function resolveMinimapTargetZoom(
  reactFlowInstance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
  nodeSize: WorkbenchNodeFocusSize
): number {
  return resolveWorkbenchNodeFocusZoom({
    canvasSize: readMinimapFocusCanvasSize(),
    currentZoom: reactFlowInstance.getZoom(),
    nodeSize
  })
}
