import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject
} from 'react'
import { flushSync } from 'react-dom'

import type { QuickExecutionSlotNumber } from '../../application/dto/BlockGraphSnapshot'
import type { QuickExecutionBindingProjection } from '../view-models/quickExecutionProjection'
import {
  blackHoleProximityThreshold,
  distanceBetweenRectangles,
  type DragPreview
} from '../view-models/quickExecutionDrag'

type DropTarget = QuickExecutionSlotNumber | 'clear' | null
interface PointerSession {
  readonly pointerId: number
  readonly source: HTMLElement
  readonly container: HTMLElement
  readonly startX: number
  readonly startY: number
  readonly preview: DragPreview
  active: boolean
}

export function useQuickExecutionPointerDrag({
  rootRef,
  blackHoleRef,
  enabled,
  scopeKey,
  onStart,
  onFinish
}: {
  readonly rootRef: RefObject<HTMLDivElement | null>
  readonly blackHoleRef: RefObject<HTMLDivElement | null>
  readonly enabled: boolean
  readonly scopeKey: string
  readonly onStart: () => void
  readonly onFinish: (preview: DragPreview, target: DropTarget) => void
}) {
  const sessionRef = useRef<PointerSession | null>(null)
  const previewRef = useRef<DragPreview | null>(null)
  const proxyRef = useRef<HTMLDivElement | null>(null)
  const targetRef = useRef<DropTarget>(null)
  const clickCleanupRef = useRef<(() => void) | null>(null)
  const [preview, setPreview] = useState<DragPreview | null>(null)
  const [target, setTarget] = useState<DropTarget>(null)
  const [nearClear, setNearClear] = useState(false)
  const [swapOffset, setSwapOffset] = useState({ x: 0, y: 0 })

  const move = (event: PointerEvent): void => {
    const session = sessionRef.current
    if (!session || event.pointerId !== session.pointerId) return
    const root = rootRef.current
    if (!root) return
    if (!session.active) {
      if (Math.hypot(event.clientX - session.startX, event.clientY - session.startY) < 4) return
      session.active = true
      try {
        session.source.setPointerCapture?.(session.pointerId)
      } catch {
        // Window listeners still own this gesture if the host cannot capture it.
      }
      flushSync(() => {
        onStart()
        setPreview(session.preview)
      })
    }
    event.preventDefault()
    event.stopPropagation()
    const bounds = root.getBoundingClientRect()
    const next = {
      ...session.preview,
      left: event.clientX - session.preview.grabOffsetX - bounds.left,
      top: event.clientY - session.preview.grabOffsetY - bounds.top
    }
    previewRef.current = next
    if (proxyRef.current)
      proxyRef.current.style.transform = `translate3d(${next.left}px, ${next.top}px, 0)`
    const clearBounds = blackHoleRef.current?.getBoundingClientRect()
    const clear = clearBounds && contains(clearBounds, event)
    const positions = [
      ...session.container.querySelectorAll<HTMLElement>('[data-quick-execution-slot]')
    ]
    const containerBounds = session.container.getBoundingClientRect()
    const outsideContainer = containerBounds.width > 0 && !contains(containerBounds, event)
    const destination =
      clear || outsideContainer
        ? undefined
        : positions.find((element) => contains(element.getBoundingClientRect(), event, 2))
    const nextTarget = clear
      ? 'clear'
      : destination
        ? (Number(destination.dataset.quickExecutionSlot) as QuickExecutionSlotNumber)
        : null
    targetRef.current = nextTarget
    setTarget(nextTarget)
    const sourceBinding = session.source.querySelector<HTMLElement>('.quick-execution__binding')
    const destinationBinding = destination?.querySelector<HTMLElement>('.quick-execution__binding')
    const sourceBounds = session.source.getBoundingClientRect()
    const destinationBounds = destination?.getBoundingClientRect()
    setSwapOffset(
      sourceBinding && destinationBinding && destinationBounds
        ? {
            x:
              sourceBounds.left +
              sourceBinding.offsetLeft -
              destinationBounds.left -
              destinationBinding.offsetLeft,
            y:
              sourceBounds.top +
              sourceBinding.offsetTop -
              destinationBounds.top -
              destinationBinding.offsetTop
          }
        : { x: 0, y: 0 }
    )
    // Horizontal sorting must not activate the removal feedback above the row.
    setNearClear(
      Boolean(
        clearBounds &&
        event.clientY < bounds.top &&
        distanceBetweenRectangles(
          {
            left: next.left + bounds.left,
            top: next.top + bounds.top,
            right: next.left + bounds.left + next.width,
            bottom: next.top + bounds.top + next.height
          },
          clearBounds
        ) <= blackHoleProximityThreshold
      )
    )
  }

  const finish = (commit: boolean, present = true): void => {
    const session = sessionRef.current
    if (!session) return
    sessionRef.current = null
    if (session.source.hasPointerCapture?.(session.pointerId))
      session.source.releasePointerCapture(session.pointerId)
    if (session.active) {
      clickCleanupRef.current?.()
      const swallowClick = (event: MouseEvent): void => {
        if (event.detail === 0) return
        event.preventDefault()
        event.stopImmediatePropagation()
        cleanup()
      }
      const cleanup = (): void => {
        window.removeEventListener('click', swallowClick, true)
        window.removeEventListener('pointerdown', cleanup, true)
        clickCleanupRef.current = null
      }
      clickCleanupRef.current = cleanup
      window.addEventListener('click', swallowClick, true)
      window.addEventListener('pointerdown', cleanup, true)
      if (present)
        onFinish(previewRef.current ?? session.preview, commit ? targetRef.current : null)
    }
    previewRef.current = null
    targetRef.current = null
    setPreview(null)
    setTarget(null)
    setNearClear(false)
    setSwapOffset({ x: 0, y: 0 })
  }

  const moveFromWindow = useEffectEvent(move)
  const finishFromWindow = useEffectEvent(finish)
  useEffect(() => {
    const pointerMove = (event: PointerEvent): void => moveFromWindow(event)
    const pointerUp = (event: PointerEvent): void => {
      if (event.pointerId !== sessionRef.current?.pointerId) return
      if (sessionRef.current.active) {
        moveFromWindow(event)
        event.preventDefault()
        event.stopPropagation()
      }
      finishFromWindow(true)
    }
    const cancel = (event: PointerEvent): void => {
      if (event.pointerId === sessionRef.current?.pointerId) finishFromWindow(false)
    }
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && sessionRef.current) {
        event.preventDefault()
        finishFromWindow(false)
      }
    }
    const blur = (): void => finishFromWindow(false)
    window.addEventListener('pointermove', pointerMove, true)
    window.addEventListener('pointerup', pointerUp, true)
    window.addEventListener('pointercancel', cancel, true)
    window.addEventListener('lostpointercapture', cancel, true)
    window.addEventListener('keydown', escape, true)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('pointermove', pointerMove, true)
      window.removeEventListener('pointerup', pointerUp, true)
      window.removeEventListener('pointercancel', cancel, true)
      window.removeEventListener('lostpointercapture', cancel, true)
      window.removeEventListener('keydown', escape, true)
      window.removeEventListener('blur', blur)
      const session = sessionRef.current
      sessionRef.current = null
      if (session?.source.hasPointerCapture?.(session.pointerId))
        session.source.releasePointerCapture(session.pointerId)
      clickCleanupRef.current?.()
    }
  }, [])
  useEffect(() => {
    finishFromWindow(false, false)
  }, [scopeKey, enabled])
  useEffect(() => {
    if (!preview) return undefined
    const cursor = document.body.style.cursor
    const selection = document.body.style.userSelect
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
    return () => {
      document.body.style.cursor = cursor
      document.body.style.userSelect = selection
    }
  }, [preview])

  const onPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    number: QuickExecutionSlotNumber,
    projection: QuickExecutionBindingProjection
  ): void => {
    if (!enabled || event.button !== 0 || sessionRef.current) return
    const container = event.currentTarget.closest<HTMLElement>('[data-quick-execution-slots]')
    const root = rootRef.current?.getBoundingClientRect()
    if (!root || !container) return
    const surface = container.dataset.quickExecutionSlots === 'arrangement' ? 'arrangement' : 'dock'
    const bounds = event.currentTarget.getBoundingClientRect()
    const glyph = event.currentTarget
      .querySelector('.quick-execution__glyph')
      ?.getBoundingClientRect()
    const left =
      surface === 'dock' && glyph?.width ? glyph.left + glyph.width / 2 - 19 : bounds.left
    const top = surface === 'dock' && glyph?.height ? glyph.top + glyph.height / 2 - 12 : bounds.top
    event.stopPropagation()
    sessionRef.current = {
      pointerId: event.pointerId,
      source: event.currentTarget,
      container,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      preview: {
        surface,
        grabOffsetX: event.clientX - left,
        grabOffsetY: event.clientY - top,
        width: surface === 'arrangement' ? bounds.width : 38,
        height: surface === 'arrangement' ? bounds.height : 24,
        left: left - root.left,
        top: top - root.top,
        originLeft: left - root.left,
        originTop: top - root.top,
        number,
        projection,
        isUnavailable: !projection.isAvailable
      }
    }
  }
  const setProxy = useCallback((element: HTMLDivElement | null): void => {
    proxyRef.current = element
  }, [])
  return { preview, setProxy, target, nearClear, swapOffset, onPointerDown }
}

function contains(
  rect: DOMRect,
  point: { clientX: number; clientY: number },
  padding = 0
): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    point.clientX >= rect.left - padding &&
    point.clientX <= rect.right + padding &&
    point.clientY >= rect.top - padding &&
    point.clientY <= rect.bottom + padding
  )
}
