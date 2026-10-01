import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type DragEvent
} from 'react'
import { flushSync } from 'react-dom'

import type {
  BlockGraphSnapshot,
  QuickExecutionSlotNumber,
  QuickExecutionTargetSnapshot
} from '../../application/dto/BlockGraphSnapshot'
import {
  listQuickExecutionCandidates,
  readQuickExecutionSlots,
  resolveQuickExecutionBinding,
  type QuickExecutionBindingProjection
} from '../view-models/quickExecutionProjection'
import {
  blackHoleProximityThreshold,
  createQuickExecutionReturnAnimation,
  distanceBetweenRectangles,
  isQuickExecutionDropTarget,
  type DragAnimation,
  type DragPreview,
  type DragPreviewGeometry
} from '../view-models/quickExecutionDrag'
import { QuickExecutionProxyCard } from './quickExecutionDragPresentation'
import { QuickExecutionCandidatePicker, QuickExecutionSlots } from './QuickExecutionSlots'
import blackHoleMotionUrl from '../assets/quick-execution-black-hole-motion.webm'
import blackHoleAssetUrl from '../assets/quick-execution-black-hole.png'
import { useI18n } from '../../../../presentation/i18n/useI18n'
import { AnchoredSurfaceMotion } from '../../../../presentation/shared/components/SurfaceMotion'
import { TooltipLabel } from '../../../../presentation/shared/components/Tooltip'
import { useOutsidePointerDismiss } from '../../../../presentation/shared/hooks/useOutsidePointerDismiss'
import { useQuickExecutionDragMotionPresentation } from '../motion/useQuickExecutionDragMotionPresentation'
import { QuickExecutionIcon } from './QuickExecutionIcons'
import { useQuickExecutionArrangement } from './useQuickExecutionArrangement'

type QuickExecutionShortcutCommand = `quickExecution${QuickExecutionSlotNumber}`
type QuickExecutionShortcutPlatform = 'mac' | 'other'

