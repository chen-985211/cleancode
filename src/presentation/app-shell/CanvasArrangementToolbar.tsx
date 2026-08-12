import { WorkbenchIcon } from './WorkbenchIcons'

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
    readonly expand: string
    readonly grid: string
    readonly stack: string
    readonly toolbar: string
  }
  readonly onGrid: () => void
  readonly onToggleStack: () => void
}) {
  return (
    <div
      className="canvas-arrangement-toolbar"
      data-canvas-arrangement-toolbar
      data-workbench-canvas-obstruction
      role="toolbar"
      aria-label={labels.toolbar}
    >
      <button
        type="button"
        aria-label={isStacked ? labels.expand : labels.stack}
        disabled={isPending}
        onClick={onToggleStack}
      >
        <WorkbenchIcon active={isStacked} role="arrangement-stack" size={19} />
      </button>
      <button type="button" aria-label={labels.grid} disabled={isPending} onClick={onGrid}>
        <WorkbenchIcon role="arrangement-grid" size={18} />
      </button>
    </div>
  )
}
