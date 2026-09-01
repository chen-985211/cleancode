export type WorkbenchObjectMotionKind =
  | 'canvas-arrange'
  | 'create'
  | 'delete'
  | 'group-collapse'
  | 'group-expand'
  | 'group-join'
  | 'group-leave'
  | 'group-reflow'
  | 'move'

interface WorkbenchObjectMotionRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface WorkbenchObjectMotion {
  readonly id: string
  readonly kind: WorkbenchObjectMotionKind
  readonly offset: { readonly x: number; readonly y: number }
  readonly positionDynamics?: 'drop' | 'grid'
  readonly contentDelayMs?: number
  readonly delayMs?: number
  readonly opacityDelayMs?: number
  readonly scale?: { readonly from: number; readonly to: number }
  readonly opacity?: { readonly from: number; readonly to: number }
  readonly contentOpacity?: { readonly from: number; readonly to: number }
  readonly shellRect?: {
    readonly from: WorkbenchObjectMotionRect
    readonly to: WorkbenchObjectMotionRect
  }
}

interface WorkbenchObjectPresence {
  readonly id: string
  readonly phase: 'pending' | 'entering'
}

export interface WorkbenchObjectMotionNodeData {
  readonly isObjectLayoutChoreographed?: boolean
  readonly objectMotion?: WorkbenchObjectMotion
  readonly objectPresence?: WorkbenchObjectPresence
  readonly onObjectMotionComplete?: (motionId: string) => void
}
