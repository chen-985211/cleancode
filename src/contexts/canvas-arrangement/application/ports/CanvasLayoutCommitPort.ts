import type {
  CanvasArrangementItemReference,
  CanvasStackSnapshot
} from '../dto/CanvasArrangementSnapshot'

export interface CanvasObjectPosition {
  readonly reference: Exclude<CanvasArrangementItemReference, { readonly kind: 'workflow' }>
  readonly position: { readonly x: number; readonly y: number }
}

export interface CanvasLayoutCommitPort {
  /** Settle every submitted write before returning or rejecting. */
  moveObjects(positions: readonly CanvasObjectPosition[]): Promise<void>
  removeStack(stack: CanvasStackSnapshot): Promise<void>
  restoreStack(stack: CanvasStackSnapshot): Promise<void>
}
