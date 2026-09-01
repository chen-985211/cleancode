import { useEffect, useRef } from 'react'

import type { CanvasArrangementSnapshot } from '../../application/dto/CanvasArrangementSnapshot'
import type { CanvasArrangementSelectionItem } from '../view-models/canvasArrangementSelection'
import {
  resolveCanvasStackDragTarget,
  type CanvasArrangementProjectionNode
} from '../view-models/canvasArrangementStackingProjection'

export type MoveCanvasStackHandler = (
  stackId: string,
  previousAnchor: { readonly x: number; readonly y: number },
  nextAnchor: { readonly x: number; readonly y: number },
  items: readonly CanvasArrangementSelectionItem[]
) => Promise<boolean> | boolean

interface CanvasStackDragNode {
  readonly id: string
  readonly position: { readonly x: number; readonly y: number }
}

interface CanvasStackDragSession {
  readonly activeStartPosition: { readonly x: number; readonly y: number }
  readonly anchor: { readonly x: number; readonly y: number }
  readonly items: readonly CanvasArrangementSelectionItem[]
  readonly nodePositions: ReadonlyMap<string, { readonly x: number; readonly y: number }>
  readonly stackId: string
}

export function useCanvasStackDragging<TNode extends CanvasStackDragNode>({
  arrangement,
  items,
  nodes,
  onCancelNodeDrag,
  onMoveCanvasStack,
  onNodeDragStart,
  projectionNodes,
  setNodePositions
}: {
  readonly arrangement: CanvasArrangementSnapshot
  readonly items: readonly CanvasArrangementSelectionItem[]
  readonly nodes: readonly TNode[]
  readonly onCancelNodeDrag?: (nodeId: string) => void
  readonly onMoveCanvasStack?: MoveCanvasStackHandler
  readonly onNodeDragStart: (
    event: globalThis.MouseEvent | TouchEvent,
    node: TNode,
    protectedNodeIds?: readonly string[]
  ) => void
  readonly projectionNodes: readonly CanvasArrangementProjectionNode[]
  readonly setNodePositions: (
    positions: ReadonlyMap<string, { readonly x: number; readonly y: number }>
  ) => void
}) {
  const sessionRef = useRef<CanvasStackDragSession | null>(null)

  useEffect(() => {
    sessionRef.current = null
  }, [arrangement.projectId, arrangement.workspaceId])

  function begin(event: globalThis.MouseEvent | TouchEvent, node: TNode): void {
    const target = onMoveCanvasStack
      ? resolveCanvasStackDragTarget({
          arrangement,
          items,
          nodeId: node.id,
          nodes: projectionNodes
        })
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

  function preview(node: TNode): boolean {
    const session = sessionRef.current
    if (!session) return false
    const delta = {
      x: node.position.x - session.activeStartPosition.x,
      y: node.position.y - session.activeStartPosition.y
    }
    setNodePositions(
      new Map(
        [...session.nodePositions].map(([nodeId, start]) => [
          nodeId,
          { x: start.x + delta.x, y: start.y + delta.y }
        ])
      )
    )
    return true
  }

  function commit(node: TNode): boolean {
    const session = sessionRef.current
    sessionRef.current = null
    if (!session || !onMoveCanvasStack) return false

    onCancelNodeDrag?.(node.id)
    const nextAnchor = {
      x: session.anchor.x + node.position.x - session.activeStartPosition.x,
      y: session.anchor.y + node.position.y - session.activeStartPosition.y
    }
    const restorePreview = (): void => setNodePositions(session.nodePositions)
    void Promise.resolve(
      onMoveCanvasStack(session.stackId, session.anchor, nextAnchor, session.items)
    ).then((didMove) => {
      if (!didMove) restorePreview()
    }, restorePreview)
    return true
  }

  return { begin, commit, preview }
}
