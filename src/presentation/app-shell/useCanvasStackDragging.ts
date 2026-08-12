import { useEffect, useMemo, useRef } from 'react'

import type { CanvasArrangementSnapshot } from '../../contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'
import type { CanvasArrangementSelectionItem } from './canvasArrangementSelection'
import { resolveCanvasStackDragTarget } from './canvasArrangementStackingProjection'
import type { WorkbenchFlowNode, WorkbenchSnapshot } from './types'
import type { WorkbenchNodeStore } from './workbenchNodeStore'
import { listCanvasArrangementItems } from './canvasArrangementSelection'

export type MoveCanvasStackHandler = (
  stackId: string,
  previousAnchor: { readonly x: number; readonly y: number },
  nextAnchor: { readonly x: number; readonly y: number },
  items: readonly CanvasArrangementSelectionItem[]
) => Promise<boolean> | boolean

interface CanvasStackDragSession {
  readonly activeStartPosition: { readonly x: number; readonly y: number }
  readonly anchor: { readonly x: number; readonly y: number }
  readonly items: readonly CanvasArrangementSelectionItem[]
  readonly nodePositions: ReadonlyMap<string, { readonly x: number; readonly y: number }>
  readonly stackId: string
}

function useCanvasStackDragging({
  arrangement,
  items,
  nodeStore,
  nodes,
  onCancelNodeDrag,
  onMoveCanvasStack,
  onNodeDragStart
}: {
  readonly arrangement: CanvasArrangementSnapshot
  readonly items: readonly CanvasArrangementSelectionItem[]
  readonly nodeStore: WorkbenchNodeStore
  readonly nodes: readonly WorkbenchFlowNode[]
  readonly onCancelNodeDrag?: (nodeId: string) => void
  readonly onMoveCanvasStack?: MoveCanvasStackHandler
  readonly onNodeDragStart: (
    event: globalThis.MouseEvent | TouchEvent,
    node: WorkbenchFlowNode,
    protectedNodeIds?: readonly string[]
  ) => void
}) {
  const sessionRef = useRef<CanvasStackDragSession | null>(null)

  useEffect(() => {
    sessionRef.current = null
  }, [arrangement.projectId, arrangement.workspaceId])

  function begin(event: globalThis.MouseEvent | TouchEvent, node: WorkbenchFlowNode): void {
    const target = onMoveCanvasStack
      ? resolveCanvasStackDragTarget({ arrangement, items, nodeId: node.id, nodes })
      : null
    sessionRef.current = target
      ? {
          activeStartPosition: { ...node.position },
          anchor: target.anchor,
          items: target.items,
          nodePositions: new Map(
            nodes
              .filter((candidate) => target.nodeIds.includes(candidate.id))
              .map((candidate) => [candidate.id, { ...candidate.position }])
          ),
          stackId: target.stackId
        }
      : null
    onNodeDragStart(event, node, target?.nodeIds)
  }

  function preview(node: WorkbenchFlowNode): boolean {
    const session = sessionRef.current
    if (!session) return false
    const delta = {
      x: node.position.x - session.activeStartPosition.x,
      y: node.position.y - session.activeStartPosition.y
    }
    nodeStore.setNodes((currentNodes) =>
      currentNodes.map((candidate) => {
        const start = session.nodePositions.get(candidate.id)
        return start
          ? { ...candidate, position: { x: start.x + delta.x, y: start.y + delta.y } }
          : candidate
      })
    )
    return true
  }

  function commit(node: WorkbenchFlowNode): boolean {
    const session = sessionRef.current
    sessionRef.current = null
    if (!session || !onMoveCanvasStack) return false

    onCancelNodeDrag?.(node.id)
    const nextAnchor = {
      x: session.anchor.x + node.position.x - session.activeStartPosition.x,
      y: session.anchor.y + node.position.y - session.activeStartPosition.y
    }
    const restorePreview = (): void => {
      nodeStore.setNodes((currentNodes) =>
        currentNodes.map((candidate) => {
          const position = session.nodePositions.get(candidate.id)
          return position ? { ...candidate, position } : candidate
        })
      )
    }
    void Promise.resolve(
      onMoveCanvasStack(session.stackId, session.anchor, nextAnchor, session.items)
    ).then((didMove) => {
      if (!didMove) restorePreview()
    }, restorePreview)
    return true
  }

  return { begin, commit, preview }
}

export function useWorkbenchCanvasArrangement({
  currentWorkbench,
  currentWorkspace,
  nodeStore,
  nodes,
  onCancelNodeDrag,
  onMoveCanvasStack,
  onNodeDragStart
}: {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: WorkbenchSnapshot['project']['workspaces'][number] | undefined
  readonly nodeStore: WorkbenchNodeStore
  readonly nodes: readonly WorkbenchFlowNode[]
  readonly onCancelNodeDrag?: (nodeId: string) => void
  readonly onMoveCanvasStack?: MoveCanvasStackHandler
  readonly onNodeDragStart: (
    event: globalThis.MouseEvent | TouchEvent,
    node: WorkbenchFlowNode,
    protectedNodeIds?: readonly string[]
  ) => void
}) {
  const arrangement = useMemo(
    () =>
      currentWorkbench?.canvasArrangement ?? {
        projectId: currentWorkbench?.project.id ?? 'unselected-project',
        workspaceId: currentWorkspace?.workspaceId ?? 'unselected-workspace',
        stacks: []
      },
    [currentWorkbench?.canvasArrangement, currentWorkbench?.project, currentWorkspace?.workspaceId]
  )
  const items = useMemo(
    () => (currentWorkbench ? listCanvasArrangementItems(currentWorkbench.graph, nodes) : []),
    [currentWorkbench, nodes]
  )
  const dragging = useCanvasStackDragging({
    arrangement,
    items,
    nodeStore,
    nodes,
    onCancelNodeDrag,
    onMoveCanvasStack,
    onNodeDragStart
  })

  return { arrangement, dragging }
}
