import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useEffect, useRef, type MutableRefObject } from 'react'

import type { WorkbenchFlowNode } from './types'
import type { WorkbenchNodeStore } from './workbenchNodeStore'

export interface WorkbenchLayoutFocusRequest {
  readonly operationId: string
  readonly affectedNodeIds: readonly string[]
  readonly expectedNodeLayouts: readonly WorkbenchExpectedNodeLayout[]
  readonly focusNodeIds: readonly string[]
}

interface WorkbenchExpectedNodeLayout {
  readonly nodeId: string
  readonly position: { readonly x: number; readonly y: number }
  readonly size: { readonly height: number; readonly width: number }
}

interface UseWorkbenchLayoutFocusInput {
  readonly nodeStore: Pick<WorkbenchNodeStore, 'getNodes' | 'subscribe'>
  readonly onHandled: (operationId: string) => void
  readonly protectedNodeIds: ReadonlySet<string>
  readonly reactFlowInstanceRef: MutableRefObject<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>
  readonly request: WorkbenchLayoutFocusRequest | null
}

export function useWorkbenchLayoutFocus({
  nodeStore,
  onHandled,
  protectedNodeIds,
  reactFlowInstanceRef,
  request
}: UseWorkbenchLayoutFocusInput): void {
  const handledOperationIdsRef = useRef(new Set<string>())
  const deferredOperationIdsRef = useRef(new Set<string>())
  const activeOperationIdRef = useRef<string | null>(null)

  useEffect(() => {
    const operationId = request?.operationId ?? null
    if (activeOperationIdRef.current !== operationId) {
      if (activeOperationIdRef.current) {
        deferredOperationIdsRef.current.delete(activeOperationIdRef.current)
      }
      activeOperationIdRef.current = operationId
    }

    if (!request || handledOperationIdsRef.current.has(request.operationId)) {
      return
    }

    const isProtected = [...request.affectedNodeIds, ...request.focusNodeIds].some((nodeId) =>
      protectedNodeIds.has(nodeId)
    )

    if (isProtected) {
      deferredOperationIdsRef.current.add(request.operationId)
      return
    }

    let animationFrame = 0
    let isCanceled = false
    let isFocusScheduled = false
    const focusWhenProjected = (): void => {
      if (isCanceled || handledOperationIdsRef.current.has(request.operationId)) return

      const reactFlowInstance = reactFlowInstanceRef.current
      const focusNodes = request.focusNodeIds.map((nodeId) => reactFlowInstance?.getNode(nodeId))

      if (!reactFlowInstance || focusNodes.some((node) => !node)) {
        animationFrame = window.requestAnimationFrame(focusWhenProjected)
        return
      }

      handledOperationIdsRef.current.add(request.operationId)
      deferredOperationIdsRef.current.delete(request.operationId)
      void reactFlowInstance.fitView({
        duration: 220,
        nodes: focusNodes as WorkbenchFlowNode[],
        padding: 0.24
      })
      onHandled(request.operationId)
    }

    const scheduleFocusWhenProjected = (): void => {
      if (isCanceled || isFocusScheduled) return

      const projectedNodesById = new Map(nodeStore.getNodes().map((node) => [node.id, node]))

      if (
        !request.focusNodeIds.every((nodeId) => projectedNodesById.has(nodeId)) ||
        (!deferredOperationIdsRef.current.has(request.operationId) &&
          !request.expectedNodeLayouts.every((layout) =>
            hasExpectedLayout(projectedNodesById.get(layout.nodeId), layout)
          ))
      ) {
        return
      }

      isFocusScheduled = true
      animationFrame = window.requestAnimationFrame(focusWhenProjected)
    }

    const unsubscribe = nodeStore.subscribe(scheduleFocusWhenProjected)
    scheduleFocusWhenProjected()

    return () => {
      isCanceled = true
      unsubscribe()
      window.cancelAnimationFrame(animationFrame)
    }
  }, [nodeStore, onHandled, protectedNodeIds, reactFlowInstanceRef, request])
}

function hasExpectedLayout(
  node: WorkbenchFlowNode | undefined,
  expected: WorkbenchExpectedNodeLayout
): boolean {
  if (!node || !samePosition(node.position, expected.position)) return false

  const persistedLayout =
    node.type === 'terminal'
      ? node.data?.block
      : node.type === 'terminalGroup'
        ? node.data?.group
        : undefined

  return (
    !persistedLayout ||
    (samePosition(persistedLayout.position, expected.position) &&
      persistedLayout.size.width === expected.size.width &&
      persistedLayout.size.height === expected.size.height)
  )
}

function samePosition(
  left: { readonly x: number; readonly y: number },
  right: { readonly x: number; readonly y: number }
): boolean {
  return left.x === right.x && left.y === right.y
}
