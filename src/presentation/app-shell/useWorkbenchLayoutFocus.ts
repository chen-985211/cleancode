import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useEffect, useRef, type MutableRefObject } from 'react'

import type { WorkbenchFlowNode } from './types/workbenchFlowNode'
import type { WorkbenchNodeStore } from './workbenchNodeStore'
import { transitionWorkbenchViewport } from './workbenchViewportMotion'
import { resolveNodeSize } from './resolveNodeSize'

export interface WorkbenchLayoutFocusRequest {
  readonly operationId: string
  readonly affectedNodeIds: readonly string[]
  readonly expectedNodeLayouts: readonly WorkbenchExpectedNodeLayout[]
  readonly focusNodeIds: readonly string[]
  readonly focusTarget: 'committed-layouts' | 'projected-nodes'
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

const maximumWorkbenchLayoutFocusZoom = 1

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
    let didFinishFocus = false
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
      const resolvedFocusNodes = focusNodes as WorkbenchFlowNode[]
      const committedBounds =
        request.focusTarget === 'committed-layouts'
          ? resolveCommittedFocusBounds(resolvedFocusNodes, request.expectedNodeLayouts)
          : null

      const focusCompletion = committedBounds
        ? transitionWorkbenchViewport(reactFlowInstance, {
            bounds: committedBounds,
            intent: { type: 'spatial' },
            maxZoom: maximumWorkbenchLayoutFocusZoom,
            padding: 0.24,
            type: 'fit-bounds'
          })
        : transitionWorkbenchViewport(reactFlowInstance, {
            intent: { type: 'spatial' },
            maxZoom: maximumWorkbenchLayoutFocusZoom,
            nodes: resolvedFocusNodes,
            padding: 0.24,
            type: 'fit-view'
          })

      void focusCompletion
        .catch(() => false)
        .then(() => {
          if (isCanceled) return
          didFinishFocus = true
          onHandled(request.operationId)
        })
    }

    const scheduleFocusWhenProjected = (): void => {
      if (isCanceled || isFocusScheduled) return

      const projectedNodesById = new Map(nodeStore.getNodes().map((node) => [node.id, node]))

      if (
        !request.focusNodeIds.every((nodeId) => projectedNodesById.has(nodeId)) ||
        (request.focusTarget === 'projected-nodes' &&
          !deferredOperationIdsRef.current.has(request.operationId) &&
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
      if (!didFinishFocus) handledOperationIdsRef.current.delete(request.operationId)
      unsubscribe()
      window.cancelAnimationFrame(animationFrame)
    }
  }, [nodeStore, onHandled, protectedNodeIds, reactFlowInstanceRef, request])
}

function resolveCommittedFocusBounds(
  nodes: readonly WorkbenchFlowNode[],
  expectedNodeLayouts: readonly WorkbenchExpectedNodeLayout[]
): {
  readonly height: number
  readonly width: number
  readonly x: number
  readonly y: number
} | null {
  const expectedLayoutsByNodeId = new Map(
    expectedNodeLayouts.map((layout) => [layout.nodeId, layout] as const)
  )
  const layouts = nodes.flatMap((node) => {
    const expectedLayout = expectedLayoutsByNodeId.get(node.id)
    return expectedLayout ? [expectedLayout] : resolveCurrentNodeLayout(node)
  })
  if (layouts.length === 0) return null

  const left = Math.min(...layouts.map((layout) => layout.position.x))
  const top = Math.min(...layouts.map((layout) => layout.position.y))
  const right = Math.max(...layouts.map((layout) => layout.position.x + layout.size.width))
  const bottom = Math.max(...layouts.map((layout) => layout.position.y + layout.size.height))

  return { height: bottom - top, width: right - left, x: left, y: top }
}

function resolveCurrentNodeLayout(node: WorkbenchFlowNode): WorkbenchExpectedNodeLayout[] {
  const persistedLayout =
    node.type === 'terminal'
      ? node.data.block
      : node.type === 'terminalGroup'
        ? node.data.group
        : node.type === 'agentConsole'
          ? node.data.agent.layout
          : null
  if (!persistedLayout) return []

  return [
    {
      nodeId: node.id,
      position: node.position,
      size: {
        height: resolveNodeSize(node.style?.height, persistedLayout.size.height),
        width: resolveNodeSize(node.style?.width, persistedLayout.size.width)
      }
    }
  ]
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
