import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Ellipsis,
  Plus,
  RotateCcw,
  TerminalSquare,
  Trash2,
  Workflow
} from 'lucide-react'
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
import { useI18n } from './i18n/useI18n'

interface QuickExecutionBarProps {
  readonly isExternalDropTarget?: boolean
  readonly graph: BlockGraphSnapshot
  readonly onAdd: (target: QuickExecutionTargetSnapshot) => Promise<void> | void
  readonly onBind: (
    number: QuickExecutionSlotNumber,
    target: QuickExecutionTargetSnapshot
  ) => Promise<void> | void
  readonly onClear: (number: QuickExecutionSlotNumber) => Promise<void> | void
  readonly onReorder: (
    sourceNumber: QuickExecutionSlotNumber,
    destinationNumber: QuickExecutionSlotNumber
  ) => Promise<void> | void
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
  onReorder
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
              {popover.number > 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    closePopover()
                    void onReorder(popover.number, (popover.number - 1) as QuickExecutionSlotNumber)
                  }}
                >
                  <ArrowLeft size={14} aria-hidden="true" />
                  {t('quickExecution.moveLeft')}
                </button>
              ) : null}
              {popover.number < 5 ? (
                <button
                  type="button"
                  onClick={() => {
                    closePopover()
                    void onReorder(popover.number, (popover.number + 1) as QuickExecutionSlotNumber)
                  }}
                >
                  <ArrowRight size={14} aria-hidden="true" />
                  {t('quickExecution.moveRight')}
                </button>
              ) : null}
              <button
                className="quick-execution__clear"
                type="button"
                onClick={() => {
                  closePopover()
                  void onClear(popover.number)
                }}
              >
                <Trash2 size={14} aria-hidden="true" />
                {t('quickExecution.clear')}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="quick-execution__slots">
        {slots.map((slot) => {
          const projection = slot.projection
          const isUnavailable = Boolean(projection && !projection.isAvailable)

          return (
            <div
              key={slot.number}
              className={[
                'quick-execution__slot',
                projection ? 'quick-execution__slot--filled' : '',
                draggedNumber === slot.number ? 'quick-execution__slot--dragging' : '',
                reorderTargetNumber === slot.number ? 'quick-execution__slot--reorder-target' : '',
                isUnavailable ? 'quick-execution__slot--unavailable' : ''
              ]
                .filter(Boolean)
                .join(' ')}
              data-quick-execution-slot={slot.number}
              draggable={Boolean(projection)}
              role={projection ? 'group' : undefined}
              aria-label={
                projection
                  ? t('quickExecution.boundSlot', {
                      name: projection.name,
                      number: slot.number
                    })
                  : undefined
              }
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
                <div className="quick-execution__content">
                  <kbd>{slot.number}</kbd>
                  <TypeIcon type={projection.type} />
                  <span className="quick-execution__copy">
                    <strong title={projection.name}>{projection.name}</strong>
                    {isUnavailable ? <small>{t('quickExecution.unavailable')}</small> : null}
                  </span>
                </div>
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
          )
        })}
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
