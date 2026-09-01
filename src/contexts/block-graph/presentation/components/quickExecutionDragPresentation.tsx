import type { QuickExecutionTargetSnapshot } from '../../application/dto/BlockGraphSnapshot'
import type { DragPreview } from '../view-models/quickExecutionDrag'
import { QuickExecutionIcon, type QuickExecutionIconRole } from './QuickExecutionIcons'

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
  const role: QuickExecutionIconRole =
    type === 'terminal' ? 'terminal' : type === 'workflow' ? 'workflow' : 'terminal-group'
  return <QuickExecutionIcon className="quick-execution__type-icon" role={role} size={13} />
}
