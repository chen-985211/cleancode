import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useEffect, useRef, type MutableRefObject } from 'react'

import {
  createCanvasObjectIdentity,
  createCanvasObjectIdentityKey,
  type CanvasObjectIdentity
} from '../../shared-kernel/domain/value-objects/CanvasObjectIdentity'
import { toAgentFlowNodeId } from './projections/agentConsoleFlowNode'
import type { AgentActivityNavigationRequest } from './agentActivityNavigation'
import type { WorkbenchFlowNode } from './types/workbenchFlowNode'
import type { WorkbenchSnapshot } from './types/workbenchSnapshot'
import type { WorkspaceSelectionResult } from './useBranchWorkspaceActions'
import { resolveVisibleTerminalCanvasTarget } from '../../contexts/block-graph/presentation/view-models/visibleTerminalCanvasTarget'
import type { WorkbenchNodeStore } from './workbenchNodeStore'

interface UseAgentActivityNotificationNavigationInput {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly focusWorkbenchNode: (nodeId: string) => void
  readonly nodeStore: Pick<WorkbenchNodeStore, 'getNodes' | 'subscribe'>
  readonly onHandled: (requestId: number) => void
  readonly reactFlowInstanceRef: MutableRefObject<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>
  readonly request: AgentActivityNavigationRequest | null
  readonly selectWorkspace: (
    workbench: WorkbenchSnapshot,
    workspaceId: string
  ) => Promise<WorkspaceSelectionResult>
  readonly workbenches: readonly WorkbenchSnapshot[]
}

export function useAgentActivityNotificationNavigation({
  currentWorkbench,
  focusWorkbenchNode,
  nodeStore,
  onHandled,
  reactFlowInstanceRef,
  request,
  selectWorkspace,
  workbenches
}: UseAgentActivityNotificationNavigationInput): void {
  const attemptedSwitchRequestIdRef = useRef<number | null>(null)
  const handledThroughRequestIdRef = useRef(-1)
  const latestRequestIdRef = useRef<number | null>(request?.requestId ?? null)
  const selectedRequestIdRef = useRef<number | null>(null)
  latestRequestIdRef.current = request?.requestId ?? null

  useEffect(() => {
    if (!request || request.requestId <= handledThroughRequestIdRef.current) return

    const finishRequest = (): void => {
      if (request.requestId <= handledThroughRequestIdRef.current) return
      handledThroughRequestIdRef.current = request.requestId
      onHandled(request.requestId)
    }
    const { target } = request
    const isTargetWorkspaceCurrent =
      currentWorkbench?.project.id === target.projectId &&
      currentWorkbench.graph.workspaceId === target.workspaceId

    if (!isTargetWorkspaceCurrent) {
      if (selectedRequestIdRef.current === request.requestId) {
        finishRequest()
        return
      }
      if (attemptedSwitchRequestIdRef.current === request.requestId) return

      const targetWorkbench = workbenches.find(
        (workbench) => workbench.project.id === target.projectId
      )
      const hasTargetWorkspace = targetWorkbench?.project.workspaces.some(
        (workspace) => workspace.workspaceId === target.workspaceId
      )
      if (!targetWorkbench || !hasTargetWorkspace) {
        finishRequest()
        return
      }

      attemptedSwitchRequestIdRef.current = request.requestId
      void selectWorkspace(targetWorkbench, target.workspaceId).then((result) => {
        if (
          latestRequestIdRef.current !== request.requestId ||
          request.requestId <= handledThroughRequestIdRef.current
        ) {
          return
        }
        if (result === 'selected') {
          selectedRequestIdRef.current = request.requestId
          return
        }
        finishRequest()
      })
      return
    }

    if (!currentWorkbench) {
      finishRequest()
      return
    }

    selectedRequestIdRef.current = request.requestId
    const focusTarget = resolveFocusTarget(currentWorkbench, target)
    if (!focusTarget) {
      finishRequest()
      return
    }

    const expectedIdentityKey = createCanvasObjectIdentityKey(focusTarget.identity)
    let animationFrame = 0
    let isCanceled = false
    let isFocusScheduled = false
    const finishFocus = (): void => {
      if (isCanceled || request.requestId <= handledThroughRequestIdRef.current) return

      const reactFlowNode = reactFlowInstanceRef.current?.getNode(focusTarget.nodeId)
      if (
        !reactFlowNode ||
        createCanvasObjectIdentityKey(reactFlowNode.data.identity) !== expectedIdentityKey
      ) {
        animationFrame = window.requestAnimationFrame(finishFocus)
        return
      }

      handledThroughRequestIdRef.current = request.requestId
      focusWorkbenchNode(focusTarget.nodeId)
      onHandled(request.requestId)
    }
    const scheduleFocus = (): void => {
      if (isCanceled || isFocusScheduled) return

      const projectedNode = nodeStore
        .getNodes()
        .find((node) => createCanvasObjectIdentityKey(node.data.identity) === expectedIdentityKey)
      if (!projectedNode) return

      isFocusScheduled = true
      animationFrame = window.requestAnimationFrame(finishFocus)
    }

    const unsubscribe = nodeStore.subscribe(scheduleFocus)
    scheduleFocus()
    return () => {
      isCanceled = true
      unsubscribe()
      window.cancelAnimationFrame(animationFrame)
    }
  }, [
    currentWorkbench,
    focusWorkbenchNode,
    nodeStore,
    onHandled,
    reactFlowInstanceRef,
    request,
    selectWorkspace,
    workbenches
  ])
}

function resolveFocusTarget(
  workbench: WorkbenchSnapshot,
  target: CanvasObjectIdentity
): { readonly identity: CanvasObjectIdentity; readonly nodeId: string } | null {
  if (target.objectKind === 'agent') {
    const agent = workbench.agents?.find(
      (candidate) =>
        candidate.agentId === target.objectId &&
        candidate.projectId === target.projectId &&
        candidate.workspaceId === target.workspaceId
    )
    return agent ? { identity: target, nodeId: toAgentFlowNodeId(agent.agentId) } : null
  }

  if (target.objectKind !== 'terminal') return null
  const visibleTarget = resolveVisibleTerminalCanvasTarget(workbench.graph, target.objectId)
  if (!visibleTarget) return null
  if (visibleTarget.objectKind === 'terminal') {
    return { identity: target, nodeId: visibleTarget.nodeId }
  }

  return {
    identity: createCanvasObjectIdentity({
      objectId: visibleTarget.objectId,
      objectKind: 'terminal-group',
      projectId: target.projectId,
      workspaceId: target.workspaceId
    }),
    nodeId: visibleTarget.nodeId
  }
}
