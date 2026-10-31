import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  BlockGraphSnapshot,
  QuickExecutionSlotNumber,
  QuickExecutionTargetSnapshot
} from '../../application/dto/BlockGraphSnapshot'
import {
  listQuickExecutionCandidates,
  readQuickExecutionSlots,
  resolveQuickExecutionBinding
} from '../view-models/quickExecutionProjection'
import {
  createQuickExecutionReturnAnimation,
  type DragAnimation,
  type DragPreview
} from '../view-models/quickExecutionDrag'
import { QuickExecutionProxyCard } from './quickExecutionDragPresentation'
import { QuickExecutionCandidatePicker, QuickExecutionSlots } from './QuickExecutionSlots'
import blackHoleMotionUrl from '../assets/quick-execution-black-hole-motion.webm'
import blackHoleAssetUrl from '../assets/quick-execution-black-hole.png'
import { useI18n } from '../../../../presentation/i18n/useI18n'
import { AnchoredSurfaceMotion } from '../../../../presentation/shared/components/SurfaceMotion'
import { TooltipLabel } from '../../../../presentation/shared/components/Tooltip'
import { WorkbenchIcon } from '../../../../presentation/shared/components/WorkbenchIcons'
import { useOutsidePointerDismiss } from '../../../../presentation/shared/hooks/useOutsidePointerDismiss'
import { useQuickExecutionDragMotionPresentation } from '../motion/useQuickExecutionDragMotionPresentation'
import { useQuickExecutionLayoutMotion } from '../motion/useQuickExecutionLayoutMotion'
import { QuickExecutionIcon } from './QuickExecutionIcons'
import { useQuickExecutionArrangement } from './useQuickExecutionArrangement'
import { useQuickExecutionPointerDrag } from './useQuickExecutionPointerDrag'

type QuickExecutionShortcutCommand = `quickExecution${QuickExecutionSlotNumber}`
type QuickExecutionShortcutPlatform = 'mac' | 'other'

interface QuickExecutionBarProps {
  readonly isExternalDropTarget?: boolean
  readonly graph: BlockGraphSnapshot
  readonly open?: boolean
  readonly onAdd: (target: QuickExecutionTargetSnapshot) => Promise<void> | void
  readonly onClear: (number: QuickExecutionSlotNumber) => Promise<void> | void
  readonly onFocus: (target: QuickExecutionTargetSnapshot) => void
  readonly onExecute: (target: QuickExecutionTargetSnapshot) => Promise<void> | void
  readonly onExitComplete?: () => void
  readonly onReorder: (
    sourceNumber: QuickExecutionSlotNumber,
    destinationNumber: QuickExecutionSlotNumber
  ) => Promise<void> | void
  readonly shortcutPlatform?: QuickExecutionShortcutPlatform
  readonly shortcutTooltips?: Partial<Record<QuickExecutionShortcutCommand, string>>
}

interface PopoverPresentation {
  readonly open: boolean
}

