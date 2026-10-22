import {
  useEffect,
  useEffectEvent,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react'
import type { Edge, ReactFlowInstance, Viewport } from '@xyflow/react'
import type { WorkbenchFlowNode } from '../types/workbenchFlowNode'
import type { WorkbenchNodeStore } from './nodes/workbenchNodeStore'
import { workbenchDragAutoPanDelta } from './viewport/workbenchDragAutoPan'

type Point = { readonly x: number; readonly y: number }
interface WorkflowDragSession {
  readonly handle: HTMLElement
  readonly captureElement: HTMLElement
  readonly pointerId: number
  readonly node: WorkbenchFlowNode
  readonly nodes: ReadonlyMap<string, WorkbenchFlowNode>
  readonly startClient: Point
  readonly startFlow: Point
  readonly ids: readonly string[]
  readonly originalIds: ReadonlySet<string>
  started: boolean
  last: WorkbenchFlowNode
  isOverCanvas: boolean
  didPan: boolean
}

// The existing workflow label moves the real graph with pointer capture. Native
// HTML drag remains available for arranging quick slots; it does not own canvas moves.
export function useWorkflowCanvasDragging({
  instanceRef,
  surfaceRef,
  nodeStore,
  onStart,
  onPreview,
  onCommit,
  onViewportChange,
  onCancel
}: {
  readonly instanceRef: React.RefObject<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>
  readonly surfaceRef: React.RefObject<HTMLElement | null>
  readonly nodeStore: WorkbenchNodeStore
  readonly onStart: (event: MouseEvent, node: WorkbenchFlowNode, ids?: readonly string[]) => void
  readonly onPreview: (event: MouseEvent, node: WorkbenchFlowNode) => void
  readonly onCommit: (event: MouseEvent, node: WorkbenchFlowNode) => void
  readonly onViewportChange?: (viewport: Viewport) => void
  readonly onCancel?: (nodeId: string) => void
}) {
  const session = useRef<WorkflowDragSession | null>(null)
  const suppressedHandle = useRef<WorkflowDragSession | null>(null)
  const panFrame = useRef<number | null>(null)
  const lastInput = useRef<InputEvent | null>(null)
  const stopPanning = () => {
    if (panFrame.current !== null) cancelAnimationFrame(panFrame.current)
    panFrame.current = null
    lastInput.current = null
  }
  const finishViewport = (current: WorkflowDragSession) => {
    if (current.didPan && instanceRef.current) onViewportChange?.(instanceRef.current.getViewport())
  }
  const cancel = () => {
    stopPanning()
    const current = session.current
    session.current = null
    if (!current?.started) return
    finishViewport(current)
    suppressedHandle.current = current
    current.handle.removeAttribute('aria-pressed')
    onCancel?.(current.node.id)
    nodeStore.setNodes((nodes) =>
      nodes
        .filter((node) => !current.ids.includes(node.id) || current.originalIds.has(node.id))
        .map((node) => {
          const original = current.nodes.get(node.id)
          return original
            ? ({
                ...node,
                position: original.position,
                data: {
                  ...node.data,
                  isParkedInCollapsedGroup: original.data.isParkedInCollapsedGroup,
                  isObjectMotionFrozen: original.data.isObjectMotionFrozen,
                  isObjectDragPreview: original.data.isObjectDragPreview
                }
              } as WorkbenchFlowNode)
            : node
        })
    )
  }
  const cancelFromWindow = useEffectEvent(cancel)
  const panAtEdge = useEffectEvent(async () => {
    const current = session.current
    const event = lastInput.current
    const instance = instanceRef.current
    const bounds = surfaceRef.current?.getBoundingClientRect()
    if (!current?.started || current.pointerId < 0 || !event || !instance || !bounds) return
    const delta = workbenchDragAutoPanDelta({ x: event.clientX, y: event.clientY }, bounds)
    if ((delta.x || delta.y) && current.isOverCanvas) {
      const viewport = instance.getViewport()
      await instance.setViewport({ ...viewport, x: viewport.x + delta.x, y: viewport.y + delta.y })
      if (session.current !== current) return
      current.didPan = true
      // Reproject even without a pointermove: the viewport moved beneath the grab.
      preview(event)
    }
    if (session.current === current) panFrame.current = requestAnimationFrame(panAtEdge)
  })
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelFromWindow()
    }
    const cancelEvent = () => cancelFromWindow()
    window.addEventListener('keydown', keydown, true)
    window.addEventListener('blur', cancelEvent)
    window.addEventListener('pointercancel', cancelEvent, true)
    window.addEventListener('lostpointercapture', cancelEvent, true)
    return () => {
      session.current = null
      stopPanning()
      window.removeEventListener('keydown', keydown, true)
      window.removeEventListener('blur', cancelEvent)
      window.removeEventListener('pointercancel', cancelEvent, true)
      window.removeEventListener('lostpointercapture', cancelEvent, true)
    }
  }, [])
  type InputEvent = Pick<
    ReactPointerEvent<HTMLElement>,
    'button' | 'target' | 'pointerId' | 'clientX' | 'clientY' | 'preventDefault' | 'stopPropagation'
  > & { nativeEvent: MouseEvent }
  const begin = (event: InputEvent): boolean => {
    if (event.button !== 0 || !(event.target instanceof Element)) return false
    const handle = event.target.closest<HTMLElement>('[data-canvas-drag-target]')
    if (!handle || handle.dataset.canvasDragOrigin !== 'canvas') return false
    const target = JSON.parse(handle.dataset.canvasDragTarget!) as {
      type: string
      terminalBlockIds: string[]
    }
    if (target.type !== 'workflow') return false
    const nodes = nodeStore.getNodes()
    const scopeNodes = target.terminalBlockIds
      .map((id) => nodes.find((candidate) => candidate.id === id) ?? nodeStore.getNodeTemplate(id))
      .filter((node): node is WorkbenchFlowNode => Boolean(node))
    const node = scopeNodes[0]
    if (!node || !instanceRef.current) return false
    suppressedHandle.current = null
    // Projection can reparent a node when hidden workflow members become visible.
    // The canvas survives that update and keeps the gesture captured until release.
    const captureElement = surfaceRef.current ?? handle
    session.current = {
      handle,
      captureElement,
      pointerId: event.pointerId,
      node,
      nodes: new Map(scopeNodes.map((candidate) => [candidate.id, candidate])),
      originalIds: new Set(nodes.map((candidate) => candidate.id)),
      startClient: { x: event.clientX, y: event.clientY },
      startFlow: instanceRef.current.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      ids: target.terminalBlockIds,
      started: false,
      last: node,
      isOverCanvas: false,
      didPan: false
    }
    if (event.pointerId >= 0) captureElement.setPointerCapture?.(event.pointerId)
    event.preventDefault()
    return true
  }
  const preview = (event: InputEvent): boolean => {
    const current = session.current
    const instance = instanceRef.current
    if (!current || current.pointerId !== event.pointerId || !instance) return false
    if (!current.started) {
      if (
        Math.hypot(event.clientX - current.startClient.x, event.clientY - current.startClient.y) < 5
      )
        return true
      current.started = true
      onStart(event.nativeEvent, current.node, current.ids)
    }
    event.preventDefault()
    event.stopPropagation()
    const hit = document.elementFromPoint?.(event.clientX, event.clientY) ?? event.target
    current.isOverCanvas = hit instanceof Element && Boolean(hit.closest('.react-flow'))
    const point = instance.screenToFlowPosition({ x: event.clientX, y: event.clientY })
    const delta = {
      x: point.x - current.startFlow.x,
      y: point.y - current.startFlow.y
    }
    current.last = {
      ...current.node,
      position: { x: current.node.position.x + delta.x, y: current.node.position.y + delta.y }
    }
    nodeStore.setNodes((nodes) =>
      [
        ...nodes,
        ...[...current.nodes.values()].filter(
          (node) => !nodes.some((entry) => entry.id === node.id)
        )
      ].map((node) => {
        const original = current.nodes.get(node.id)
        return original
          ? ({
              ...node,
              position: { x: original.position.x + delta.x, y: original.position.y + delta.y },
              data: {
                ...node.data,
                isParkedInCollapsedGroup: false,
                isObjectMotionFrozen: true,
                isObjectDragPreview: true,
                objectMotion: undefined
              }
            } as WorkbenchFlowNode)
          : node
      })
    )
    onPreview(event.nativeEvent, current.last)
    lastInput.current = event
    if (current.pointerId >= 0 && panFrame.current === null)
      panFrame.current = requestAnimationFrame(panAtEdge)
    return true
  }
  const commit = (event: InputEvent): boolean => {
    const current = session.current
    if (!current || current.pointerId !== event.pointerId) return false
    if (!current.started) {
      session.current = null
      return false
    }
    preview(event)
    if (!current.isOverCanvas) {
      cancel()
      return true
    }
    session.current = null
    stopPanning()
    current.handle.removeAttribute('aria-pressed')
    suppressedHandle.current = current
    event.preventDefault()
    event.stopPropagation()
    onCommit(event.nativeEvent, current.last)
    finishViewport(current)
    return true
  }
  const suppressClick = (event: ReactMouseEvent<HTMLElement>): boolean => {
    const suppressed = suppressedHandle.current
    suppressedHandle.current = null
    if (
      !suppressed ||
      !(event.target instanceof Node) ||
      (!suppressed.handle.contains(event.target) && event.target !== suppressed.captureElement)
    )
      return false
    event.preventDefault()
    event.stopPropagation()
    return true
  }
  const keyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!(event.target instanceof Element)) return
    const handle = event.target.closest<HTMLElement>('[data-canvas-drag-origin="canvas"]')
    if (!handle) return
    const active = session.current
    const rect = handle.getBoundingClientRect()
    const point =
      active?.pointerId === -1
        ? active.startClient
        : { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    const input = (x: number, y: number): InputEvent => ({
      button: 0,
      pointerId: -1,
      target: handle,
      clientX: x,
      clientY: y,
      nativeEvent: new MouseEvent('workflow-keyboard-drag', { clientX: x, clientY: y }),
      preventDefault: () => event.preventDefault(),
      stopPropagation: () => event.stopPropagation()
    })
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      if (active?.pointerId === -1) commit(input(point.x, point.y))
      else if (!active && begin(input(point.x, point.y))) {
        session.current!.started = true
        onStart(input(point.x, point.y).nativeEvent, session.current!.node, session.current!.ids)
        handle.setAttribute('aria-pressed', 'true')
      }
      return
    }
    if (active?.pointerId !== -1) return
    const step = event.shiftKey ? 40 : 16
    const delta = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step]
    }[event.key]
    if (!delta) return
    const next = { x: point.x + delta[0]!, y: point.y + delta[1]! }
    preview(input(next.x, next.y))
    Object.assign(active.startClient, next)
  }
  const preventNativeDrag = (event: DragEvent<HTMLElement>) => {
    if (!session.current) return
    event.preventDefault()
    event.stopPropagation()
  }
  return { begin, preview, commit, cancel, suppressClick, preventNativeDrag, keyDown }
}
