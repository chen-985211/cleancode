import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes } from 'react'

type CanvasNodeMenuProps = Omit<HTMLAttributes<HTMLDivElement>, 'className'>
type CanvasNodeMenuItemProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'>

export const CanvasNodeMenu = forwardRef<HTMLDivElement, CanvasNodeMenuProps>(
  function CanvasNodeMenu(props, ref) {
    return <div {...props} className="canvas-node-menu nodrag" ref={ref} />
  }
)

export function CanvasNodeMenuItem(props: CanvasNodeMenuItemProps) {
  return <button {...props} className="canvas-node-menu__item" />
}