interface QuickExecutionBarProps {
  readonly isExternalDropTarget?: boolean
  readonly graph: BlockGraphSnapshot
  readonly open?: boolean
  readonly onAdd: (target: QuickExecutionTargetSnapshot) => Promise<void> | void
  readonly onBind: (
    number: QuickExecutionSlotNumber,
    target: QuickExecutionTargetSnapshot
  ) => Promise<void> | void
  readonly onClear: (number: QuickExecutionSlotNumber) => Promise<void> | void
  readonly onFocus: (target: QuickExecutionTargetSnapshot) => void
  readonly onExitComplete?: () => void
  readonly onReorder: (
    sourceNumber: QuickExecutionSlotNumber,
    destinationNumber: QuickExecutionSlotNumber
  ) => Promise<void> | void
  readonly shortcutPlatform?: QuickExecutionShortcutPlatform
  readonly shortcutTooltips?: Partial<Record<QuickExecutionShortcutCommand, string>>
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
  open = true,
  onAdd,
  onBind,
  onClear,
  onExitComplete,
  onFocus,
  onReorder,
  shortcutPlatform = 'mac',
  shortcutTooltips
}: QuickExecutionBarProps) {
  const { t } = useI18n()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const blackHoleTargetRef = useRef<HTMLDivElement | null>(null)
  const blackHoleMotionRef = useRef<HTMLVideoElement | null>(null)
  const nativeDragImageRef = useRef<HTMLCanvasElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const popoverTriggerRef = useRef<HTMLButtonElement | null>(null)
  const draggedNumberRef = useRef<QuickExecutionSlotNumber | null>(null)
  const dragPreviewGeometryRef = useRef<DragPreviewGeometry | null>(null)
  const dragPreviewRef = useRef<DragPreview | null>(null)
  const clearAnimationIdRef = useRef(0)
  const returnAnimationIdRef = useRef(0)
  const [popoverPresentation, setPopoverPresentation] = useState<PopoverPresentation | null>(null)
  const [renderedOpen, setRenderedOpen] = useState(open)
  const [dragRowWidth, setDragRowWidth] = useState<number | undefined>(undefined)
  const [isClearTargetAbove, setIsClearTargetAbove] = useState(false)
  const [draggedNumber, setDraggedNumber] = useState<QuickExecutionSlotNumber | null>(null)
  const [reorderTargetNumber, setReorderTargetNumber] = useState<QuickExecutionSlotNumber | null>(
    null
  )
  const [isClearTarget, setIsClearTarget] = useState(false)
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null)
  const [isNearBlackHole, setIsNearBlackHole] = useState(false)
  const [clearAnimation, setClearAnimation] = useState<DragAnimation | null>(null)
  const [returnAnimation, setReturnAnimation] = useState<DragAnimation | null>(null)
  const isBlackHoleVisible = draggedNumber !== null || clearAnimation !== null
  const completeClearAnimation = (motionId: string): void => {
    setClearAnimation((current) => (current?.motion.id === motionId ? null : current))
    if (blackHoleMotionRef.current) blackHoleMotionRef.current.playbackRate = 1
  }
  const {
    className: clearMotionClassName,
    onAnimationEnd: onClearMotionAnimationEnd,
    surfaceRef: clearMotionSurfaceRef
  } = useQuickExecutionDragMotionPresentation(clearAnimation?.motion, completeClearAnimation)
  const completeReturnAnimation = useCallback((motionId: string): void => {
    setReturnAnimation((current) => (current?.motion.id === motionId ? null : current))
  }, [])
  const {
    className: returnMotionClassName,
    onAnimationEnd: onReturnMotionAnimationEnd,
    surfaceRef: returnMotionSurfaceRef
  } = useQuickExecutionDragMotionPresentation(returnAnimation?.motion, completeReturnAnimation)
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
  const { isArranging, setIsArranging, entryRef, doneRef, finishArranging } =
    useQuickExecutionArrangement(open, popoverPresentation?.open ?? false)
  const expanded =
    isArranging ||
    isExternalDropTarget ||
    draggedNumber !== null ||
    returnAnimation !== null ||
    clearAnimation !== null
  const closePopover = useCallback(
    (): void =>
      setPopoverPresentation((current) => (current ? { ...current, open: false } : current)),
    []
  )
  const openChanged = renderedOpen !== open
  if (openChanged) {
    setRenderedOpen(open)
    if (!open && popoverPresentation) setPopoverPresentation(null)
    if (!open && isArranging) setIsArranging(false)
  }
  const openPopover = useCallback((content: PopoverState, trigger?: HTMLButtonElement): void => {
    if (trigger) popoverTriggerRef.current = trigger
    setPopoverPresentation({ content, open: true })
  }, [])
  const closePopoverAndRestoreFocus = useCallback((): void => {
    closePopover()
    popoverTriggerRef.current?.focus({ preventScroll: true })
  }, [closePopover])
  const presentedPopover = openChanged && !open ? null : (popoverPresentation?.content ?? null)
  const isPopoverOpen = open && (popoverPresentation?.open ?? false)

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
    dragPreviewGeometryRef.current = null
    dragPreviewRef.current = null
    setDraggedNumber(null)
    setDragPreview(null)
    setIsNearBlackHole(false)
    setReorderTargetNumber(null)
    setIsClearTarget(false)
    if (blackHoleMotionRef.current) blackHoleMotionRef.current.playbackRate = 1
  }

  const returnReorder = (): void => {
    const preview = dragPreviewRef.current
    if (!preview) {
      resetReorder()
      return
    }

    returnAnimationIdRef.current += 1
    setReturnAnimation(
      createQuickExecutionReturnAnimation(
        preview,
        `quick-execution-return:${returnAnimationIdRef.current}`
      )
    )
    resetReorder()
  }
  const returnReorderFromDocument = useEffectEvent(returnReorder)

  useEffect(() => {
    const acceptInternalDrag = (event: globalThis.DragEvent): void => {
      if (!draggedNumberRef.current) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    }
    const returnFromInvalidDrop = (event: globalThis.DragEvent): void => {
      if (!draggedNumberRef.current || isQuickExecutionDropTarget(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      returnReorderFromDocument()
    }

    document.addEventListener('dragover', acceptInternalDrag, true)
    document.addEventListener('drop', returnFromInvalidDrop, true)
    return () => {
      document.removeEventListener('dragover', acceptInternalDrag, true)
      document.removeEventListener('drop', returnFromInvalidDrop, true)
    }
  }, [])

  const beginReorder = (
    event: DragEvent<HTMLDivElement>,
    number: QuickExecutionSlotNumber,
    projection: QuickExecutionBindingProjection
  ): void => {
    const sourceElement = event.currentTarget
    const sourceBounds = sourceElement.getBoundingClientRect()
    // Reveal drop positions before measuring the new host. The proxy keeps
    // its original screen position and size while the row gains empty slots.
    flushSync(() => {
      setDragRowWidth(undefined)
      setIsClearTargetAbove(false)
      setDraggedNumber(number)
    })
    const rootBounds = rootRef.current?.getBoundingClientRect()
    setDragRowWidth(rootBounds?.width)
    const availableRight =
      rootRef.current?.parentElement?.getBoundingClientRect().right ?? window.innerWidth
    const clearTargetRight = blackHoleTargetRef.current?.getBoundingClientRect().right ?? 0
    setIsClearTargetAbove(clearTargetRight > availableRight - 14)
    const destinationBounds = sourceElement.getBoundingClientRect()
    const clientX = event.clientX || sourceBounds.left + sourceBounds.width / 2
    const clientY = event.clientY || sourceBounds.top + sourceBounds.height / 2
    const geometry = {
      grabOffsetX: Math.min(Math.max(clientX - sourceBounds.left, 0), sourceBounds.width),
      grabOffsetY: Math.min(Math.max(clientY - sourceBounds.top, 0), sourceBounds.height),
      height: sourceBounds.height,
      width: sourceBounds.width
    }
    const originLeft =
      destinationBounds.left -
      (rootBounds?.left ?? 0) +
      (destinationBounds.width - sourceBounds.width) / 2
    const originTop = destinationBounds.top - (rootBounds?.top ?? 0)
    const preview = {
      ...geometry,
      isUnavailable: !projection.isAvailable,
      left: sourceBounds.left - (rootBounds?.left ?? 0),
      number,
      originLeft,
      originTop,
      projection,
      top: sourceBounds.top - (rootBounds?.top ?? 0)
    }

    draggedNumberRef.current = number
    dragPreviewGeometryRef.current = geometry
    dragPreviewRef.current = preview
    setReturnAnimation(null)
    setDragPreview(preview)
    setIsNearBlackHole(false)
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('application/x-cleancode-quick-execution-slot', String(number))
      if (nativeDragImageRef.current) {
        event.dataTransfer.setDragImage?.(nativeDragImageRef.current, 0, 0)
      }
    }
  }

  const updateDragPreview = (event: DragEvent<HTMLDivElement>): void => {
    const geometry = dragPreviewGeometryRef.current
    const rootBounds = rootRef.current?.getBoundingClientRect()
    if (!geometry || !rootBounds || (event.clientX === 0 && event.clientY === 0)) return

    const previewBounds = {
      bottom: event.clientY - geometry.grabOffsetY + geometry.height,
      left: event.clientX - geometry.grabOffsetX,
      right: event.clientX - geometry.grabOffsetX + geometry.width,
      top: event.clientY - geometry.grabOffsetY
    }
    const blackHoleBounds = blackHoleTargetRef.current?.getBoundingClientRect()

    const currentPreview = dragPreviewRef.current
    if (currentPreview) {
      const nextPreview = {
        ...currentPreview,
        left: previewBounds.left - rootBounds.left,
        top: previewBounds.top - rootBounds.top
      }
      dragPreviewRef.current = nextPreview
      setDragPreview(nextPreview)
    }
    setIsNearBlackHole(
      blackHoleBounds
        ? distanceBetweenRectangles(previewBounds, blackHoleBounds) <= blackHoleProximityThreshold
        : false
    )
  }

  const activateClearTarget = (event: DragEvent<HTMLDivElement>): void => {
    if (!draggedNumberRef.current) return
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    if (blackHoleMotionRef.current) blackHoleMotionRef.current.playbackRate = 1.75
    setIsClearTarget(true)
    setIsNearBlackHole(true)
    setReorderTargetNumber(null)
  }

  const createClearAnimation = (): DragAnimation | null => {
    const preview = dragPreviewRef.current
    const rootBounds = rootRef.current?.getBoundingClientRect()
    const blackHoleBounds = blackHoleTargetRef.current?.getBoundingClientRect()
    if (!preview || !rootBounds || !blackHoleBounds) return null

    const targetLeft =
      blackHoleBounds.left - rootBounds.left + (blackHoleBounds.width - preview.width) / 2
    const targetTop =
      blackHoleBounds.top - rootBounds.top + (blackHoleBounds.height - preview.height) / 2
    clearAnimationIdRef.current += 1

    return {
      ...preview,
      motion: {
        id: `quick-execution-clear:${clearAnimationIdRef.current}`,
        kind: 'delete',
        offset: {
          x: preview.left - targetLeft,
          y: preview.top - targetTop
        },
        scale: { from: 1, to: 0 }
      },
      targetLeft,
      targetTop
    }
  }

  return (
    <AnchoredSurfaceMotion
      ref={rootRef}
      className={[
        'quick-execution',
        isExternalDropTarget ? 'quick-execution--drop-target' : '',
        isClearTargetAbove ? 'quick-execution--clear-above' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      data-quick-execution-bar
      style={{
        width:
          draggedNumber !== null || returnAnimation || clearAnimation ? dragRowWidth : undefined
      }}
      data-workbench-canvas-obstruction
      data-side="top"
      aria-label={t('quickExecution.label')}
      onExitComplete={onExitComplete}
      open={open}
      springPreset="bottom-control"
    >
      <canvas
        ref={nativeDragImageRef}
        className="quick-execution__native-drag-image"
        data-quick-execution-native-drag-image
        width={1}
        height={1}
        aria-hidden="true"
      />
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
        {presentedPopover?.type === 'candidates' &&
        (presentedPopover.number !== null || firstEmptyNumber !== null) ? (
          <QuickExecutionCandidatePicker
            candidates={candidates}
            onSelect={(target) => bind(presentedPopover.number, target)}
          />
        ) : null}
        {presentedPopover?.type === 'candidates' && presentedPopover.number === null ? (
          <div className="quick-execution__action-list quick-execution__arrange-action">
            <button
              type="button"
              onClick={() => {
                closePopover()
                setIsArranging(true)
              }}
            >
              {t('quickExecution.arrange')}
            </button>
          </div>
        ) : null}
        {presentedPopover?.type === 'actions' ? (
          <div className="quick-execution__action-list">
            <button
              type="button"
              onClick={() => openPopover({ type: 'candidates', number: presentedPopover.number })}
            >
              <QuickExecutionIcon role="rebind" size={14} />
              {t('quickExecution.rebind')}
            </button>
          </div>
        ) : null}
      </AnchoredSurfaceMotion>
      {isArranging ? (
        <button
          ref={doneRef}
          className="quick-execution__done"
          type="button"
          onClick={finishArranging}
        >
          {t('quickExecution.doneArranging')}
        </button>
      ) : null}
      <div className="quick-execution__slots">
        <QuickExecutionSlots
          slots={slots}
          expanded={expanded}
          draggedNumber={draggedNumber ?? returnAnimation?.number ?? null}
          reorderTargetNumber={reorderTargetNumber}
          shortcutPlatform={shortcutPlatform}
          shortcutTooltips={shortcutTooltips}
          onFocus={onFocus}
          onActions={(number, trigger) => openPopover({ type: 'actions', number }, trigger)}
          onDragStart={beginReorder}
          onDrag={updateDragPreview}
          onDragEnd={returnReorder}
          onDragOver={(event, number) => {
            if (!draggedNumberRef.current) return
            event.preventDefault()
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
            setReorderTargetNumber(number)
          }}
          onDragLeave={(number) =>
            setReorderTargetNumber((current) => (current === number ? null : current))
          }
          onDrop={(event, number) => {
            const sourceNumber = draggedNumberRef.current
            if (!sourceNumber) return
            event.preventDefault()
            resetReorder()
            if (sourceNumber !== number) void onReorder(sourceNumber, number)
          }}
        />
        <TooltipLabel
          content={t(
            firstEmptyNumber !== null ? 'quickExecution.addObject' : 'quickExecution.arrange'
          )}
        >
          <button
            ref={entryRef}
            className={`quick-execution__add${slots.every((slot) => !slot.target) ? ' quick-execution__add--empty' : ''}`}
            type="button"
            aria-label={t(
              firstEmptyNumber !== null ? 'quickExecution.addObject' : 'quickExecution.arrange'
            )}
            aria-haspopup="dialog"
            aria-expanded={
              isPopoverOpen &&
              presentedPopover?.type === 'candidates' &&
              presentedPopover.number === null
            }
            onClick={(event) =>
              openPopover({ type: 'candidates', number: null }, event.currentTarget)
            }
          >
            <QuickExecutionIcon role={firstEmptyNumber !== null ? 'add' : 'more'} size={15} />
            {slots.every((slot) => !slot.target) ? (
              <span>{t('quickExecution.addFavorites')}</span>
            ) : null}
          </button>
        </TooltipLabel>
      </div>
      {clearAnimation ? (
        <div
          ref={clearMotionSurfaceRef}
          className={['quick-execution__clear-animation', clearMotionClassName]
            .filter(Boolean)
            .join(' ')}
          data-quick-execution-clear-animation
          data-quick-execution-clear-motion={clearAnimation.motion.id}
          aria-hidden="true"
          onAnimationEnd={onClearMotionAnimationEnd}
          style={{
            height: clearAnimation.height,
            left: clearAnimation.targetLeft,
            top: clearAnimation.targetTop,
            width: clearAnimation.width
          }}
        >
          <QuickExecutionProxyCard
            preview={clearAnimation}
            unavailableLabel={t('quickExecution.unavailable')}
          />
        </div>
      ) : null}
      {returnAnimation ? (
        <div
          ref={returnMotionSurfaceRef}
          className={['quick-execution__return-animation', returnMotionClassName]
            .filter(Boolean)
            .join(' ')}
          data-quick-execution-return-animation
          data-quick-execution-return-motion={returnAnimation.motion.id}
          aria-hidden="true"
          onAnimationEnd={onReturnMotionAnimationEnd}
          style={{
            height: returnAnimation.height,
            left: returnAnimation.targetLeft,
            top: returnAnimation.targetTop,
            width: returnAnimation.width
          }}
        >
          <QuickExecutionProxyCard
            preview={returnAnimation}
            unavailableLabel={t('quickExecution.unavailable')}
          />
        </div>
      ) : null}
      {dragPreview ? (
        <div
          className={[
            'quick-execution__drag-proxy',
            isNearBlackHole ? 'quick-execution__drag-proxy--near-black-hole' : ''
          ]
            .filter(Boolean)
            .join(' ')}
          data-quick-execution-drag-proxy
          aria-hidden="true"
          style={{
            height: dragPreview.height,
            transform: `translate3d(${dragPreview.left}px, ${dragPreview.top}px, 0)`,
            width: dragPreview.width
          }}
        >
          <QuickExecutionProxyCard
            preview={dragPreview}
            unavailableLabel={t('quickExecution.unavailable')}
          />
        </div>
      ) : null}
      <div
        ref={blackHoleTargetRef}
        className={[
          'quick-execution__black-hole',
          isBlackHoleVisible ? 'quick-execution__black-hole--visible' : '',
          isClearTarget || clearAnimation ? 'quick-execution__black-hole--target' : '',
          clearAnimation ? 'quick-execution__black-hole--clearing' : ''
        ]
          .filter(Boolean)
          .join(' ')}
        data-quick-execution-clear-target="black-hole"
        data-quick-execution-trash
        role="region"
        aria-hidden={!draggedNumber}
        aria-label={
          draggedNumber
            ? t(
                isClearTarget
                  ? 'quickExecution.releaseDropTarget'
                  : 'quickExecution.removeDropTarget',
                { number: draggedNumber }
              )
            : undefined
        }
        onDragEnter={activateClearTarget}
        onDragOver={activateClearTarget}
        onDragLeave={() => {
          if (blackHoleMotionRef.current) blackHoleMotionRef.current.playbackRate = 1
          setIsClearTarget(false)
        }}
        onDrop={(event) => {
          const sourceNumber = draggedNumberRef.current
          if (!sourceNumber) return
          event.preventDefault()
          event.stopPropagation()
          const animation = createClearAnimation()
          resetReorder()
          if (animation) {
            setClearAnimation(animation)
            if (blackHoleMotionRef.current) blackHoleMotionRef.current.playbackRate = 1.75
          }
          void onClear(sourceNumber)
        }}
      >
        {isClearTarget && draggedNumber ? (
          <span className="quick-execution__black-hole-hint" aria-hidden="true">
            {t('quickExecution.releaseDropTarget', { number: draggedNumber })}
          </span>
        ) : null}
        {/* Keep hidden media out of the compositor during the bar's entrance. */}
        {isBlackHoleVisible ? (
          <span className="quick-execution__black-hole-visual" aria-hidden="true">
            <img
              className="quick-execution__black-hole-image"
              data-quick-execution-black-hole
              src={blackHoleAssetUrl}
              alt=""
              draggable={false}
            />
            <video
              ref={blackHoleMotionRef}
              className="quick-execution__black-hole-motion"
              data-quick-execution-black-hole-motion
              src={blackHoleMotionUrl}
              poster={blackHoleAssetUrl}
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              onCanPlay={(event) => {
                event.currentTarget.playbackRate = isClearTarget || clearAnimation ? 1.75 : 1
              }}
            />
          </span>
        ) : null}
      </div>
    </AnchoredSurfaceMotion>
  )
}
