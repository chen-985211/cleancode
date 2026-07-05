import { useContext, type KeyboardEvent, type MouseEvent, type SyntheticEvent } from 'react'

import { MinimapNodeInteractionContext } from './minimapInteraction'

interface MinimapTerminalNodeProps {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly borderRadius: number
  readonly className: string
  readonly color?: string
  readonly strokeColor?: string
  readonly strokeWidth?: number
  readonly selected: boolean
  readonly onClick?: (event: MouseEvent<SVGGElement>, id: string) => void
}

export function MinimapTerminalNode({
  id,
  x,
  y,
  width,
  height,
  borderRadius,
  className,
  color,
  strokeColor,
  strokeWidth,
  selected,
  onClick
}: MinimapTerminalNodeProps) {
  const { focusBlock, getLabel, setHoveredBlockId } = useContext(MinimapNodeInteractionContext)
  const label = getLabel(id)
  const statusColor = color ?? '#98a2b3'
  const effectiveStrokeColor = selected ? '#2563eb' : (strokeColor ?? '#9fb7ef')
  const effectiveStrokeWidth = selected
    ? Math.max(strokeWidth ?? 2, 4)
    : Math.max(strokeWidth ?? 2, 2)
  const headerHeight = Math.max(6, Math.min(height * 0.28, 18))
  const inset = Math.max(3, Math.min(width, height) * 0.08)
  const screenY = y + headerHeight + inset
  const screenHeight = Math.max(3, height - headerHeight - inset * 1.8)
  const activate = (event: SyntheticEvent<SVGGElement>): void => {
    event.stopPropagation()
    focusBlock(id)
    onClick?.(event as MouseEvent<SVGGElement>, id)
  }
  const activateFromKeyboard = (event: KeyboardEvent<SVGGElement>): void => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()
    activate(event)
  }

  return (
    <g
      className={className}
      role="button"
      tabIndex={0}
      aria-label={`聚焦终端 ${label}`}
      data-minimap-terminal-id={id}
      onMouseDown={activate}
      onClick={activate}
      onKeyDown={activateFromKeyboard}
      onMouseEnter={() => setHoveredBlockId(id)}
      onMouseLeave={() => setHoveredBlockId(null)}
    >
      <rect
        className="canvas-minimap__node-shell"
        x={x}
        y={y}
        width={width}
        height={height}
        rx={borderRadius}
        fill="#ffffff"
        stroke={effectiveStrokeColor}
        strokeWidth={effectiveStrokeWidth}
      />
      <rect
        className="canvas-minimap__node-header"
        x={x + inset}
        y={y + inset}
        width={Math.max(4, width - inset * 2)}
        height={Math.max(4, headerHeight - inset * 0.55)}
        rx={Math.max(2, borderRadius * 0.55)}
        fill={statusColor}
      />
      <circle
        className="canvas-minimap__node-status"
        cx={x + width - inset * 1.6}
        cy={y + inset + 2}
        r={Math.max(2, Math.min(4, inset * 0.8))}
        fill={statusColor}
      />
      <rect
        className="canvas-minimap__node-screen"
        x={x + inset}
        y={screenY}
        width={Math.max(4, width - inset * 2)}
        height={screenHeight}
        rx={Math.max(2, borderRadius * 0.45)}
        fill="#0b0f14"
      />
    </g>
  )
}
