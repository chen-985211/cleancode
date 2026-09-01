import type { QuickExecutionSlotNumber } from '../../application/dto/BlockGraphSnapshot'
import type { QuickExecutionBindingProjection } from './quickExecutionProjection'

export interface QuickExecutionDragMotion {
  readonly id: string
  readonly kind: 'delete' | 'move'
  readonly offset: { readonly x: number; readonly y: number }
  readonly scale?: { readonly from: number; readonly to: number }
}

export interface DragPreviewGeometry {
  readonly grabOffsetX: number
  readonly grabOffsetY: number
  readonly height: number
  readonly width: number
}

export interface DragPreview extends DragPreviewGeometry {
  readonly isUnavailable: boolean
  readonly left: number
  readonly number: QuickExecutionSlotNumber
  readonly originLeft: number
  readonly originTop: number
  readonly projection: QuickExecutionBindingProjection
  readonly top: number
}

export interface DragAnimation extends DragPreview {
  readonly motion: QuickExecutionDragMotion
  readonly targetLeft: number
  readonly targetTop: number
}

export const blackHoleProximityThreshold = 44

export function createQuickExecutionReturnAnimation(
  preview: DragPreview,
  motionId: string
): DragAnimation {
  return {
    ...preview,
    motion: {
      id: motionId,
      kind: 'move',
      offset: {
        x: preview.left - preview.originLeft,
        y: preview.top - preview.originTop
      }
    },
    targetLeft: preview.originLeft,
    targetTop: preview.originTop
  }
}

export function isQuickExecutionDropTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('[data-quick-execution-slot], [data-quick-execution-trash]') !== null
  )
}

export function distanceBetweenRectangles(
  source: Pick<DOMRect, 'bottom' | 'left' | 'right' | 'top'>,
  target: Pick<DOMRect, 'bottom' | 'left' | 'right' | 'top'>
): number {
  const horizontalGap = Math.max(target.left - source.right, source.left - target.right, 0)
  const verticalGap = Math.max(target.top - source.bottom, source.top - target.bottom, 0)
  return Math.hypot(horizontalGap, verticalGap)
}
