import { useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'

type OutsidePointerDismissPolicy = 'consume' | 'passthrough'

interface UseOutsidePointerDismissOptions {
  readonly active: boolean
  readonly isInside: (target: Node) => boolean
  readonly onDismiss: () => void
  readonly pointerPolicy?: OutsidePointerDismissPolicy
}

let releaseConsumedPointerSequence: (() => void) | null = null

/**
 * Owns the ordering of an outside-pointer dismissal.
 *
 * The closing state is committed during capture so an underlying canvas target
 * never starts work while the surface is still interactive. A surface can then
 * either pass the gesture through or own its complete compatibility event chain.
 */
export function useOutsidePointerDismiss({
  active,
  isInside,
  onDismiss,
  pointerPolicy = 'passthrough'
}: UseOutsidePointerDismissOptions): void {
  const isInsideRef = useRef(isInside)
  const onDismissRef = useRef(onDismiss)
  isInsideRef.current = isInside
  onDismissRef.current = onDismiss

  useEffect(() => {
    if (!active) return undefined

    const dismissBeforeTarget = (event: PointerEvent): void => {
      const target = event.target
      if (target instanceof Node && isInsideRef.current(target)) return

      if (pointerPolicy === 'consume') consumePointerSequence(event)
      flushSync(() => onDismissRef.current())
    }

    document.addEventListener('pointerdown', dismissBeforeTarget, true)
    return () => document.removeEventListener('pointerdown', dismissBeforeTarget, true)
  }, [active, pointerPolicy])
}

function consumePointerSequence(event: PointerEvent): void {
  releaseConsumedPointerSequence?.()
  event.preventDefault()
  event.stopPropagation()

  const pointerId = event.pointerId
  let pointerUpCleanupTimer: number | null = null
  const fallbackCleanupTimer = window.setTimeout(cleanup, 1_000)

  const blockPointerUp = (followUpEvent: PointerEvent): void => {
    if (followUpEvent.pointerId !== pointerId) return
    block(followUpEvent)
    pointerUpCleanupTimer = window.setTimeout(cleanup, 0)
  }
  const blockPointerCancel = (followUpEvent: PointerEvent): void => {
    if (followUpEvent.pointerId !== pointerId) return
    block(followUpEvent)
    cleanup()
  }
  const blockCompatibilityEvent = (followUpEvent: Event): void => {
    block(followUpEvent)
  }
  const blockFinalCompatibilityEvent = (followUpEvent: Event): void => {
    block(followUpEvent)
    cleanup()
  }

  document.addEventListener('pointerup', blockPointerUp, true)
  document.addEventListener('pointercancel', blockPointerCancel, true)
  document.addEventListener('mousedown', blockCompatibilityEvent, true)
  document.addEventListener('mouseup', blockCompatibilityEvent, true)
  document.addEventListener('click', blockFinalCompatibilityEvent, true)
  document.addEventListener('auxclick', blockFinalCompatibilityEvent, true)
  document.addEventListener('contextmenu', blockFinalCompatibilityEvent, true)
  releaseConsumedPointerSequence = cleanup

  function block(followUpEvent: Event): void {
    followUpEvent.preventDefault()
    followUpEvent.stopPropagation()
  }

  function cleanup(): void {
    document.removeEventListener('pointerup', blockPointerUp, true)
    document.removeEventListener('pointercancel', blockPointerCancel, true)
    document.removeEventListener('mousedown', blockCompatibilityEvent, true)
    document.removeEventListener('mouseup', blockCompatibilityEvent, true)
    document.removeEventListener('click', blockFinalCompatibilityEvent, true)
    document.removeEventListener('auxclick', blockFinalCompatibilityEvent, true)
    document.removeEventListener('contextmenu', blockFinalCompatibilityEvent, true)
    window.clearTimeout(fallbackCleanupTimer)
    if (pointerUpCleanupTimer !== null) window.clearTimeout(pointerUpCleanupTimer)
    if (releaseConsumedPointerSequence === cleanup) releaseConsumedPointerSequence = null
  }
}
