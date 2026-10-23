import { useEffect, useRef, type RefObject } from 'react'
import type { Edge, NodeChange, ReactFlowInstance } from '@xyflow/react'
import type { WorkbenchFlowNode } from '../../types/workbenchFlowNode'
import type { WorkbenchNodeStore } from './workbenchNodeStore'
import { captureWorkbenchNodePresentation } from './captureWorkbenchNodePresentation'

export function useWorkbenchNodeDragSession({
  instanceRef,
  nodeStore,
  surfaceRef,
  onCancel
}: {
  readonly instanceRef: RefObject<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>
  readonly nodeStore: WorkbenchNodeStore
  readonly surfaceRef: RefObject<HTMLElement | null>
  readonly onCancel?: (id: string) => void
}) {
  const activeRef = useRef<WorkbenchFlowNode | null>(null)
  const cancelledRef = useRef<string | null>(null)
  const offsetRef = useRef({ x: 0, y: 0 })
  const baselineRef = useRef<WorkbenchFlowNode[]>([])
  useEffect(() => {
    const cancel = () => {
      const node = activeRef.current
      if (!node) return
      cancelledRef.current = node.id
      activeRef.current = null
      surfaceRef.current?.classList.remove('canvas-surface--dragging-terminal')
      onCancel?.(node.id)
      const baseline = new Map(baselineRef.current.map((entry) => [entry.id, entry]))
      nodeStore.setNodes((nodes) =>
        nodes.map((entry) => {
          const original = baseline.get(entry.id)
          return original
            ? ({
                ...entry,
                position: original.position,
                style: original.style,
                dragging: false,
                data: {
                  ...entry.data,
                  isObjectMotionFrozen: false,
                  isObjectDragPreview: original.data.isObjectDragPreview
                }
              } as WorkbenchFlowNode)
            : entry
        })
      )
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel()
    }
    window.addEventListener('keydown', keydown, true)
    window.addEventListener('pointercancel', cancel, true)
    window.addEventListener('lostpointercapture', cancel, true)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('keydown', keydown, true)
      window.removeEventListener('pointercancel', cancel, true)
      window.removeEventListener('lostpointercapture', cancel, true)
      window.removeEventListener('blur', cancel)
    }
  }, [nodeStore, onCancel, surfaceRef])
  const projectNode = (node: WorkbenchFlowNode): WorkbenchFlowNode => ({
    ...node,
    position: {
      x: node.position.x + offsetRef.current.x,
      y: node.position.y + offsetRef.current.y
    }
  })
  const begin = (node: WorkbenchFlowNode) => {
    cancelledRef.current = null
    baselineRef.current = nodeStore.getNodes()
    const presented = instanceRef.current
      ? captureWorkbenchNodePresentation(node, instanceRef.current.screenToFlowPosition)
      : node
    const position = presented.position
    offsetRef.current = { x: position.x - node.position.x, y: position.y - node.position.y }
    const projected = projectNode(node)
    activeRef.current = projected
    if (node.data.objectMotion) node.data.onObjectMotionComplete?.(node.data.objectMotion.id)
    const ids = new Set(
      node.type === 'terminalGroup' ? [node.id, ...node.data.group.memberBlockIds] : [node.id]
    )
    const captured = new Map(
      nodeStore
        .getNodes()
        .filter((entry) => ids.has(entry.id))
        .map((entry) => [
          entry.id,
          node.type === 'terminalGroup' && instanceRef.current
            ? captureWorkbenchNodePresentation(entry, instanceRef.current.screenToFlowPosition)
            : entry
        ])
    )
    for (const entry of captured.values())
      if (entry.data.objectMotion) entry.data.onObjectMotionComplete?.(entry.data.objectMotion.id)
    nodeStore.setNodes((nodes) =>
      nodes.map((entry) => {
        const frozen = captured.get(entry.id)
        if (!frozen) return entry
        return {
          ...entry,
          position:
            node.type === 'terminalGroup'
              ? frozen.position
              : {
                  x: entry.position.x + offsetRef.current.x,
                  y: entry.position.y + offsetRef.current.y
                },
          style: node.type === 'terminalGroup' ? frozen.style : entry.style,
          data: {
            ...entry.data,
            objectMotion: undefined,
            isObjectMotionFrozen: true,
            isObjectDragPreview: node.type === 'terminalGroup'
          }
        } as WorkbenchFlowNode
      })
    )
    return projected
  }
  const projectChanges = (changes: NodeChange<WorkbenchFlowNode>[]) =>
    changes
      .filter((change) => change.type !== 'position' || change.id !== cancelledRef.current)
      .map((change) =>
        change.type === 'position' && change.position && change.id === activeRef.current?.id
          ? {
              ...change,
              position: {
                x: change.position.x + offsetRef.current.x,
                y: change.position.y + offsetRef.current.y
              }
            }
          : change
      )
  return { activeRef, cancelledRef, begin, projectChanges, projectNode }
}
