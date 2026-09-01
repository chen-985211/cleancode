import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'

import type { AgentGraphUpdatedEvent } from '../../../contexts/agent/application/dto/AgentSessionProtocol'
import type { WorkspaceAgentSnapshot } from '../../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import { resolveNodeSize } from '../workbench/nodes/resolveNodeSize'
import { toAgentFlowNodeId } from '../projections/agentConsoleFlowNode'
import { resolveWorkbenchLayoutFocusRequest } from '../workbench/viewport/resolveWorkbenchLayoutFocusRequest'
import type { TerminalGroupFlowNode } from '../types/terminalGroupFlowNode'
import type { WorkbenchFlowNode } from '../types/workbenchFlowNode'
import type { WorkbenchSnapshot } from '../types/workbenchSnapshot'
import {
  useWorkbenchLayoutFocus,
  type WorkbenchLayoutFocusRequest
} from '../workbench/viewport/useWorkbenchLayoutFocus'
import type { WorkbenchNodeStore } from '../workbench/nodes/workbenchNodeStore'
import { restoreWorkbenchNodeLayout } from '../workbench/nodes/restoreWorkbenchNodeLayout'
import { useTerminalWorkflowBuildChoreography } from './useTerminalWorkflowBuildChoreography'
import {
  defaultTerminalWorkflowBuildMode,
  type TerminalWorkflowBuildMode
} from '../app-features/settings/terminalWorkflowBuildPreference'

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
  readonly onCancelLayoutFocus?: () => void
  readonly reactFlowInstanceRef: MutableRefObject<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>
  readonly setCurrentGraph: (graph: WorkbenchSnapshot['graph']) => void
  readonly terminalWorkflowBuildMode?: TerminalWorkflowBuildMode
}

export function useAgentLayoutCoordination({
  clearTerminalGroupDropPreview,
  currentProjectId,
  currentWorkspaceId,
  moveWorkbenchNode,
  moveWorkspaceAgent,
  nodeStore,
  onCancelLayoutFocus,
  reactFlowInstanceRef,
  setCurrentGraph,
  terminalWorkflowBuildMode = defaultTerminalWorkflowBuildMode
}: UseAgentLayoutCoordinationInput) {
  const [protectedLayoutNodeIds, setProtectedLayoutNodeIds] = useState<ReadonlySet<string>>(
    () => new Set()
  )
  const [layoutFocusRequest, setLayoutFocusRequest] = useState<WorkbenchLayoutFocusRequest | null>(
    null
  )
  const dragProtectionByNodeIdRef = useRef(new Map<string, readonly string[]>())
  const terminalWorkflowBuild = useTerminalWorkflowBuildChoreography({
    currentProjectId,
    currentWorkspaceId,
    nodeStore,
    terminalWorkflowBuildMode
  })

  const onAgentGraphUpdated = useCallback(
    (event: AgentGraphUpdatedEvent): void => {
      const originAgentNodeId = toAgentFlowNodeId(event.agentId)
      terminalWorkflowBuild.begin(event, originAgentNodeId)
      setCurrentGraph(event.graph)
      const request = resolveWorkbenchLayoutFocusRequest({
        change: event.change,
        graph: event.graph,
        originAgentNodeId
      })

      if (request) setLayoutFocusRequest(request)
      else terminalWorkflowBuild.start(event.change?.operationId)
    },
    [setCurrentGraph, terminalWorkflowBuild.begin, terminalWorkflowBuild.start]
  )
  const handleLayoutFocusHandled = useCallback(
    (operationId: string): void => {
      terminalWorkflowBuild.start(operationId)
      setLayoutFocusRequest((currentRequest) =>
        currentRequest?.operationId === operationId ? null : currentRequest
      )
    },
    [terminalWorkflowBuild.start]
  )
  const updateDragProtection = useCallback((nodeId: string, nodeIds: readonly string[] | null) => {
    if (nodeIds) dragProtectionByNodeIdRef.current.set(nodeId, nodeIds)
    else dragProtectionByNodeIdRef.current.delete(nodeId)
    setProtectedLayoutNodeIds(
      new Set([...dragProtectionByNodeIdRef.current.values()].flatMap((ids) => [...ids]))
    )
  }, [])
  const onNodeDragStart = useCallback(
    (
      _event: globalThis.MouseEvent | TouchEvent,
      node: WorkbenchFlowNode,
      protectedNodeIds?: readonly string[]
    ): void => {
      clearTerminalGroupDropPreview()
      const resolvedNodeIds =
        protectedNodeIds ?? resolveDragProtectedNodeIds(node, nodeStore.getNodes())
      terminalWorkflowBuild.interruptNodes(resolvedNodeIds)
      updateDragProtection(node.id, resolvedNodeIds)
    },
    [
      clearTerminalGroupDropPreview,
      nodeStore,
      terminalWorkflowBuild.interruptNodes,
      updateDragProtection
    ]
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
  const cancelNodeDrag = useCallback(
    (nodeId: string): void => {
      clearTerminalGroupDropPreview()
      updateDragProtection(nodeId, null)
    },
    [clearTerminalGroupDropPreview, updateDragProtection]
  )
  const cancelLayoutFocus = useCallback((): void => {
    terminalWorkflowBuild.start(layoutFocusRequest?.operationId)
    setLayoutFocusRequest(null)
    onCancelLayoutFocus?.()
  }, [layoutFocusRequest?.operationId, onCancelLayoutFocus, terminalWorkflowBuild.start])

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
    cancelNodeDrag,
    cancelLayoutFocus,
    onAgentGraphUpdated,
    onNodeDragStart,
    onNodeDragStop,
    protectedLayoutNodeIds,
    terminalWorkflowBuildPresentation: terminalWorkflowBuild.presentation
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
