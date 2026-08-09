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
import { AnchoredSurfaceMotion } from './SurfaceMotion'
import { TooltipLabel } from './Tooltip'
import { WorkbenchIcon, type WorkbenchIconRole } from './WorkbenchIcons'
import { useOutsidePointerDismiss } from './useOutsidePointerDismiss'

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

interface PopoverPresentation {
  readonly content: PopoverState
  readonly open: boolean
}

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
  const popoverTriggerRef = useRef<HTMLButtonElement | null>(null)
  const draggedNumberRef = useRef<QuickExecutionSlotNumber | null>(null)
  const [popoverPresentation, setPopoverPresentation] = useState<PopoverPresentation | null>(null)
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
  const closePopover = useCallback(
    (): void =>
      setPopoverPresentation((current) => (current ? { ...current, open: false } : current)),
    []
  )
  const openPopover = useCallback((content: PopoverState, trigger?: HTMLButtonElement): void => {
    if (trigger) popoverTriggerRef.current = trigger
    setPopoverPresentation({ content, open: true })
  }, [])
  const closePopoverAndRestoreFocus = useCallback((): void => {
    closePopover()
    popoverTriggerRef.current?.focus({ preventScroll: true })
  }, [closePopover])
  const presentedPopover = popoverPresentation?.content ?? null
  const isPopoverOpen = popoverPresentation?.open ?? false

  useOutsidePointerDismiss({
    active: isPopoverOpen,
    isInside: (target) => rootRef.current?.contains(target) ?? false,
    onDismiss: closePopoverAndRestoreFocus,
    pointerPolicy: 'consume'
  })

  useEffect(() => {
    if (!isPopoverOpen) return undefined
    popoverRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()

    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closePopoverAndRestoreFocus()
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [closePopoverAndRestoreFocus, isPopoverOpen])

  const bind = (
    number: QuickExecutionSlotNumber | null,
    target: QuickExecutionTargetSnapshot
  ): void => {
    closePopoverAndRestoreFocus()
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
      <AnchoredSurfaceMotion
        open={isPopoverOpen}
        onExitComplete={() => {
          setPopoverPresentation(null)
        }}
        ref={popoverRef}
        className="quick-execution__popover anchored-surface-motion"
        role="dialog"
        aria-label={
          presentedPopover
            ? t(
                presentedPopover.type === 'actions'
                  ? 'quickExecution.slotActions'
                  : 'quickExecution.chooseObject'
              )
            : undefined
        }
      >
        {presentedPopover?.type === 'candidates' ? (
          <CandidatePicker
            candidates={candidates}
            onSelect={(target) => bind(presentedPopover.number, target)}
          />
        ) : null}
        {presentedPopover?.type === 'actions' ? (
          <div className="quick-execution__action-list">
            <button
              type="button"
              onClick={() => openPopover({ type: 'candidates', number: presentedPopover.number })}
            >
              <WorkbenchIcon role="restart" size={14} />
              {t('quickExecution.rebind')}
            </button>
          </div>
        ) : null}
      </AnchoredSurfaceMotion>
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
                    onClick={(event) =>
                      openPopover({ type: 'candidates', number: null }, event.currentTarget)
                    }
                  >
                    <kbd>{slot.number}</kbd>
                    <WorkbenchIcon className="quick-execution__type-icon" role="add" size={13} />
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
                    onClick={(event) =>
                      openPopover({ type: 'actions', number: slot.number }, event.currentTarget)
                    }
                  >
                    <WorkbenchIcon role="more" size={13} />
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
        <WorkbenchIcon
          active={isTrashTarget}
          data-trash-icon-variant={isTrashTarget ? 'filled' : 'outline'}
          role="delete"
          size={18}
        />
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
  const role: WorkbenchIconRole =
    type === 'terminal' ? 'terminal' : type === 'workflow' ? 'workflow' : 'terminal-group'
  return <WorkbenchIcon className="quick-execution__type-icon" role={role} size={13} />
}
