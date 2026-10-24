import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Edge } from '@xyflow/react'
import type { WorkbenchFlowNode } from '../types/workbenchFlowNode'
import type { WorkbenchCanvasProps } from './workbenchCanvasProps'
import { projectWorkbenchCanvasLayers } from './workbenchCanvasLayers'
import {
  projectCanvasLayerReferences,
  restoreCanvasLayerNodeOrder
} from './workbenchCanvasLayerOrder'
import { commitLayerPosition, WorkbenchCanvasLayerSession } from './workbenchCanvasLayerSession'

interface LayerDrag {
  readonly scopeKey: string
  readonly node: WorkbenchFlowNode
  readonly ids: readonly string[]
}

export function useWorkbenchCanvasLayers({
  currentWorkbench,
  nodes,
  edges,
  onNodeDragStart,
  onNodeDragStop,
  onCancelNodeDrag,
  onMoveCanvasStack,
  onSaveCanvasLayerOrder
}: Pick<
  WorkbenchCanvasProps,
  | 'currentWorkbench'
  | 'onNodeDragStart'
  | 'onNodeDragStop'
  | 'onCancelNodeDrag'
  | 'onMoveCanvasStack'
  | 'onSaveCanvasLayerOrder'
> & { readonly nodes: readonly WorkbenchFlowNode[]; readonly edges: readonly Edge[] }) {
  const graph = currentWorkbench?.graph ?? null
  const arrangement = currentWorkbench?.canvasArrangement
  const scopeKey = JSON.stringify([
    currentWorkbench?.project?.directory,
    graph?.projectId,
    graph?.workspaceId,
    graph?.id
  ])
  const sessions = useRef(new Map<string, WorkbenchCanvasLayerSession>())
  let session = sessions.current.get(scopeKey)
  if (!session) {
    session = new WorkbenchCanvasLayerSession(restoreCanvasLayerNodeOrder(arrangement?.layerOrder))
    sessions.current.set(scopeKey, session)
  }
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const active = useRef<LayerDrag | null>(null)
  const [drag, setDrag] = useState<LayerDrag | null>(null)
  if (drag && drag.scopeKey !== scopeKey) {
    active.current = null
    setDrag(null)
  }
  const begin = useCallback<WorkbenchCanvasProps['onNodeDragStart']>(
    (event, node, ids) => {
      const next = { scopeKey, node, ids: ids ?? [node.id] }
      active.current = next
      setDrag(next)
      onNodeDragStart(event, node, ids)
    },
    [scopeKey, onNodeDragStart]
  )
  const cancelDrag = useCallback(() => {
    active.current = null
    setDrag(null)
  }, [])
  const finish = useCallback(
    (
      commit: () => boolean | void | Promise<boolean | void>,
      didMove: boolean
    ): Promise<boolean> => {
      const released = active.current
      cancelDrag()
      if (!released || released.scopeKey !== scopeKey) return Promise.resolve(false)
      if (!didMove) return commitLayerPosition(commit)
      return session.release({
        ids: released.ids,
        commit,
        project: (nodeOrder) =>
          projectWorkbenchCanvasLayers({
            nodes,
            edges,
            graph,
            arrangement,
            nodeOrder,
            promotions: [released.ids]
          }).nodeOrder,
        save: async (nodeOrder) => {
          if (!onSaveCanvasLayerOrder || !currentWorkbench) return
          await onSaveCanvasLayerOrder({
            projectDirectory: currentWorkbench.project.directory,
            projectId: currentWorkbench.graph.projectId,
            workspaceId: currentWorkbench.graph.workspaceId,
            items: projectCanvasLayerReferences(nodeOrder, nodes, graph)
          })
        }
      })
    },
    [
      cancelDrag,
      scopeKey,
      session,
      nodes,
      edges,
      graph,
      arrangement,
      onSaveCanvasLayerOrder,
      currentWorkbench
    ]
  )
  const stop = useCallback(
    (event: MouseEvent | TouchEvent, node: WorkbenchFlowNode) => {
      const start = active.current?.node.position
      return finish(
        () => onNodeDragStop(event, node),
        Boolean(start && (start.x !== node.position.x || start.y !== node.position.y))
      )
    },
    [finish, onNodeDragStop]
  )
  const moveStack = useCallback<NonNullable<WorkbenchCanvasProps['onMoveCanvasStack']>>(
    (...args) =>
      finish(() => onMoveCanvasStack!(...args), args[1].x !== args[2].x || args[1].y !== args[2].y),
    [finish, onMoveCanvasStack]
  )
  const cancel = useCallback(
    (nodeId: string) => {
      if (active.current?.node.id === nodeId) cancelDrag()
      onCancelNodeDrag?.(nodeId)
    },
    [cancelDrag, onCancelNodeDrag]
  )
  const projection = useMemo(
    () =>
      projectWorkbenchCanvasLayers({
        nodes,
        edges,
        graph,
        arrangement,
        nodeOrder: state.nodeOrder,
        promotions: state.releases.map((entry) => entry.ids),
        draggedNodeIds: drag?.scopeKey === scopeKey ? drag.ids : []
      }),
    [nodes, edges, graph, arrangement, state, drag, scopeKey]
  )

  return {
    ...projection,
    cancelDrag,
    onNodeDragStart: begin,
    onNodeDragStop: stop,
    onCancelNodeDrag: cancel,
    onMoveCanvasStack: onMoveCanvasStack ? moveStack : undefined
  }
}
