import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react'

import {
  isSameTerminalGroupDropAction,
  resolveTerminalGroupDropAction,
  type TerminalGroupDropAction
} from '../../../contexts/block-graph/presentation/view-models/terminalGroupDropTarget'
import { projectTerminalGroupDropAction } from '../projections/terminalGroupDropProjection'
import type { WorkbenchFlowNode } from '../types/workbenchFlowNode'
import type { WorkbenchSnapshot } from '../types/workbenchSnapshot'
import type { WorkbenchNodeLayoutCommitQueue } from '../workbench/nodes/workbenchNodeLayoutCommitQueue'
import { restoreWorkbenchNodeLayout } from '../workbench/nodes/restoreWorkbenchNodeLayout'
import { restoreTerminalDragSlots } from '../projections/restoreTerminalDragSlots'
import { restoreFrozenTerminalGroups } from '../projections/restoreFrozenTerminalGroups'

type Point = { readonly x: number; readonly y: number }
type DragEvent = globalThis.MouseEvent | TouchEvent
interface DragSession {
  readonly nodeId: string
  readonly nodes: WorkbenchFlowNode[]
  readonly baseline: WorkbenchFlowNode[]
  readonly movedIds: ReadonlySet<string>
  readonly scope: 'terminal' | 'workflow'
  readonly isWorkflowTerminal: boolean
}
interface UseTerminalGroupDragActionsInput {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: WorkbenchSnapshot['project']['workspaces'][number] | undefined
  readonly graph: WorkbenchSnapshot['graph'] | null
  readonly getNodes: () => WorkbenchFlowNode[]
  readonly editingTerminalGroupId?: string | null
  readonly isTerminalGroupSelectionMode?: boolean
  readonly layoutCommitQueue: WorkbenchNodeLayoutCommitQueue
  readonly setCurrentGraph: (graph: WorkbenchSnapshot['graph']) => void
  readonly setNodes: Dispatch<SetStateAction<WorkbenchFlowNode[]>>
  readonly toFlowPosition?: (point: Point) => Point
}

