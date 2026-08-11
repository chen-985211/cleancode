import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useCallback, useEffect, useRef, type MutableRefObject, type SetStateAction } from 'react'

import type {
  TerminalBlockSnapshot,
  TerminalGroupSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import { readAgentIdFromFlowNodeId, toAgentFlowNodeId } from './agentConsoleFlowNode'
import { focusAgentConsoleInCanvas } from './focusAgentConsoleInCanvas'
import { focusTerminalBlockInCanvas } from './focusTerminalBlockInCanvas'
import { readMinimapFocusCanvasSize } from './minimapFocusTransition'
import type { WorkbenchFlowNode } from './types'
import {
  resolveWorkbenchNodeFocusZoom,
  resolveWorkbenchNodeSize,
  type WorkbenchNodeFocusSize
} from './workbenchNodeFocusViewport'
import {
  transitionWorkbenchViewport,
  type WorkbenchViewportMotionIntent
} from './workbenchViewportMotion'
import { isExactWorkbenchNodeInputTarget } from './workbenchNodeInputActivation'

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
  readonly fallbackBlock?: TerminalBlockSnapshot
  readonly motion?: WorkbenchViewportMotionIntent
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
  const pendingWorkbenchInputFocusTargetRef = useRef<WorkbenchFlowNode | null>(null)
  const cancelPendingWorkbenchInputFocus = useCallback(() => {
    cancelPendingWorkbenchInputFocusRef.current?.()
    cancelPendingWorkbenchInputFocusRef.current = null
    pendingWorkbenchInputFocusTargetRef.current = null
  }, [])
  const rememberPendingWorkbenchInputFocus = useCallback(
    (cancel: (() => void) | null, target: WorkbenchFlowNode): void => {
      cancelPendingWorkbenchInputFocusRef.current = cancel
      pendingWorkbenchInputFocusTargetRef.current = cancel ? target : null
    },
    []
  )

  useEffect(() => () => cancelPendingWorkbenchInputFocus(), [cancelPendingWorkbenchInputFocus])
  useEffect(() => {
    const cancelAfterExternalPointer = (): void => cancelPendingWorkbenchInputFocus()
    const cancelAfterExternalFocus = (event: FocusEvent): void => {
      const pendingTarget = pendingWorkbenchInputFocusTargetRef.current

      if (pendingTarget && isExactWorkbenchNodeInputTarget(pendingTarget, event.target)) {
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
      const reactFlowInstance = reactFlowInstanceRef.current
      const focusTarget =
        reactFlowInstance?.getNode(block.id) ??
        ({ id: block.id, position: block.position, type: 'terminal' } as WorkbenchFlowNode)
      const cancel = focusTerminalBlockInCanvas({
        block,
        activateTerminalInput: options.activateTerminalInput,
        motion: options.motion,
        targetZoom: options.targetZoom,
        viewportIntent: options.viewportIntent,
        reactFlowInstance,
        setHoveredTerminalBlockId,
        setSelectedTerminalBlockId
      })
      rememberPendingWorkbenchInputFocus(cancel, focusTarget)
      setSelectedTerminalGroupId(null)
    },
    [
      reactFlowInstanceRef,
      cancelPendingWorkbenchInputFocus,
      rememberPendingWorkbenchInputFocus,
      setSelectedAgentId,
      setHoveredTerminalBlockId,
      setSelectedTerminalBlockId,
      setSelectedTerminalGroupId,
      terminalBlocksById
    ]
  )

  const focusTerminalBlock = useCallback(
    (blockId: string, motion: WorkbenchViewportMotionIntent = { type: 'spatial' }) =>
      revealTerminalBlock(blockId, {
        activateTerminalInput: true,
        motion
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

      void transitionWorkbenchViewport(reactFlowInstance, {
        center: targetCenter,
        intent: {
          canvasSize: readMinimapFocusCanvasSize(),
          type: 'adaptive-focus'
        },
        type: 'center',
        zoom: nextZoom
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
    (block: TerminalBlockSnapshot) =>
      revealTerminalBlock(block.id, {
        activateTerminalInput: true,
        fallbackBlock: block,
        viewportIntent: 'creation'
      }),
    [revealTerminalBlock]
  )

  const focusAgentConsole = useCallback(
    (agent: WorkspaceAgentSnapshot, viewportIntent: 'creation' | 'navigation' = 'creation') => {
      cancelPendingWorkbenchInputFocus()
      const reactFlowInstance = reactFlowInstanceRef.current
      const focusTarget =
        reactFlowInstance?.getNode(toAgentFlowNodeId(agent.agentId)) ??
        ({
          id: toAgentFlowNodeId(agent.agentId),
          position: agent.layout.position,
          type: 'agentConsole'
        } as WorkbenchFlowNode)
      const cancel = focusAgentConsoleInCanvas({
        activateAgentInput: true,
        agent,
        reactFlowInstance,
        viewportIntent,
        setSelectedAgentId,
        setSelectedTerminalBlockIds,
        setSelectedTerminalGroupId,
        setHoveredTerminalBlockId
      })
      rememberPendingWorkbenchInputFocus(cancel, focusTarget)
    },
    [
      cancelPendingWorkbenchInputFocus,
      rememberPendingWorkbenchInputFocus,
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

        const cancel = focusAgentConsoleInCanvas({
          activateAgentInput: true,
          agent: node.data.agent,
          motion: {
            canvasSize: readMinimapFocusCanvasSize(),
            type: 'adaptive-focus'
          },
          reactFlowInstance,
          targetZoom: resolveMinimapTargetZoom(reactFlowInstance, resolveWorkbenchNodeSize(node)),
          setSelectedAgentId,
          setSelectedTerminalBlockIds,
          setSelectedTerminalGroupId,
          setHoveredTerminalBlockId
        })
        rememberPendingWorkbenchInputFocus(cancel, node)
        return
      }

      if (terminalBlocksById.has(nodeId)) {
        const block = terminalBlocksById.get(nodeId)
        const reactFlowInstance = reactFlowInstanceRef.current
        let motion: WorkbenchViewportMotionIntent | undefined
        let targetZoom: number | undefined

        if (block && reactFlowInstance) {
          const node = reactFlowInstance.getNode(nodeId)
          const nodeSize = node ? resolveWorkbenchNodeSize(node) : block.size
          targetZoom = resolveMinimapTargetZoom(reactFlowInstance, nodeSize)
          motion = {
            canvasSize: readMinimapFocusCanvasSize(),
            type: 'adaptive-focus'
          }
        }

        revealTerminalBlock(nodeId, {
          activateTerminalInput: true,
          motion,
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
      rememberPendingWorkbenchInputFocus,
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
