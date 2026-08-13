import { WorkbenchIcon } from './WorkbenchIcons'
import { TooltipLabel } from './Tooltip'

export function CanvasArrangementToolbar({
  isPending,
  isStacked,
  labels,
  onGrid,
  onToggleStack
}: {
  readonly isPending: boolean
  readonly isStacked: boolean
  readonly labels: {
    readonly detach: string
    readonly grid: string
    readonly stack: string
    readonly toolbar: string
  }
  readonly onGrid: () => void
  readonly onToggleStack: () => void
}) {
  const stackLabel = isStacked ? labels.detach : labels.stack

  return (
    <div
      className="canvas-arrangement-toolbar"
      data-canvas-arrangement-toolbar
      data-workbench-canvas-obstruction
      role="toolbar"
      aria-label={labels.toolbar}
    >
      <TooltipLabel content={stackLabel}>
        <button
          type="button"
          aria-label={stackLabel}
          aria-pressed={isStacked}
          disabled={isPending}
          onClick={onToggleStack}
        >
          <WorkbenchIcon active={isStacked} role="arrangement-stack" size={19} />
        </button>
      </TooltipLabel>
      <TooltipLabel content={labels.grid}>
        <button type="button" aria-label={labels.grid} disabled={isPending} onClick={onGrid}>
          <WorkbenchIcon role="arrangement-grid" size={18} />
        </button>
      </TooltipLabel>
    </div>
  )
}
