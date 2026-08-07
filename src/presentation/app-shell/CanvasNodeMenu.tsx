import { forwardRef, type ButtonHTMLAttributes } from 'react'

import { CanvasMenuSurface, type CanvasMenuSurfaceProps } from './CanvasMenuMotionProvider'

type CanvasNodeMenuProps = Omit<CanvasMenuSurfaceProps, 'className'>
type CanvasNodeMenuItemProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'>

export const CanvasNodeMenu = forwardRef<HTMLDivElement, CanvasNodeMenuProps>(
  function CanvasNodeMenu(props, ref) {
    return <CanvasMenuSurface {...props} className="canvas-node-menu nodrag" ref={ref} />
  }
)

export function CanvasNodeMenuItem(props: CanvasNodeMenuItemProps) {
  return <button {...props} className="canvas-node-menu__item" />
}
