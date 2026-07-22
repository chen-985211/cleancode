import { memo, useContext, type KeyboardEvent, type MouseEvent, type SyntheticEvent } from 'react'

import { MinimapNodeInteractionContext } from './minimapInteraction'
import { useI18n } from './i18n/useI18n'

interface MinimapWorkbenchNodeProps {
  readonly id: string
  readonly variant: 'agentConsole' | 'terminal' | 'terminalGroup'
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

export const MinimapWorkbenchNode = memo(function MinimapWorkbenchNode({
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
  const { t } = useI18n()
  const { getLabel, setHoveredBlockId } = useContext(MinimapNodeInteractionContext)
  const label = getLabel(id)
  const accessibleKindLabel = variant === 'agentConsole' ? ` ${kindLabel}` : kindLabel
  const statusColor = color ?? 'var(--cc-muted)'
  const nodeClassName = Array.from(
    new Set([
      ...className.split(' '),
      variant === 'terminalGroup' ? 'canvas-minimap__node--terminal-group' : '',
      variant === 'agentConsole' ? 'canvas-minimap__node--agent-console' : ''
    ])
  )
    .filter(Boolean)
    .join(' ')
  const effectiveStrokeColor = strokeColor ?? 'var(--cc-border-strong)'
  const effectiveStrokeWidth = selected
    ? Math.max(strokeWidth ?? 1.2, 1.75)
    : Math.max(strokeWidth ?? 1, 1)
  const headerHeight = Math.max(6, Math.min(height * 0.28, 18))
  const inset = Math.max(3, Math.min(width, height) * 0.08)
  const activate = (event: SyntheticEvent<SVGGElement>): void => {
    event.stopPropagation()
    event.currentTarget.focus()
    onClick?.(event as MouseEvent<SVGGElement>, id)
  }
  const activateFromKeyboard = (event: KeyboardEvent<SVGGElement>): void => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()

    if (event.repeat) {
      return
    }

    activate(event)
  }

  return (
    <g
      className={nodeClassName}
      role="button"
      tabIndex={0}
      aria-label={t('minimap.focusNode', { kind: accessibleKindLabel, label })}
      data-minimap-node-id={id}
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
          selected={selected}
        />
      ) : variant === 'agentConsole' ? (
        <MinimapAgentPreview
          x={x}
          y={y}
          width={width}
          height={height}
          borderRadius={borderRadius}
          inset={inset}
          headerHeight={headerHeight}
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
})

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
  readonly selected?: boolean
}

function MinimapAgentPreview({
  x,
  y,
  width,
  height,
  borderRadius,
  inset,
  headerHeight,
  strokeColor,
  strokeWidth
}: Omit<MinimapPreviewProps, 'statusColor' | 'selected'>) {
  const contentY = y + headerHeight + inset * 1.2

  return (
    <>
      <rect
        className="canvas-minimap__node-shell canvas-minimap__agent-shell"
        x={x}
        y={y}
        width={width}
        height={height}
        rx={borderRadius}
        fill="var(--cc-surface)"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
      />
      <rect
        className="canvas-minimap__node-header canvas-minimap__agent-header"
        x={x + inset}
        y={y + inset}
        width={Math.max(4, width - inset * 2)}
        height={Math.max(5, headerHeight - inset * 0.45)}
        rx={Math.max(2, borderRadius * 0.55)}
        fill="var(--cc-border)"
      />
      <rect
        className="canvas-minimap__agent-icon"
        x={x + inset * 1.35}
        y={y + inset * 1.25}
        width={Math.max(4, inset * 1.3)}
        height={Math.max(4, inset * 1.3)}
        rx={Math.max(1.5, borderRadius * 0.32)}
        fill="var(--cc-surface)"
        opacity={0.9}
      />
      <rect
        className="canvas-minimap__agent-body"
        x={x + inset}
        y={contentY}
        width={Math.max(4, width - inset * 2)}
        height={Math.max(5, height - headerHeight - inset * 2.2)}
        rx={Math.max(2, borderRadius * 0.45)}
        fill="var(--cc-surface-subtle)"
      />
    </>
  )
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
        fill="var(--cc-surface)"
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
        fill="var(--cc-muted-strong)"
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
  strokeWidth,
  selected = false
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
        fill="var(--cc-primary-soft)"
        stroke={selected ? 'var(--cc-primary)' : 'transparent'}
        strokeWidth={Math.max(1.3, strokeWidth + 0.2)}
        opacity={selected ? 0.72 : 0}
      />
      <rect
        className="canvas-minimap__group-shell"
        x={x}
        y={y}
        width={width}
        height={height}
        rx={borderRadius}
        fill="var(--cc-chrome-raised)"
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
        fill="var(--cc-surface)"
        stroke="var(--cc-border)"
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
        fill="var(--cc-muted)"
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
        fill="var(--cc-surface)"
        stroke="var(--cc-border)"
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
        fill="var(--cc-muted)"
        opacity={0.28}
      />
    </>
  )
}
