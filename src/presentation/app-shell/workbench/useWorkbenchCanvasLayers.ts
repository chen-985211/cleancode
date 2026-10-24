import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Edge } from '@xyflow/react'
import type { WorkbenchFlowNode } from '../types/workbenchFlowNode'
import type { WorkbenchCanvasProps } from './workbenchCanvasProps'
import { projectWorkbenchCanvasLayers } from './workbenchCanvasLayers'

interface LayerDrag {
  readonly token: number
  readonly scopeKey: string
  readonly node: WorkbenchFlowNode
  readonly ids: readonly string[]
}
interface LayerPromotion {
  readonly token: number
  readonly ids: readonly string[]
  readonly saved: boolean
}
interface LayerState {
  readonly scopeKey: string
  readonly nodeOrder: readonly string[]
  readonly promotions: readonly LayerPromotion[]
  readonly drag: LayerDrag | null
}
const initialState = (scopeKey: string): LayerState => ({
  scopeKey,
  nodeOrder: [],
  promotions: [],
  drag: null
})

export function useWorkbenchCanvasLayers({
  currentWorkbench,
  nodes,
  edges,
  onNodeDragStart,
  onNodeDragStop,
  onCancelNodeDrag,
  onMoveCanvasStack
}: Pick<
  WorkbenchCanvasProps,
  | 'currentWorkbench'
  | 'onNodeDragStart'
  | 'onNodeDragStop'
  | 'onCancelNodeDrag'
  | 'onMoveCanvasStack'
> & {
  readonly nodes: readonly WorkbenchFlowNode[]
  readonly edges: readonly Edge[]
}) {
  const graph = currentWorkbench?.graph ?? null
  const arrangement = currentWorkbench?.canvasArrangement
  const scopeKey = JSON.stringify([graph?.projectId, graph?.workspaceId, graph?.id])
  const [state, setState] = useState(() => initialState(scopeKey))
  const active = useRef<LayerDrag | null>(null)
  const sequence = useRef(0)
  if (state.scopeKey !== scopeKey) {
    active.current = null
    setState(initialState(scopeKey))
  }
  const begin = useCallback<WorkbenchCanvasProps['onNodeDragStart']>(
    (event, node, ids) => {
      const drag = { token: ++sequence.current, scopeKey, node, ids: ids ?? [node.id] }
      active.current = drag
      setState((current) => ({ ...current, drag }))
      onNodeDragStart(event, node, ids)
    },
    [scopeKey, onNodeDragStart]
  )
  const cancelDrag = useCallback(() => {
    active.current = null
    setState((current) => (current.drag ? { ...current, drag: null } : current))
  }, [])
  const finish = useCallback(
    async (
      commit: () => boolean | void | Promise<boolean | void>,
      didMove: boolean
    ): Promise<boolean> => {
      const drag = active.current
      active.current = null
      if (!drag || drag.scopeKey !== scopeKey) return false
      setState((current) => ({
        ...current,
        drag: null,
        promotions: didMove
          ? [...current.promotions, { token: drag.token, ids: drag.ids, saved: false }]
          : current.promotions
      }))
      let saved = false
      try {
        saved = (await commit()) !== false
      } catch {
        saved = false
      }
      setState((current) => {
        if (!current.promotions.some((entry) => entry.token === drag.token)) return current
        return {
          ...current,
          promotions: saved
            ? current.promotions.map((entry) =>
                entry.token === drag.token ? { ...entry, saved: true } : entry
              )
            : current.promotions.filter((entry) => entry.token !== drag.token)
        }
      })
      return saved
    },
    [scopeKey]
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
        promotions: state.promotions.map((entry) => entry.ids),
        draggedNodeIds: state.drag?.ids
      }),
    [nodes, edges, graph, arrangement, state]
  )

  // Compact completed releases into one bounded order. Keep unresolved releases
  // separate: a failed older save must not erase a later successful promotion.
  useEffect(() => {
    const pending = state.promotions.findIndex((entry) => !entry.saved)
    const count = pending < 0 ? state.promotions.length : pending
    if (!count) return
    const committed = projectWorkbenchCanvasLayers({
      nodes,
      edges,
      graph,
      arrangement,
      nodeOrder: state.nodeOrder,
      promotions: state.promotions.slice(0, count).map((entry) => entry.ids)
    })
    setState((current) =>
      current === state
        ? {
            ...current,
            nodeOrder: committed.nodeOrder,
            promotions: current.promotions.slice(count)
          }
        : current
    )
  }, [nodes, edges, graph, arrangement, state])

  return {
    ...projection,
    cancelDrag,
    onNodeDragStart: begin,
    onNodeDragStop: stop,
    onCancelNodeDrag: cancel,
    onMoveCanvasStack: onMoveCanvasStack ? moveStack : undefined
  }
}