export function QuickExecutionBar({
  isExternalDropTarget = false,
  graph,
  open = true,
  onAdd,
  onClear,
  onExitComplete,
  onFocus,
  onExecute,
  onReorder,
  shortcutPlatform = 'mac',
  shortcutTooltips
}: QuickExecutionBarProps) {
  const { t } = useI18n()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const blackHoleTargetRef = useRef<HTMLDivElement | null>(null)
  const blackHoleMotionRef = useRef<HTMLVideoElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const popoverTriggerRef = useRef<HTMLButtonElement | null>(null)
  const clearAnimationIdRef = useRef(0)
  const returnAnimationIdRef = useRef(0)
  const [popoverPresentation, setPopoverPresentation] = useState<PopoverPresentation | null>(null)
  const [renderedOpen, setRenderedOpen] = useState(open)
  const [dragRowWidth, setDragRowWidth] = useState<number>()
  const [clearAnimation, setClearAnimation] = useState<DragAnimation | null>(null)
  const [returnAnimation, setReturnAnimation] = useState<DragAnimation | null>(null)
  const [hoverSuspended, setHoverSuspended] = useState(false)
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
  const savedSlots = useMemo(
    () =>
      readQuickExecutionSlots(graph).map((slot) => ({
        ...slot,
        projection: slot.target ? resolveQuickExecutionBinding(graph, slot.target) : null
      })),
    [graph]
  )
  const scopeKey = `${graph.projectId}:${graph.workspaceId}:${graph.id}`
  const bindingKey = JSON.stringify(graph.quickExecutionSlots)
  const { isArranging, setIsArranging, entryRef, doneRef, finishArranging } =
    useQuickExecutionArrangement(open, popoverPresentation?.open ?? false, scopeKey)
  const [pendingSwap, setPendingSwap] = useState<{
    scopeKey: string
    bindingKey: string
    source: QuickExecutionSlotNumber
    destination: QuickExecutionSlotNumber
  } | null>(null)
  const presentedSwap =
    pendingSwap?.scopeKey === scopeKey && pendingSwap.bindingKey === bindingKey ? pendingSwap : null
  const slots = presentedSwap
    ? savedSlots.map((slot) => {
        const from =
          slot.number === presentedSwap.source
            ? presentedSwap.destination
            : slot.number === presentedSwap.destination
              ? presentedSwap.source
              : slot.number
        return { ...savedSlots.find((entry) => entry.number === from)!, number: slot.number }
      })
    : savedSlots
  const finishDrag = (
    preview: DragPreview,
    target: QuickExecutionSlotNumber | 'clear' | null
  ): void => {
    if (target === 'clear') {
      const animation = createClearAnimation(preview)
      if (animation) setClearAnimation(animation)
      void onClear(preview.number)
      return
    }
    const destination = target !== null && target !== preview.number ? target : null
    // A cancelled drag must land at the resting layout, not its hovered grab position.
    const destinationElement = rootRef.current?.querySelector<HTMLElement>(
      `[data-quick-execution-slots="${preview.surface}"] [data-quick-execution-slot="${destination ?? preview.number}"]`
    )
    const destinationBounds = destinationElement?.getBoundingClientRect()
    const destinationCenter =
      preview.surface === 'arrangement' && destinationBounds
        ? {
            x: destinationBounds.left + preview.width / 2,
            y: destinationBounds.top + preview.height / 2
          }
        : destinationElement
          ? readSlotGlyphCenter(destinationElement)
          : null
    const rootBounds = rootRef.current?.getBoundingClientRect()
    returnAnimationIdRef.current += 1
    setReturnAnimation(
      createQuickExecutionReturnAnimation(
        {
          ...preview,
          number: destination ?? preview.number,
          originLeft:
            destinationCenter && rootBounds
              ? destinationCenter.x - rootBounds.left - preview.width / 2
              : preview.originLeft,
          originTop:
            destinationCenter && rootBounds
              ? destinationCenter.y - rootBounds.top - preview.height / 2
              : preview.originTop
        },
        `quick-execution-return:${returnAnimationIdRef.current}`
      )
    )
    if (destination === null) return
    const pending = { scopeKey, bindingKey, source: preview.number, destination }
    setPendingSwap(pending)
    const complete = (): void => setPendingSwap((current) => (current === pending ? null : current))
    try {
      const result = onReorder(preview.number, destination)
      // Keep the release projection until the existing owner returns the saved graph.
      if (result) void result.then(complete, complete)
      else complete()
    } catch {
      complete()
    }
  }
  const {
    preview: dragPreview,
    target: dragTarget,
    nearClear: isNearBlackHole,
    swapOffset,
    onPointerDown,
    setProxy
  } = useQuickExecutionPointerDrag({
    rootRef,
    blackHoleRef: blackHoleTargetRef,
    enabled: open && !(pendingSwap?.scopeKey === scopeKey),
    scopeKey: `${scopeKey}:${bindingKey}:${isArranging}`,
    onStart: () => {
      setHoverSuspended(true)
      setDragRowWidth(rootRef.current?.getBoundingClientRect().width)
      setReturnAnimation(null)
      setClearAnimation(null)
    },
    onFinish: finishDrag
  })
  const draggedNumber = dragPreview?.number ?? null
  const reorderTargetNumber = typeof dragTarget === 'number' ? dragTarget : null
  const isClearTarget = dragTarget === 'clear'
  const isBlackHoleVisible = draggedNumber !== null || clearAnimation !== null
  useEffect(() => {
    if (blackHoleMotionRef.current)
      blackHoleMotionRef.current.playbackRate = isClearTarget || clearAnimation ? 1.75 : 1
  }, [isClearTarget, clearAnimation])
  const animationScope = `${scopeKey}:${open}`
  useQuickExecutionLayoutMotion(rootRef, animationScope, open && !dragPreview && !returnAnimation)
  const [renderedAnimationScope, setRenderedAnimationScope] = useState(animationScope)
  if (animationScope !== renderedAnimationScope) {
    setRenderedAnimationScope(animationScope)
    setReturnAnimation(null)
    setClearAnimation(null)
  }
  const firstEmptyNumber = slots.find((slot) => !slot.target)?.number ?? null
  const hasBindings = slots.some((slot) => slot.target)
  const showAddLabel = !hasBindings && !dragPreview && !returnAnimation && !clearAnimation
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
  const openPopover = useCallback((trigger: HTMLButtonElement): void => {
    popoverTriggerRef.current = trigger
    setPopoverPresentation({ open: true })
  }, [])
  const closePopoverAndRestoreFocus = useCallback((): void => {
    closePopover()
    popoverTriggerRef.current?.focus({ preventScroll: true })
  }, [closePopover])
  const presentedPopover = openChanged && !open ? null : popoverPresentation
  const isPopoverOpen = open && (popoverPresentation?.open ?? false)

  useOutsidePointerDismiss({
    active: isPopoverOpen,
    isInside: (target) => rootRef.current?.contains(target) ?? false,
    onDismiss: closePopoverAndRestoreFocus,
    pointerPolicy: 'consume'
  })
  useOutsidePointerDismiss({
    active: open && isArranging,
    isInside: (target) => rootRef.current?.contains(target) ?? false,
    onDismiss: finishArranging,
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
  const addTarget = (target: QuickExecutionTargetSnapshot): void => {
    closePopoverAndRestoreFocus()
    void onAdd(target)
  }
  const createClearAnimation = (preview: DragPreview): DragAnimation | null => {
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
  const renderSlots = (surface: DragPreview['surface']) => {
    const animation = dragPreview ?? returnAnimation
    return (
      <QuickExecutionSlots
        slots={slots}
        expanded={surface === 'arrangement'}
        draggedNumber={animation?.surface === surface ? animation.number : null}
        reorderTargetNumber={dragPreview?.surface === surface ? reorderTargetNumber : null}
        shortcutPlatform={shortcutPlatform}
        shortcutTooltips={shortcutTooltips}
        onFocus={onFocus}
        onExecute={onExecute}
        onPointerDown={onPointerDown}
        swapOffset={swapOffset}
        preview={dragPreview?.surface === surface ? dragPreview : null}
        pending={pendingSwap?.scopeKey === scopeKey || draggedNumber !== null}
      />
    )
  }

  return (
    <AnchoredSurfaceMotion
      ref={rootRef}
      className={['quick-execution', isExternalDropTarget ? 'quick-execution--drop-target' : '']
        .filter(Boolean)
        .join(' ')}
      data-quick-execution-bar
      style={{ width: dragPreview || returnAnimation ? dragRowWidth : undefined }}
      data-quick-execution-arranging={isArranging || undefined}
      data-quick-execution-dragging={draggedNumber !== null || undefined}
      data-quick-execution-settling={returnAnimation !== null || undefined}
      data-quick-execution-quiet-hover={hoverSuspended || undefined}
      onPointerMove={() => {
        if (!dragPreview && !returnAnimation && !clearAnimation) setHoverSuspended(false)
      }}
      onFocusCapture={() => {
        if (!dragPreview && !returnAnimation && !clearAnimation) setHoverSuspended(false)
      }}
      data-workbench-canvas-obstruction
      data-side="top"
      aria-label={t('quickExecution.label')}
      onExitComplete={onExitComplete}
      open={open}
      springPreset="bottom-control"
    >
      <AnchoredSurfaceMotion
        open={isPopoverOpen}
        onExitComplete={() => {
          setPopoverPresentation(null)
        }}
        ref={popoverRef}
        className="quick-execution__popover anchored-surface-motion"
        role="dialog"
        aria-label={t('quickExecution.chooseObject')}
      >
        {presentedPopover ? (
          <div className="quick-execution__popover-heading">
            <h3>
              {t(
                firstEmptyNumber !== null ? 'quickExecution.addFavorites' : 'quickExecution.label'
              )}
            </h3>
          </div>
        ) : null}
        {presentedPopover && firstEmptyNumber !== null ? (
          <QuickExecutionCandidatePicker candidates={candidates} onSelect={addTarget} />
        ) : null}
        {presentedPopover ? (
          <div className="quick-execution__action-list quick-execution__arrange-action">
            <button
              type="button"
              onClick={() => {
                closePopover()
                setIsArranging(true)
              }}
            >
              <WorkbenchIcon role="quick-execution-arrange" size={16} />
              <span>{t('quickExecution.arrange')}</span>
            </button>
          </div>
        ) : null}
      </AnchoredSurfaceMotion>
      <AnchoredSurfaceMotion
        open={open && isArranging}
        className="quick-execution__popover quick-execution__arrangement anchored-surface-motion"
        data-quick-execution-arrangement
        role="dialog"
        aria-label={t('quickExecution.arrange')}
      >
        <div className="quick-execution__popover-heading">
          <h3>{t('quickExecution.arrange')}</h3>
          <button
            ref={doneRef}
            className="quick-execution__done"
            type="button"
            onClick={finishArranging}
          >
            <WorkbenchIcon role="confirm" size={12} />
            {t('quickExecution.doneArranging')}
          </button>
        </div>
        <div
          className="quick-execution__arrangement-slots"
          data-quick-execution-slots="arrangement"
        >
          {renderSlots('arrangement')}
        </div>
      </AnchoredSurfaceMotion>
      <div
        className="quick-execution__slots"
        data-quick-execution-slots="dock"
        inert={isArranging}
        aria-hidden={isArranging || undefined}
      >
        {renderSlots('dock')}
      </div>
      <TooltipLabel
        disabled={draggedNumber !== null}
        content={t(
          firstEmptyNumber !== null ? 'quickExecution.addObject' : 'quickExecution.arrange'
        )}
      >
        <button
          ref={entryRef}
          className={`quick-execution__add${showAddLabel ? ' quick-execution__add--empty' : ''}`}
          type="button"
          aria-label={t(
            firstEmptyNumber !== null ? 'quickExecution.addObject' : 'quickExecution.arrange'
          )}
          aria-haspopup="dialog"
          aria-expanded={isPopoverOpen || isArranging}
          onClick={(event) => (isArranging ? finishArranging() : openPopover(event.currentTarget))}
        >
          <QuickExecutionIcon role={firstEmptyNumber !== null ? 'add' : 'more'} size={15} />
          {showAddLabel ? <span>{t('quickExecution.addFavorites')}</span> : null}
        </button>
      </TooltipLabel>
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
            right: (dragRowWidth ?? 0) - clearAnimation.targetLeft - clearAnimation.width,
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
          ref={setProxy}
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

function readSlotGlyphCenter(slot: HTMLElement): { x: number; y: number } {
  const bounds = slot.getBoundingClientRect()
  const glyph = slot.querySelector<HTMLElement>('.quick-execution__glyph')
  if (!glyph?.offsetWidth || !glyph.offsetHeight)
    return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
  let x = glyph.offsetWidth / 2 + slot.clientLeft
  let y = glyph.offsetHeight / 2 + slot.clientTop
  // Walk layout offsets so the in-flight swap transform cannot move the landing point.
  for (
    let element: HTMLElement | null = glyph;
    element && element !== slot;
    element = element.offsetParent as HTMLElement | null
  ) {
    x += element.offsetLeft
    y += element.offsetTop
  }
  return { x: bounds.left + x, y: bounds.top + y }
}
