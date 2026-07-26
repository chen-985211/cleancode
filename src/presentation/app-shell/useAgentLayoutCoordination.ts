import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'

import type { AgentGraphUpdatedEvent } from '../../contexts/agent/application/dto/AgentSessionProtocol'
import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import { resolveNodeSize } from './resolveNodeSize'
import { resolveWorkbenchLayoutFocusRequest } from './resolveWorkbenchLayoutFocusRequest'
import type { TerminalGroupFlowNode, WorkbenchFlowNode, WorkbenchSnapshot } from './types'
import {
  useWorkbenchLayoutFocus,
  type WorkbenchLayoutFocusRequest
} from './useWorkbenchLayoutFocus'
import type { WorkbenchNodeStore } from './workbenchNodeStore'
import { restoreWorkbenchNodeLayout } from './restoreWorkbenchNodeLayout'

interface UseAgentLayoutCoordinationInput {
  readonly clearTerminalGroupDropPreview: () => void
  readonly currentProjectId: string | null
  readonly currentWorkspaceId: string | null
  readonly moveWorkbenchNode: (
    event: globalThis.MouseEvent | TouchEvent,
    node: WorkbenchFlowNode
  ) => Promise<void>
  readonly moveWorkspaceAgent: (
    agent: WorkspaceAgentSnapshot,
    position: { readonly x: number; readonly y: number },
    size: { readonly width: number; readonly height: number }
  ) => Promise<void>
  readonly nodeStore: WorkbenchNodeStore
  readonly reactFlowInstanceRef: MutableRefObject<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>
  readonly setCurrentGraph: (graph: WorkbenchSnapshot['graph']) => void
}

export function useAgentLayoutCoordination({
  clearTerminalGroupDropPreview,
  currentProjectId,
  currentWorkspaceId,
  moveWorkbenchNode,
  moveWorkspaceAgent,
  nodeStore,
  reactFlowInstanceRef,
  setCurrentGraph
}: UseAgentLayoutCoordinationInput) {
  const [protectedLayoutNodeIds, setProtectedLayoutNodeIds] = useState<ReadonlySet<string>>(
    () => new Set()
  )
  const [layoutFocusRequest, setLayoutFocusRequest] = useState<WorkbenchLayoutFocusRequest | null>(
    null
  )
  const dragProtectionByNodeIdRef = useRef(new Map<string, readonly string[]>())

  const onAgentGraphUpdated = useCallback(
    (event: AgentGraphUpdatedEvent): void => {
      setCurrentGraph(event.graph)
      const request = resolveWorkbenchLayoutFocusRequest({
        agentId: event.agentId,
        change: event.change,
        graph: event.graph
      })

      if (request) setLayoutFocusRequest(request)
    },
    [setCurrentGraph]
  )
  const handleLayoutFocusHandled = useCallback((operationId: string): void => {
    setLayoutFocusRequest((currentRequest) =>
      currentRequest?.operationId === operationId ? null : currentRequest
    )
  }, [])
  const updateDragProtection = useCallback((nodeId: string, nodeIds: readonly string[] | null) => {
    if (nodeIds) dragProtectionByNodeIdRef.current.set(nodeId, nodeIds)
    else dragProtectionByNodeIdRef.current.delete(nodeId)
    setProtectedLayoutNodeIds(
      new Set([...dragProtectionByNodeIdRef.current.values()].flatMap((ids) => [...ids]))
    )
  }, [])
  const onNodeDragStart = useCallback(
    (_event: globalThis.MouseEvent | TouchEvent, node: WorkbenchFlowNode): void => {
      clearTerminalGroupDropPreview()
      updateDragProtection(node.id, resolveDragProtectedNodeIds(node, nodeStore.getNodes()))
    },
    [clearTerminalGroupDropPreview, nodeStore, updateDragProtection]
  )
  const onNodeDragStop = useCallback(
    async (event: globalThis.MouseEvent | TouchEvent, node: WorkbenchFlowNode): Promise<void> => {
      try {
        if (node.type !== 'agentConsole') {
          await moveWorkbenchNode(event, node)
          return
        }

        const width = resolveNodeSize(node.style?.width, node.data.agent.layout.size.width)
        const height = resolveNodeSize(node.style?.height, node.data.agent.layout.size.height)
        try {
          await moveWorkspaceAgent(node.data.agent, node.position, { width, height })
        } catch (error) {
          nodeStore.setNodes((nodes) => restoreWorkbenchNodeLayout(nodes, null, node))
          throw error
        }
      } finally {
        updateDragProtection(node.id, null)
      }
    },
    [moveWorkbenchNode, moveWorkspaceAgent, nodeStore, updateDragProtection]
  )

  useEffect(() => {
    dragProtectionByNodeIdRef.current.clear()
    setLayoutFocusRequest(null)
    setProtectedLayoutNodeIds(new Set())
  }, [currentProjectId, currentWorkspaceId])

  useWorkbenchLayoutFocus({
    nodeStore,
    onHandled: handleLayoutFocusHandled,
    protectedNodeIds: protectedLayoutNodeIds,
    reactFlowInstanceRef,
    request: layoutFocusRequest
  })

  return {
    onAgentGraphUpdated,
    onNodeDragStart,
    onNodeDragStop,
    protectedLayoutNodeIds
  }
}

function resolveDragProtectedNodeIds(
  node: WorkbenchFlowNode,
  nodes: readonly WorkbenchFlowNode[]
): string[] {
  const groupNode =
    node.type === 'terminalGroup'
      ? node
      : node.type === 'terminal'
        ? nodes.find(
            (candidate): candidate is TerminalGroupFlowNode =>
              candidate.type === 'terminalGroup' &&
              candidate.data.group.memberBlockIds.includes(node.id)
          )
        : undefined

  return groupNode
    ? [...new Set([groupNode.id, ...groupNode.data.group.memberBlockIds])]
    : [node.id]
}
