import type { PointerEvent } from 'react'
import type { DragPreview } from '../view-models/quickExecutionDrag'

import type {
  QuickExecutionSlotNumber,
  QuickExecutionTargetSnapshot
} from '../../application/dto/BlockGraphSnapshot'
import type {
  QuickExecutionBindingProjection,
  QuickExecutionCandidate
} from '../view-models/quickExecutionProjection'
import { useI18n } from '../../../../presentation/i18n/useI18n'
import { TooltipLabel } from '../../../../presentation/shared/components/Tooltip'
import { WorkbenchIcon } from '../../../../presentation/shared/components/WorkbenchIcons'
import { TypeIcon } from './quickExecutionDragPresentation'

interface QuickExecutionSlotsProps {
  readonly slots: readonly {
    readonly number: QuickExecutionSlotNumber
    readonly projection: QuickExecutionBindingProjection | null
  }[]
  readonly expanded: boolean
  readonly draggedNumber: QuickExecutionSlotNumber | null
  readonly reorderTargetNumber: QuickExecutionSlotNumber | null
  readonly shortcutPlatform: 'mac' | 'other'
  readonly shortcutTooltips?: Partial<Record<`quickExecution${QuickExecutionSlotNumber}`, string>>
  readonly onFocus: (target: QuickExecutionTargetSnapshot) => void
  readonly onExecute: (target: QuickExecutionTargetSnapshot) => Promise<void> | void
  readonly pending: boolean
  readonly preview: DragPreview | null
  readonly swapOffset: { readonly x: number; readonly y: number }
  readonly onPointerDown: (
    event: PointerEvent<HTMLDivElement>,
    number: QuickExecutionSlotNumber,
    projection: QuickExecutionBindingProjection
  ) => void
}

export function QuickExecutionSlots(props: QuickExecutionSlotsProps) {
  const { t } = useI18n()
  return props.slots.map((slot) => {
    if (!props.expanded && !slot.projection) return null
    const projection = slot.projection
    const swapping =
      props.preview &&
      props.reorderTargetNumber !== null &&
      props.reorderTargetNumber !== props.preview.number
    const isDestination = swapping && props.reorderTargetNumber === slot.number
    const isSource = props.draggedNumber === slot.number
    const isUnavailable = Boolean(projection && !projection.isAvailable)
    const shortcutHint =
      props.shortcutTooltips?.[`quickExecution${slot.number}`] ??
      t('quickExecution.tooltip.executeShortcut', {
        shortcut: `${props.shortcutPlatform === 'mac' ? '⌘' : 'Ctrl+'}${slot.number}`
      })
    const tooltipContent = projection
      ? t('quickExecution.tooltip.bound', {
          name: projection.name,
          shortcutHint,
          type: t(`quickExecution.type.${projection.type}`)
        })
      : t('quickExecution.tooltip.empty', { number: slot.number })

    return (
      <TooltipLabel
        key={slot.number}
        content={tooltipContent}
        disabled={props.draggedNumber !== null || props.pending}
        dismissOnDragStart
      >
        <div
          className={[
            'quick-execution__slot',
            projection ? 'quick-execution__slot--filled' : 'quick-execution__slot--empty',
            props.draggedNumber === slot.number ? 'quick-execution__slot--dragging' : '',
            props.reorderTargetNumber === slot.number
              ? 'quick-execution__slot--reorder-target'
              : '',
            isUnavailable ? 'quick-execution__slot--unavailable' : ''
          ]
            .filter(Boolean)
            .join(' ')}
          data-quick-execution-slot={slot.number}
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
          onPointerDown={
            projection ? (event) => props.onPointerDown(event, slot.number, projection) : undefined
          }
        >
          {projection ? (
            <button
              className="quick-execution__content"
              type="button"
              aria-label={t('quickExecution.boundSlot', {
                name: projection.name,
                number: slot.number
              })}
              onClick={(event) => {
                if (props.pending || props.preview) return
                // Handle the second click here so drag-release click suppression also guards execution.
                if (event.detail === 2) void props.onExecute(projection.target)
                else if (event.detail <= 1) props.onFocus(projection.target)
              }}
            >
              <kbd>{slot.number}</kbd>
              <span
                className="quick-execution__binding"
                style={{
                  transform: isDestination
                    ? `translate3d(${props.swapOffset.x}px, ${props.swapOffset.y}px, 0)`
                    : undefined,
                  visibility: isSource ? 'hidden' : undefined
                }}
              >
                <span className="quick-execution__glyph">
                  <TypeIcon type={projection.type} />
                </span>
                <span className="quick-execution__copy">
                  <strong>{projection.name}</strong>
                  {props.expanded ? (
                    <span className="quick-execution__details">
                      <small className="quick-execution__kind">
                        {t(`quickExecution.type.${projection.type}`)}
                      </small>
                      {isUnavailable ? <small>{t('quickExecution.unavailable')}</small> : null}
                    </span>
                  ) : isUnavailable ? (
                    <small>{t('quickExecution.unavailable')}</small>
                  ) : null}
                </span>
              </span>
              {props.expanded ? (
                <WorkbenchIcon className="quick-execution__grip" role="drag-handle" size={14} />
              ) : null}
            </button>
          ) : (
            <div className="quick-execution__content quick-execution__content--empty">
              <kbd>{slot.number}</kbd>
              <span className="quick-execution__binding">
                <span className="quick-execution__glyph" />
                <span className="quick-execution__copy">
                  <strong>{t('quickExecution.empty')}</strong>
                </span>
              </span>
            </div>
          )}
          {isDestination && props.preview ? (
            <span
              className="quick-execution__swap-preview"
              data-quick-execution-swap-preview
              aria-hidden="true"
            >
              <TypeIcon type={props.preview.projection.type} />
              <span className="quick-execution__copy">
                <strong>{props.preview.projection.name}</strong>
              </span>
            </span>
          ) : null}
        </div>
      </TooltipLabel>
    )
  })
}

export function QuickExecutionCandidatePicker({
  candidates,
  onSelect
}: {
  readonly candidates: readonly QuickExecutionCandidate[]
  readonly onSelect: (target: QuickExecutionTargetSnapshot) => void
}) {
  const { t } = useI18n()
  if (candidates.length === 0) {
    return <p className="quick-execution__empty-list">{t('quickExecution.noObjects')}</p>
  }
  return (
    <div className="quick-execution__picker-list">
      {candidates.map((candidate) => (
        <TooltipLabel key={candidate.key} content={candidate.name}>
          <button type="button" onClick={() => onSelect(candidate.target)}>
            <span className="quick-execution__candidate-glyph">
              <TypeIcon type={candidate.type} />
            </span>
            <span className="quick-execution__candidate-copy">
              <span>{candidate.name}</span>
              <small>{t(`quickExecution.type.${candidate.type}`)}</small>
            </span>
            <WorkbenchIcon className="quick-execution__candidate-add" role="add" size={13} />
          </button>
        </TooltipLabel>
      ))}
    </div>
  )
}
