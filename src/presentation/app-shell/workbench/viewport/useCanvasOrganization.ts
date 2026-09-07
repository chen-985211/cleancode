import { getViewportForBounds, type Edge, type ReactFlowInstance } from '@xyflow/react'
import { useCallback, useLayoutEffect, useRef, type MutableRefObject } from 'react'

import { minimumCanvasZoom } from '../../../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { CanvasArrangementSelectionItem } from '../../../../contexts/canvas-arrangement/presentation/view-models/canvasArrangementSelection'
import type { CanvasArrangementGridPlan } from '../../projections/workbenchCanvasArrangementGridPlanning'
import type { WorkbenchFlowNode } from '../../types/workbenchFlowNode'
import { readWorkbenchCanvasCreationGeometry } from './workbenchCanvasSafeViewport'
import {
  cancelWorkbenchViewportMotion,
  transitionWorkbenchViewport
} from './workbenchViewportMotion'

export type OrganizeCanvasHandler = (
  items: readonly CanvasArrangementSelectionItem[]
) => Promise<CanvasArrangementGridPlan['bounds'] | null>

export function useCanvasOrganization({
  items,
  scopeKey,
  onOrganizeCanvas,
  onUserAction,
  onFailure,
  reactFlowInstanceRef
}: {
  readonly items: readonly CanvasArrangementSelectionItem[]
  readonly scopeKey: string
  readonly onOrganizeCanvas?: OrganizeCanvasHandler
  readonly onUserAction?: () => void
  readonly onFailure: () => void
  readonly reactFlowInstanceRef: MutableRefObject<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>
}) {
  const requestRef = useRef(0)
  const pendingRef = useRef(false)
  const inputCleanupRef = useRef<(() => void) | null>(null)
  const cancelFocus = useCallback(() => {
    requestRef.current += 1
    inputCleanupRef.current?.()
  }, [])
  useLayoutEffect(() => cancelFocus, [scopeKey, cancelFocus])

  const organize = useCallback(async (): Promise<void> => {
    const instance = reactFlowInstanceRef.current
    if (!instance || !onOrganizeCanvas || pendingRef.current || items.length === 0) return
    const request = ++requestRef.current
    pendingRef.current = true
    const stopFollowingInput = (): void => {
      document.removeEventListener('pointerdown', cancelFocus, true)
      document.removeEventListener('keydown', cancelFocus, true)
      document.removeEventListener('wheel', cancelFocus, true)
      if (inputCleanupRef.current === stopFollowingInput) inputCleanupRef.current = null
    }
    inputCleanupRef.current = stopFollowingInput
    document.addEventListener('pointerdown', cancelFocus, true)
    document.addEventListener('keydown', cancelFocus, true)
    document.addEventListener('wheel', cancelFocus, { capture: true, passive: true })
    try {
      onUserAction?.()
      cancelWorkbenchViewportMotion(instance)
      const bounds = await onOrganizeCanvas(items)
      stopFollowingInput()
      if (!bounds || request !== requestRef.current || reactFlowInstanceRef.current !== instance)
        return
      // Use the committed plan rather than nodes whose React projection may lag.
      const { canvasSize, safeViewport } = readWorkbenchCanvasCreationGeometry()
      const viewport = getViewportForBounds(
        bounds,
        safeViewport.width,
        safeViewport.height,
        minimumCanvasZoom,
        1,
        0
      )
      await transitionWorkbenchViewport(instance, {
        type: 'set-viewport',
        intent: { type: 'adaptive-focus', canvasSize },
        viewport: { ...viewport, x: viewport.x + safeViewport.x, y: viewport.y + safeViewport.y }
      })
    } catch {
      if (request === requestRef.current) onFailure()
    } finally {
      stopFollowingInput()
      pendingRef.current = false
    }
  }, [items, onOrganizeCanvas, onUserAction, onFailure, reactFlowInstanceRef, cancelFocus])

  return { organize, cancelFocus }
}
