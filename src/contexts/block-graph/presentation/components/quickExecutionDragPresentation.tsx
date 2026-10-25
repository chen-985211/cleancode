import type { QuickExecutionTargetSnapshot } from '../../application/dto/BlockGraphSnapshot'
import type { DragPreview } from '../view-models/quickExecutionDrag'
import { QuickExecutionIcon, type QuickExecutionIconRole } from './QuickExecutionIcons'
import { WorkbenchIcon } from '../../../../presentation/shared/components/WorkbenchIcons'
import { useI18n } from '../../../../presentation/i18n/useI18n'

export function QuickExecutionProxyCard({
  preview,
  unavailableLabel
}: {
  readonly preview: DragPreview
  readonly unavailableLabel: string
}) {
  const { t } = useI18n()
  const isRow = preview.surface === 'arrangement'
  return (
    <div
      className={[
        'quick-execution__drag-proxy-card',
        isRow ? 'quick-execution__drag-proxy-card--row' : '',
        preview.isUnavailable ? 'quick-execution__drag-proxy-card--unavailable' : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        className={`quick-execution__content quick-execution__drag-proxy-content${isRow ? ' quick-execution__drag-proxy-content--row' : ''}`}
      >
        {isRow ? <kbd>{preview.number}</kbd> : null}
        <span className="quick-execution__binding">
          <span className="quick-execution__glyph">
            <TypeIcon type={preview.projection.type} />
          </span>
          <span className="quick-execution__copy">
            <strong>{preview.projection.name}</strong>
            {isRow ? (
              <span className="quick-execution__details">
                <small className="quick-execution__kind">
                  {t(`quickExecution.type.${preview.projection.type}`)}
                </small>
                {preview.isUnavailable ? <small>{unavailableLabel}</small> : null}
              </span>
            ) : preview.isUnavailable ? (
              <small>{unavailableLabel}</small>
            ) : null}
          </span>
        </span>
        {isRow ? (
          <WorkbenchIcon className="quick-execution__grip" role="drag-handle" size={14} />
        ) : null}
      </div>
    </div>
  )
}

export function TypeIcon({ type }: { readonly type: QuickExecutionTargetSnapshot['type'] }) {
  const role: QuickExecutionIconRole =
    type === 'terminal' ? 'terminal' : type === 'workflow' ? 'workflow' : 'terminal-group'
  return <QuickExecutionIcon className="quick-execution__type-icon" role={role} size={13} />
}
