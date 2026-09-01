import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useEffect, type MutableRefObject, type RefObject } from 'react'

import type { WorkbenchFlowNode } from './types/workbenchFlowNode'
import {
  retargetWorkbenchDirectZoom,
  setWorkbenchDirectZoomReducedMotion,
  type WorkbenchDirectZoomInput
} from './workbenchDirectZoom'
import {
  cancelWorkbenchViewportMotion,
  setWorkbenchViewportReducedMotion
} from './workbenchViewportMotion'
import { usePrefersReducedMotion } from '../shared/hooks/usePrefersReducedMotion'

interface WorkbenchWheelZoomInput {
  readonly ctrlKey: boolean
  readonly deltaMode: number
  readonly deltaY: number
  readonly mac: boolean
}

export function resolveWorkbenchWheelZoomStops(input: WorkbenchWheelZoomInput): number {
  const deltaScale =
    input.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 0.05
      : input.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? 1
        : 0.002
  const pinchScale = input.ctrlKey && input.mac ? 10 : 1
  return -input.deltaY * deltaScale * pinchScale
}

export function useWorkbenchDirectZoom({
  canvasSurfaceRef,
  onViewportInteractionStart,
  reactFlowInstanceRef,
  viewportMotionInstance
}: {
  readonly canvasSurfaceRef: RefObject<HTMLDivElement | null>
  readonly onViewportInteractionStart?: () => void
  readonly reactFlowInstanceRef: MutableRefObject<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>
  readonly viewportMotionInstance: ReactFlowInstance<WorkbenchFlowNode, Edge> | null
}): void {
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    if (!viewportMotionInstance) return
    setWorkbenchDirectZoomReducedMotion(reducedMotion, viewportMotionInstance)
    setWorkbenchViewportReducedMotion(reducedMotion, viewportMotionInstance)
  }, [reducedMotion, viewportMotionInstance])

  useEffect(() => {
    if (!viewportMotionInstance) return undefined

    const renderer = canvasSurfaceRef.current?.querySelector<HTMLElement>('.react-flow__renderer')
    if (!renderer) return undefined

    const handleWheel = (event: WheelEvent): void => {
      const target = event.target
      if (!(target instanceof Element)) return

      if (target.closest('.nowheel')) {
        if (event.ctrlKey) event.preventDefault()
        return
      }

      const instance = reactFlowInstanceRef.current
      if (!instance) return

      const deltaZoomStops = resolveWorkbenchWheelZoomStops({
        ctrlKey: event.ctrlKey,
        deltaMode: event.deltaMode,
        deltaY: event.deltaY,
        mac: isMacPlatform()
      })
      if (!Number.isFinite(deltaZoomStops) || deltaZoomStops === 0) return

      event.preventDefault()
      event.stopImmediatePropagation()
      const bounds = renderer.getBoundingClientRect()
      cancelWorkbenchViewportMotion(instance)
      const input: WorkbenchDirectZoomInput = {
        anchor: { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
        deltaZoomStops,
        reducedMotion
      }
      if (retargetWorkbenchDirectZoom(instance, input)) onViewportInteractionStart?.()
    }

    renderer.addEventListener('wheel', handleWheel, { capture: true, passive: false })
    return () => renderer.removeEventListener('wheel', handleWheel, { capture: true })
  }, [
    canvasSurfaceRef,
    onViewportInteractionStart,
    reactFlowInstanceRef,
    reducedMotion,
    viewportMotionInstance
  ])
}

function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent)
}
