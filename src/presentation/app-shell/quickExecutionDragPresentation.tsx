import type { QuickExecutionTargetSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { DragPreview } from './quickExecutionDrag'
import { WorkbenchIcon, type WorkbenchIconRole } from './WorkbenchIcons'

export function QuickExecutionProxyCard({
  preview,
  unavailableLabel
}: {
  readonly preview: DragPreview
  readonly unavailableLabel: string
}) {
  return (
    <div
      className={[
        'quick-execution__drag-proxy-card',
        preview.isUnavailable ? 'quick-execution__drag-proxy-card--unavailable' : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="quick-execution__content quick-execution__drag-proxy-content">
        <kbd>{preview.number}</kbd>
        <TypeIcon type={preview.projection.type} />
        <span className="quick-execution__copy">
          <strong>{preview.projection.name}</strong>
          {preview.isUnavailable ? <small>{unavailableLabel}</small> : null}
        </span>
      </div>
    </div>
  )
}

export function TypeIcon({ type }: { readonly type: QuickExecutionTargetSnapshot['type'] }) {
  const role: WorkbenchIconRole =
    type === 'terminal' ? 'terminal' : type === 'workflow' ? 'workflow' : 'terminal-group'
  return <WorkbenchIcon className="quick-execution__type-icon" role={role} size={13} />
}
