import { Boxes, Ellipsis, Plus, RotateCcw, TerminalSquare, Workflow } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'

import type {
  BlockGraphSnapshot,
  QuickExecutionSlotNumber,
  QuickExecutionTargetSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import {
  listQuickExecutionCandidates,
  resolveQuickExecutionBinding,
  type QuickExecutionCandidate
} from './quickExecutionTargets'
import type { ApplicationShortcutTooltipLabels } from './applicationShortcutTooltips'
import {
  defaultApplicationShortcutBindings,
  formatShortcutBinding,
  type ShortcutPlatform
} from './applicationShortcuts'
import { useI18n } from './i18n/useI18n'
import { TooltipLabel } from './Tooltip'

type QuickExecutionShortcutCommand = `quickExecution${QuickExecutionSlotNumber}`

interface QuickExecutionBarProps {
  readonly isExternalDropTarget?: boolean
  readonly graph: BlockGraphSnapshot
  readonly onAdd: (target: QuickExecutionTargetSnapshot) => Promise<void> | void
  readonly onBind: (
    number: QuickExecutionSlotNumber,
    target: QuickExecutionTargetSnapshot
  ) => Promise<void> | void
  readonly onClear: (number: QuickExecutionSlotNumber) => Promise<void> | void
  readonly onFocus: (target: QuickExecutionTargetSnapshot) => void
  readonly onReorder: (
    sourceNumber: QuickExecutionSlotNumber,
    destinationNumber: QuickExecutionSlotNumber
  ) => Promise<void> | void
  readonly shortcutPlatform?: ShortcutPlatform
  readonly shortcutTooltips?: Partial<
    Pick<ApplicationShortcutTooltipLabels, QuickExecutionShortcutCommand>
  >
}

type PopoverState =
  | { readonly type: 'candidates'; readonly number: QuickExecutionSlotNumber | null }
  | { readonly type: 'actions'; readonly number: QuickExecutionSlotNumber }

export function QuickExecutionBar({
  isExternalDropTarget = false,
  graph,
  onAdd,
  onBind,
  onClear,
  onFocus,
  onReorder,
  shortcutPlatform = 'mac',
  shortcutTooltips
}: QuickExecutionBarProps) {
  const { t } = useI18n()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const draggedNumberRef = useRef<QuickExecutionSlotNumber | null>(null)
  const [popover, setPopover] = useState<PopoverState | null>(null)
  const [draggedNumber, setDraggedNumber] = useState<QuickExecutionSlotNumber | null>(null)
  const [reorderTargetNumber, setReorderTargetNumber] = useState<QuickExecutionSlotNumber | null>(
    null
  )
  const [isTrashTarget, setIsTrashTarget] = useState(false)
  const candidates = useMemo(() => listQuickExecutionCandidates(graph), [graph])
  const slots = useMemo(
    () =>
      readQuickExecutionSlots(graph).map((slot) => ({
        ...slot,
        projection: slot.target ? resolveQuickExecutionBinding(graph, slot.target) : null
      })),
    [graph]
  )
  const firstEmptyNumber = slots.find((slot) => !slot.target)?.number ?? null
  const closePopover = useCallback((): void => setPopover(null), [])

  useEffect(() => {
    if (!popover) return undefined
    popoverRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()

    const closeOnOutsidePointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return
      closePopover()
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closePopover()
    }

    document.addEventListener('pointerdown', closeOnOutsidePointerDown)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointerDown)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [closePopover, popover])

  const bind = (
    number: QuickExecutionSlotNumber | null,
    target: QuickExecutionTargetSnapshot
  ): void => {
    closePopover()
    if (number) {
      void onBind(number, target)
      return
    }
    void onAdd(target)
  }

  const resetReorder = (): void => {
    draggedNumberRef.current = null
    setDraggedNumber(null)
    setReorderTargetNumber(null)
    setIsTrashTarget(false)
  }

  const beginReorder = (
    event: DragEvent<HTMLDivElement>,
    number: QuickExecutionSlotNumber
  ): void => {
    draggedNumberRef.current = number
    setDraggedNumber(number)
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', String(number))
    }
  }

  return (
    <div
      ref={rootRef}
      className={['quick-execution', isExternalDropTarget ? 'quick-execution--drop-target' : '']
        .filter(Boolean)
        .join(' ')}
      data-quick-execution-bar
      data-workbench-canvas-obstruction
      aria-label={t('quickExecution.label')}
    >
      {popover ? (
        <div
          ref={popoverRef}
          className="quick-execution__popover"
          role="dialog"
          aria-modal="true"
          aria-label={t(
            popover.type === 'actions'
              ? 'quickExecution.slotActions'
              : 'quickExecution.chooseObject'
          )}
        >
          {popover.type === 'candidates' ? (
            <CandidatePicker
              candidates={candidates}
              onSelect={(target) => bind(popover.number, target)}
            />
          ) : null}
          {popover.type === 'actions' ? (
            <div className="quick-execution__action-list">
              <button
                type="button"
                onClick={() => setPopover({ type: 'candidates', number: popover.number })}
              >
                <RotateCcw size={14} aria-hidden="true" />
                {t('quickExecution.rebind')}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="quick-execution__slots">
        {slots.map((slot) => {
          const projection = slot.projection
          const isUnavailable = Boolean(projection && !projection.isAvailable)
          const shortcutCommand = `quickExecution${slot.number}` as QuickExecutionShortcutCommand
          const defaultShortcut = formatShortcutBinding(
            defaultApplicationShortcutBindings[shortcutCommand],
            shortcutPlatform
          ).join(shortcutPlatform === 'mac' ? '' : '+')
          const shortcutHint =
            shortcutTooltips?.[shortcutCommand] ??
            t('quickExecution.tooltip.executeShortcut', { shortcut: defaultShortcut })
          const tooltipContent = projection
            ? t('quickExecution.tooltip.bound', {
                name: projection.name,
                shortcutHint,
                type: t(`quickExecution.type.${projection.type}`)
              })
            : t('quickExecution.tooltip.empty', { number: slot.number })

          return (
            <TooltipLabel key={slot.number} content={tooltipContent}>
              <div
                className={[
                  'quick-execution__slot',
                  projection ? 'quick-execution__slot--filled' : '',
                  draggedNumber === slot.number ? 'quick-execution__slot--dragging' : '',
                  reorderTargetNumber === slot.number
                    ? 'quick-execution__slot--reorder-target'
                    : '',
                  isUnavailable ? 'quick-execution__slot--unavailable' : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-quick-execution-slot={slot.number}
                draggable={Boolean(projection)}
                onDragStart={projection ? (event) => beginReorder(event, slot.number) : undefined}
                onDragEnd={projection ? resetReorder : undefined}
                onDragOver={(event) => {
                  if (!draggedNumberRef.current) return
                  event.preventDefault()
                  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
                  setReorderTargetNumber(slot.number)
                }}
                onDragLeave={() =>
                  setReorderTargetNumber((number) => (number === slot.number ? null : number))
                }
                onDrop={(event) => {
                  const sourceNumber = draggedNumberRef.current
                  if (!sourceNumber) return
                  event.preventDefault()
                  resetReorder()
                  if (sourceNumber !== slot.number) void onReorder(sourceNumber, slot.number)
                }}
              >
                {projection ? (
                  <button
                    className="quick-execution__content"
                    type="button"
                    aria-label={t('quickExecution.boundSlot', {
                      name: projection.name,
                      number: slot.number
                    })}
                    onClick={() => onFocus(projection.target)}
                  >
                    <kbd>{slot.number}</kbd>
                    <TypeIcon type={projection.type} />
                    <span className="quick-execution__copy">
                      <strong>{projection.name}</strong>
                      {isUnavailable ? <small>{t('quickExecution.unavailable')}</small> : null}
                    </span>
                  </button>
                ) : slot.number === firstEmptyNumber ? (
                  <button
                    className="quick-execution__content quick-execution__add"
                    type="button"
                    aria-label={t('quickExecution.addObject')}
                    onClick={() => setPopover({ type: 'candidates', number: null })}
                  >
                    <kbd>{slot.number}</kbd>
                    <Plus className="quick-execution__type-icon" size={13} aria-hidden="true" />
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
                    onClick={() => setPopover({ type: 'actions', number: slot.number })}
                  >
                    <Ellipsis size={13} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </TooltipLabel>
          )
        })}
      </div>
      <div
        className={[
          'quick-execution__trash',
          draggedNumber ? 'quick-execution__trash--visible' : '',
          isTrashTarget ? 'quick-execution__trash--target' : ''
        ]
          .filter(Boolean)
          .join(' ')}
        data-quick-execution-trash
        role="region"
        aria-hidden={!draggedNumber}
        aria-label={
          draggedNumber
            ? t('quickExecution.removeDropTarget', { number: draggedNumber })
            : undefined
        }
        onDragOver={(event) => {
          if (!draggedNumberRef.current) return
          event.preventDefault()
          event.stopPropagation()
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
          setIsTrashTarget(true)
          setReorderTargetNumber(null)
        }}
        onDragLeave={() => setIsTrashTarget(false)}
        onDrop={(event) => {
          const sourceNumber = draggedNumberRef.current
          if (!sourceNumber) return
          event.preventDefault()
          event.stopPropagation()
          resetReorder()
          void onClear(sourceNumber)
        }}
      >
        <TrashDropIcon filled={isTrashTarget} />
      </div>
    </div>
  )
}

function readQuickExecutionSlots(graph: BlockGraphSnapshot): readonly {
  readonly number: QuickExecutionSlotNumber
  readonly target: QuickExecutionTargetSnapshot | null
}[] {
  return (
    graph.quickExecutionSlots ?? [
      { number: 1, target: null },
      { number: 2, target: null },
      { number: 3, target: null },
      { number: 4, target: null },
      { number: 5, target: null }
    ]
  )
}

function CandidatePicker({
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

function TypeIcon({ type }: { readonly type: QuickExecutionTargetSnapshot['type'] }) {
  const Icon = type === 'terminal' ? TerminalSquare : type === 'workflow' ? Workflow : Boxes
  return <Icon className="quick-execution__type-icon" size={13} aria-hidden="true" />
}

function TrashDropIcon({ filled }: { readonly filled: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
      data-trash-icon-variant={filled ? 'filled' : 'outline'}
    >
      {filled ? (
        <>
          <path
            d="M7 4.25v-.8C7 2.1 8.1 1 9.45 1h1.1C11.9 1 13 2.1 13 3.45v.8H7Z"
            fill="currentColor"
          />
          <path d="M4 4.5h12a.75.75 0 0 1 0 1.5H4a.75.75 0 0 1 0-1.5Z" fill="currentColor" />
          <path
            d="M5.2 6.25h9.6l-.62 9.5a2.25 2.25 0 0 1-2.24 2.1H8.06a2.25 2.25 0 0 1-2.24-2.1l-.62-9.5Z"
            fill="currentColor"
          />
        </>
      ) : (
        <>
          <path
            d="M7 4.25v-.8C7 2.1 8.1 1 9.45 1h1.1C11.9 1 13 2.1 13 3.45v.8"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4 5.25h12M5.2 6.25l.62 9.5a2.25 2.25 0 0 0 2.24 2.1h3.88a2.25 2.25 0 0 0 2.24-2.1l.62-9.5M8.15 8.25v6.5M11.85 8.25v6.5"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  )
}
