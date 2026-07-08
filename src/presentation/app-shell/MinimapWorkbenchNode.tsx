import { useContext, type KeyboardEvent, type MouseEvent, type SyntheticEvent } from 'react'

import { MinimapNodeInteractionContext } from './minimapInteraction'

interface MinimapWorkbenchNodeProps {
  readonly id: string
  readonly variant: 'terminal' | 'terminalGroup'
  readonly kindLabel: string
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

export function MinimapWorkbenchNode({
  id,
  variant,
  kindLabel,
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
}: MinimapWorkbenchNodeProps) {
  const { focusBlock, getLabel, setHoveredBlockId } = useContext(MinimapNodeInteractionContext)
  const label = getLabel(id)
  const statusColor = color ?? '#98a2b3'
  const nodeClassName = [
    className,
    variant === 'terminalGroup' ? 'canvas-minimap__node--terminal-group' : ''
  ]
    .filter(Boolean)
    .join(' ')
  const effectiveStrokeColor = selected ? '#5c85f5' : (strokeColor ?? '#d3dbe8')
  const effectiveStrokeWidth = selected
    ? Math.max(strokeWidth ?? 1.2, 2)
    : Math.max(strokeWidth ?? 1.1, 1.1)
  const headerHeight = Math.max(6, Math.min(height * 0.28, 18))
  const inset = Math.max(3, Math.min(width, height) * 0.08)
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
      className={nodeClassName}
      role="button"
      tabIndex={0}
      aria-label={`聚焦${kindLabel} ${label}`}
      data-minimap-node-id={id}
      onMouseDown={activate}
      onClick={activate}
      onKeyDown={activateFromKeyboard}
      onMouseEnter={() => setHoveredBlockId(variant === 'terminal' ? id : null)}
      onMouseLeave={() => setHoveredBlockId(null)}
    >
      {variant === 'terminalGroup' ? (
        <MinimapGroupPreview
          x={x}
          y={y}
          width={width}
          height={height}
          borderRadius={borderRadius}
          inset={inset}
          headerHeight={headerHeight}
          statusColor={statusColor}
          strokeColor={effectiveStrokeColor}
          strokeWidth={effectiveStrokeWidth}
        />
      ) : (
        <MinimapTerminalPreview
          x={x}
          y={y}
          width={width}
          height={height}
          borderRadius={borderRadius}
          inset={inset}
          headerHeight={headerHeight}
          statusColor={statusColor}
          strokeColor={effectiveStrokeColor}
          strokeWidth={effectiveStrokeWidth}
        />
      )}
    </g>
  )
}

interface MinimapPreviewProps {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly borderRadius: number
  readonly inset: number
  readonly headerHeight: number
  readonly statusColor: string
  readonly strokeColor: string
  readonly strokeWidth: number
}

function MinimapTerminalPreview({
  x,
  y,
  width,
  height,
  borderRadius,
  inset,
  headerHeight,
  statusColor,
  strokeColor,
  strokeWidth
}: MinimapPreviewProps) {
  const screenY = y + headerHeight + inset
  const screenHeight = Math.max(3, height - headerHeight - inset * 1.8)

  return (
    <>
      <rect
        className="canvas-minimap__node-shell"
        x={x}
        y={y}
        width={width}
        height={height}
        rx={borderRadius}
        fill="#ffffff"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
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
        fill="#141a24"
      />
    </>
  )
}

function MinimapGroupPreview({
  x,
  y,
  width,
  height,
  borderRadius,
  inset,
  headerHeight,
  statusColor,
  strokeColor,
  strokeWidth
}: MinimapPreviewProps) {
  const contentX = x + inset
  const contentWidth = Math.max(4, width - inset * 2)
  const headerY = y + inset
  const headerInnerHeight = Math.max(8, headerHeight)
  const memberStartY = headerY + headerInnerHeight + inset * 0.8
  const rowGap = Math.max(3, inset * 0.3)
  const rowHeight = Math.max(7, Math.min(14, (height - memberStartY + y - inset) / 2.25))
  const ringInset = Math.max(4, Math.min(10, inset * 0.48))

  return (
    <>
      <rect
        className="canvas-minimap__group-ring"
        x={x - ringInset}
        y={y - ringInset}
        width={width + ringInset * 2}
        height={height + ringInset * 2}
        rx={borderRadius + ringInset * 0.65}
        fill="#eff6ff"
        stroke="#8fa9f7"
        strokeWidth={Math.max(1.4, strokeWidth + 0.35)}
        opacity={0.72}
      />
      <rect
        className="canvas-minimap__group-shell"
        x={x}
        y={y}
        width={width}
        height={height}
        rx={borderRadius}
        fill="#f8fafc"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
      />
      <rect
        className="canvas-minimap__group-header"
        x={contentX}
        y={headerY}
        width={contentWidth}
        height={headerInnerHeight}
        rx={Math.max(2, borderRadius * 0.55)}
        fill="#ffffff"
        stroke="#dbe3ef"
        strokeWidth={1}
      />
      <circle
        className="canvas-minimap__group-status"
        cx={contentX + inset * 0.82}
        cy={headerY + headerInnerHeight / 2}
        r={Math.max(2, Math.min(4, inset * 0.28))}
        fill={statusColor}
      />
      <rect
        className="canvas-minimap__group-title"
        x={contentX + inset * 1.45}
        y={headerY + headerInnerHeight / 2 - 2}
        width={Math.max(12, contentWidth * 0.38)}
        height={Math.max(3, Math.min(5, headerInnerHeight * 0.22))}
        rx={2}
        fill="#64748b"
        opacity={0.35}
      />
      {[0, 1].map((index) => (
        <MinimapGroupMemberRow
          key={index}
          x={contentX}
          y={memberStartY + index * (rowHeight + rowGap)}
          width={contentWidth}
          height={rowHeight}
          radius={Math.max(2, borderRadius * 0.45)}
          inset={inset}
          statusColor={statusColor}
        />
      ))}
    </>
  )
}

interface MinimapGroupMemberRowProps {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly radius: number
  readonly inset: number
  readonly statusColor: string
}

function MinimapGroupMemberRow({
  x,
  y,
  width,
  height,
  radius,
  inset,
  statusColor
}: MinimapGroupMemberRowProps) {
  return (
    <>
      <rect
        className="canvas-minimap__group-member"
        x={x}
        y={y}
        width={width}
        height={height}
        rx={radius}
        fill="#ffffff"
        stroke="#dbe3ef"
        strokeWidth={1}
      />
      <circle
        className="canvas-minimap__group-member-status"
        cx={x + inset * 0.82}
        cy={y + height / 2}
        r={Math.max(2, Math.min(4, inset * 0.22))}
        fill={statusColor}
      />
      <rect
        className="canvas-minimap__group-member-name"
        x={x + inset * 1.45}
        y={y + height / 2 - 1.5}
        width={Math.max(10, width * 0.5)}
        height={3}
        rx={1.5}
        fill="#64748b"
        opacity={0.28}
      />
    </>
  )
}
