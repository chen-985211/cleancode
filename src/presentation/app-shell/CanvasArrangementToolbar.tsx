import { AnchoredSurfaceMotion } from './AppShellSurfaceMotion'
import { WorkbenchIcon } from './WorkbenchIcons'
import { TooltipLabel } from '../shared/components/Tooltip'

export function CanvasArrangementToolbar({
  canArrange,
  isPending,
  isStacked,
  labels,
  onGrid,
  onExitComplete,
  onToggleStack,
  open = true
}: {
  readonly canArrange: boolean
  readonly isPending: boolean
  readonly isStacked: boolean
  readonly labels: {
    readonly detach: string
    readonly grid: string
    readonly stack: string
    readonly toolbar: string
  }
  readonly onGrid: () => void
  readonly onExitComplete?: () => void
  readonly onToggleStack: () => void
  readonly open?: boolean
}) {
  const stackLabel = isStacked ? labels.detach : labels.stack

  return (
    <AnchoredSurfaceMotion
      className="canvas-arrangement-toolbar"
      data-canvas-arrangement-toolbar
      data-workbench-canvas-obstruction
      data-side="top"
      onExitComplete={onExitComplete}
      open={open}
      role="toolbar"
      aria-label={labels.toolbar}
      springPreset="bottom-control"
    >
      <TooltipLabel content={stackLabel}>
        <button
          type="button"
          aria-label={stackLabel}
          aria-pressed={isStacked}
          disabled={isPending || !canArrange}
          onClick={onToggleStack}
        >
          <WorkbenchIcon active={isStacked} role="arrangement-stack" size={20} />
        </button>
      </TooltipLabel>
      <TooltipLabel content={labels.grid}>
        <button
          type="button"
          aria-label={labels.grid}
          disabled={isPending || !canArrange}
          onClick={onGrid}
        >
          <WorkbenchIcon role="arrangement-grid" size={18} />
        </button>
      </TooltipLabel>
    </AnchoredSurfaceMotion>
  )
}