export function useTerminalGroupDragActions({
  currentWorkbench,
  currentWorkspace,
  graph,
  getNodes,
  layoutCommitQueue,
  setCurrentGraph,
  setNodes,
  toFlowPosition
}: UseTerminalGroupDragActionsInput) {
  const sessionRef = useRef<DragSession | null>(null)
  const dragGenerationRef = useRef(0)
  const restoreSequence = useRef(0)
  const completeDragReturn = useCallback(
    (nodeId: string, motionId: string) => {
      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === nodeId && node.data.objectMotion?.id === motionId
            ? ({
                ...node,
                data: { ...node.data, objectMotion: undefined, onObjectMotionComplete: undefined }
              } as WorkbenchFlowNode)
            : node
        )
      )
    },
    [setNodes]
  )
  const cancelledIdRef = useRef<string | null>(null)
  const actionRef = useRef<TerminalGroupDropAction>({ type: 'none' })
  const updateAction = useCallback(
    (action: TerminalGroupDropAction) => {
      if (isSameTerminalGroupDropAction(actionRef.current, action)) return
      actionRef.current = action
      setNodes((nodes) => projectTerminalGroupDropAction(nodes, action))
    },
    [setNodes]
  )
  const clearTerminalGroupDropPreview = useCallback(
    () => updateAction({ type: 'none' }),
    [updateAction]
  )

  const beginTerminalGroupDrag = useCallback(
    (_event: DragEvent, node: WorkbenchFlowNode, movedIds?: readonly string[]) => {
      dragGenerationRef.current += 1
      cancelledIdRef.current = null
      if (node.type !== 'terminal') {
        sessionRef.current = null
        return
      }
      const baseline = getNodes()
      const nodes = baseline.map((candidate) => {
        // Freeze the currently displayed shell, including an interrupted disclosure.
        if (candidate.type !== 'terminalGroup' || !toFlowPosition) return candidate
        const surface = document.querySelector<HTMLElement>(
          `[data-terminal-group-id="${CSS.escape(candidate.id)}"]`
        )
        const bounds =
          surface?.querySelector('.terminal-group-node__material')?.getBoundingClientRect() ??
          surface?.getBoundingClientRect()
        if (!bounds?.width || !bounds.height) return candidate
        const topLeft = toFlowPosition({ x: bounds.left, y: bounds.top })
        const bottomRight = toFlowPosition({ x: bounds.right, y: bounds.bottom })
        return {
          ...candidate,
          position: topLeft,
          style: {
            ...candidate.style,
            width: bottomRight.x - topLeft.x,
            height: bottomRight.y - topLeft.y
          }
        }
      })
      // D3 starts after the drag threshold: its event may already hit a nearby
      // workflow label. Only the workflow drag owner supplies a complete scope;
      // crossing a label must never promote a terminal title drag to a workflow.
      const scope = (movedIds?.length ?? 0) > 1 ? 'workflow' : 'terminal'
      sessionRef.current = {
        nodeId: node.id,
        nodes,
        baseline,
        movedIds: new Set(movedIds ?? [node.id]),
        scope,
        isWorkflowTerminal:
          scope === 'terminal' &&
          Boolean(
            graph?.connections?.some(
              (edge) => edge.sourceBlockId === node.id || edge.targetBlockId === node.id
            )
          )
      }
      for (const candidate of nodes) {
        if (candidate.type === 'terminalGroup' && candidate.data.objectMotion)
          candidate.data.onObjectMotionComplete?.(candidate.data.objectMotion.id)
      }
      const frozenGroups = new Map(
        nodes
          .filter((candidate) => candidate.type === 'terminalGroup')
          .map((candidate) => [candidate.id, candidate])
      )
      setNodes((current) =>
        current.map((candidate) => {
          const frozen = frozenGroups.get(candidate.id)
          return frozen
            ? ({
                ...candidate,
                position: frozen.position,
                style: frozen.style,
                data: { ...candidate.data, objectMotion: undefined, isObjectMotionFrozen: true }
              } as WorkbenchFlowNode)
            : candidate
        })
      )
      updateAction({ type: 'none' })
    },
    [getNodes, graph, setNodes, toFlowPosition, updateAction]
  )

  const cancelTerminalGroupDrag = useCallback(() => {
    dragGenerationRef.current += 1
    const session = sessionRef.current
    sessionRef.current = null
    if (session) {
      cancelledIdRef.current = session.nodeId
      const baseline = new Map(session.baseline.map((node) => [node.id, node]))
      setNodes((nodes) =>
        nodes.map((node) => {
          const original = baseline.get(node.id)
          if (!original || node.type === 'terminalGroup') return node
          return {
            ...node,
            position: original.position,
            style: original.style,
            dragging: false,
            data: { ...node.data, isObjectMotionFrozen: false }
          } as WorkbenchFlowNode
        })
      )
      if (graph)
        setNodes((nodes) =>
          restoreFrozenTerminalGroups(
            nodes,
            session.nodes,
            graph,
            `drag-cancel:${++restoreSequence.current}`,
            completeDragReturn
          )
        )
    }
    updateAction({ type: 'none' })
  }, [completeDragReturn, graph, setNodes, updateAction])
  useEffect(() => {
    dragGenerationRef.current += 1
    cancelledIdRef.current = sessionRef.current?.nodeId ?? null
    sessionRef.current = null
  }, [graph?.id])

  const resolveDrop = useCallback(
    (event: DragEvent, node: WorkbenchFlowNode) => {
      const snapshot = sessionRef.current
      const clientPoint =
        'clientX' in event && Number.isFinite(event.clientX)
          ? { x: event.clientX, y: event.clientY }
          : 'touches' in event && (event.touches[0] ?? event.changedTouches[0])
            ? {
                x: (event.touches[0] ?? event.changedTouches[0])!.clientX,
                y: (event.touches[0] ?? event.changedTouches[0])!.clientY
              }
            : undefined
      return graph
        ? resolveTerminalGroupDropAction({
            graph,
            draggedNode: node,
            nodes: snapshot?.nodes ?? getNodes(),
            previousAction: actionRef.current,
            point: clientPoint && toFlowPosition ? toFlowPosition(clientPoint) : undefined
          })
        : { type: 'none' as const }
    },
    [getNodes, graph, toFlowPosition]
  )

  const previewTerminalGroupDrop = useCallback(
    (event: DragEvent, node: WorkbenchFlowNode) => {
      if (cancelledIdRef.current === node.id || node.type !== 'terminal') return
      if (!sessionRef.current) beginTerminalGroupDrag(event, node)
      updateAction(
        sessionRef.current?.isWorkflowTerminal ? { type: 'none' } : resolveDrop(event, node)
      )
    },
    [beginTerminalGroupDrag, resolveDrop, updateAction]
  )

  const moveWorkbenchNode = useCallback(
    async (event: DragEvent, node: WorkbenchFlowNode) => {
      if (cancelledIdRef.current === node.id || !currentWorkbench || !currentWorkspace) return false
      const generation = dragGenerationRef.current
      cancelledIdRef.current = node.id
      const session = sessionRef.current
      sessionRef.current = null
      let committedGraph = currentWorkbench.graph
      if (node.type === 'agentConsole') {
        clearTerminalGroupDropPreview()
        return false
      }
      const action =
        node.type === 'terminal' && !session?.isWorkflowTerminal
          ? resolveTerminalGroupDropAction({
              graph: currentWorkbench.graph,
              draggedNode: node,
              nodes: session?.nodes ?? getNodes(),
              previousAction: actionRef.current,
              point:
                'clientX' in event && toFlowPosition && Number.isFinite(event.clientX)
                  ? toFlowPosition({ x: event.clientX, y: event.clientY })
                  : undefined
            })
          : { type: 'none' as const }
      const previousGroupId =
        currentWorkbench.graph.terminalGroups.find((group) =>
          group.memberBlockIds.includes(node.id)
        )?.id ?? null
      const targetTerminalGroupId =
        action.type === 'join-group'
          ? action.terminalGroupId
          : action.type === 'leave-group'
            ? null
            : previousGroupId
      try {
        if (
          session &&
          ((session.isWorkflowTerminal && previousGroupId) ||
            (action.type === 'none' &&
              previousGroupId &&
              [...session.movedIds].every((id) =>
                currentWorkbench.graph.terminalGroups
                  .find((group) => group.id === previousGroupId)
                  ?.memberBlockIds.includes(id)
              )))
        ) {
          const operationId = `drag-return:${++restoreSequence.current}`
          setNodes((nodes) =>
            restoreTerminalDragSlots(
              nodes,
              session.baseline,
              session.movedIds,
              operationId,
              completeDragReturn
            )
          )
          return false
        }
        await layoutCommitQueue.enqueue(
          `${node.type}:${currentWorkbench.project.id}:${currentWorkspace.workspaceId}:${node.id}`,
          () => {
            const base = {
              projectDirectory: currentWorkbench.project.directory,
              workspaceId: currentWorkspace.workspaceId,
              position: node.position
            }
            if (node.type === 'terminalGroup')
              return (
                window.cleancode?.moveTerminalGroup({ ...base, terminalGroupId: node.id }) ??
                Promise.resolve(undefined)
              )
            if (action.type !== 'none' || previousGroupId || session?.scope === 'workflow') {
              return (
                window.cleancode?.moveTerminalWorkflowToGroup({
                  ...base,
                  blockId: node.id,
                  targetTerminalGroupId,
                  scope: session?.scope ?? 'terminal',
                  ...(session?.scope === 'workflow'
                    ? { expectedBlockIds: [...session.movedIds] }
                    : {})
                }) ?? Promise.resolve(undefined)
              )
            }
            return (
              window.cleancode?.moveBlock({ ...base, blockId: node.id }) ??
              Promise.resolve(undefined)
            )
          },
          (snapshot) => {
            if (snapshot) {
              committedGraph = snapshot
              setCurrentGraph(snapshot)
            }
          }
        )
        return true
      } catch (error) {
        if (dragGenerationRef.current !== generation) throw error
        if (session) {
          const originals = new Map(session.baseline.map((candidate) => [candidate.id, candidate]))
          setNodes((nodes) =>
            nodes.map((candidate) => {
              const original = originals.get(candidate.id)
              return original && session.movedIds.has(candidate.id)
                ? { ...candidate, position: original.position }
                : candidate
            })
          )
        } else setNodes((nodes) => restoreWorkbenchNodeLayout(nodes, currentWorkbench.graph, node))
        throw error
      } finally {
        if (dragGenerationRef.current === generation) {
          if (session)
            setNodes((nodes) =>
              restoreFrozenTerminalGroups(
                nodes,
                session.nodes,
                committedGraph,
                `drag-resume:${++restoreSequence.current}`,
                completeDragReturn
              )
            )
          setNodes((nodes) =>
            nodes.map(
              (candidate) =>
                ({
                  ...candidate,
                  dragging: false,
                  data: { ...candidate.data, isObjectMotionFrozen: false }
                }) as WorkbenchFlowNode
            )
          )
          clearTerminalGroupDropPreview()
        }
      }
    },
    [
      clearTerminalGroupDropPreview,
      completeDragReturn,
      currentWorkbench,
      currentWorkspace,
      getNodes,
      layoutCommitQueue,
      setCurrentGraph,
      setNodes,
      toFlowPosition
    ]
  )

  return {
    beginTerminalGroupDrag,
    cancelTerminalGroupDrag,
    clearTerminalGroupDropPreview,
    moveWorkbenchNode,
    previewTerminalGroupDrop
  }
}
