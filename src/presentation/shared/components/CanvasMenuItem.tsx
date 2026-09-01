import type { ButtonHTMLAttributes } from 'react'

type CanvasMenuItemProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'>

export function CanvasMenuItem(props: CanvasMenuItemProps) {
  return <button {...props} className="canvas-node-menu__item" />
}
