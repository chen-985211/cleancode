import { forwardRef } from 'react'

import { CanvasMenuSurface, type CanvasMenuSurfaceProps } from './CanvasMenuMotionProvider'

type CanvasNodeMenuProps = Omit<CanvasMenuSurfaceProps, 'className'>

export const CanvasNodeMenu = forwardRef<HTMLDivElement, CanvasNodeMenuProps>(
  function CanvasNodeMenu(props, ref) {
    return <CanvasMenuSurface {...props} className="canvas-node-menu nodrag" ref={ref} />
  }
)
