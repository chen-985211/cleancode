import type { DragEvent } from 'react'

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
import { QuickExecutionIcon } from './QuickExecutionIcons'
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
  readonly onActions: (number: QuickExecutionSlotNumber, trigger: HTMLButtonElement) => void
  readonly onDragStart: (
    event: DragEvent<HTMLDivElement>,
    number: QuickExecutionSlotNumber,
    projection: QuickExecutionBindingProjection
  ) => void
  readonly onDrag: (event: DragEvent<HTMLDivElement>) => void
  readonly onDragEnd: () => void
  readonly onDragOver: (event: DragEvent<HTMLDivElement>, number: QuickExecutionSlotNumber) => void
  readonly onDragLeave: (number: QuickExecutionSlotNumber) => void
  readonly onDrop: (event: DragEvent<HTMLDivElement>, number: QuickExecutionSlotNumber) => void
}

export function QuickExecutionSlots(props: QuickExecutionSlotsProps) {
  const { t } = useI18n()
  return props.slots
    .filter((slot) => props.expanded || slot.projection)
    .map((slot) => {
      const projection = slot.projection
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
        <TooltipLabel key={slot.number} content={tooltipContent} dismissOnDragStart>
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
            draggable={Boolean(projection)}
            onDragStart={
              projection ? (event) => props.onDragStart(event, slot.number, projection) : undefined
            }
            onDrag={projection ? props.onDrag : undefined}
            onDragEnd={projection ? props.onDragEnd : undefined}
            onDragOver={(event) => props.onDragOver(event, slot.number)}
            onDragLeave={() => props.onDragLeave(slot.number)}
            onDrop={(event) => props.onDrop(event, slot.number)}
          >
            {projection ? (
              <button
                className="quick-execution__content"
                type="button"
                aria-label={t('quickExecution.boundSlot', {
                  name: projection.name,
                  number: slot.number
                })}
                onClick={() => props.onFocus(projection.target)}
              >
                <TypeIcon type={projection.type} />
                <span className="quick-execution__copy">
                  <strong>{projection.name}</strong>
                  {isUnavailable ? <small>{t('quickExecution.unavailable')}</small> : null}
                </span>
                <kbd>{slot.number}</kbd>
              </button>
            ) : (
              <div className="quick-execution__content quick-execution__content--empty">
                <kbd>{slot.number}</kbd>
              </div>
            )}
            {projection ? (
              <button
                className="quick-execution__more"
                type="button"
                draggable={false}
                aria-label={t('quickExecution.openSlotActions', { number: slot.number })}
                onClick={(event) => props.onActions(slot.number, event.currentTarget)}
              >
                <QuickExecutionIcon role="more" size={13} />
              </button>
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
        <button key={candidate.key} type="button" onClick={() => onSelect(candidate.target)}>
          <TypeIcon type={candidate.type} />
          <span title={candidate.name}>{candidate.name}</span>
          <small>{t(`quickExecution.type.${candidate.type}`)}</small>
        </button>
      ))}
    </div>
  )
}
