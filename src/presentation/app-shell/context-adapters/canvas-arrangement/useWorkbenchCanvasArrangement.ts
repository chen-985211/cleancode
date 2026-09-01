import { useMemo } from 'react'

import {
  useCanvasStackDragging,
  type MoveCanvasStackHandler
} from '../../../../contexts/canvas-arrangement/presentation/hooks/useCanvasStackDragging'
import type { WorkbenchFlowNode } from '../../types/workbenchFlowNode'
import type { WorkbenchSnapshot } from '../../types/workbenchSnapshot'
import type { WorkbenchNodeStore } from '../../workbench/nodes/workbenchNodeStore'
import { listCanvasArrangementItems } from '../../projections/workbenchCanvasArrangementSelection'
import { toCanvasArrangementProjectionNodes } from '../../projections/workbenchCanvasArrangementStackingProjection'

export type { MoveCanvasStackHandler }

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
    nodes,
    onCancelNodeDrag,
    onMoveCanvasStack,
    onNodeDragStart,
    projectionNodes: toCanvasArrangementProjectionNodes(nodes),
    setNodePositions: (positions) =>
      nodeStore.setNodes((currentNodes) =>
        currentNodes.map((candidate) => {
          const position = positions.get(candidate.id)
          return position ? { ...candidate, position } : candidate
        })
      )
  })

  return { arrangement, dragging }
}
