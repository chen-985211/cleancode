import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type PointerEvent
} from 'react'

const restingInteraction = { focused: false, hovered: false, pinned: false, suppressed: false }

export function useNotificationStackInteraction(openIds: readonly string[]) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const focusedMessageRef = useRef<string | null>(null)
  const focusedElementRef = useRef<HTMLElement | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const suppressNextFocusRef = useRef(false)
  const inputOriginRef = useRef<'notification' | 'other'>('other')
  const inspectingRef = useRef(false)
  const [interaction, setInteraction] = useState(restingInteraction)
  const hidden = useSyncExternalStore(subscribeVisibility, documentHidden, () => false)
  const inspecting = interaction.focused || interaction.hovered || interaction.pinned
  const expanded = inspecting && !interaction.suppressed
  if (openIds.length === 0 && inspecting) setInteraction(restingInteraction)

  useLayoutEffect(() => {
    inspectingRef.current = inspecting
  }, [inspecting])

  useEffect(() => {
    const isNotification = (target: EventTarget | null): boolean =>
      target instanceof Node && viewportRef.current?.contains(target) === true
    const isCanvas = (target: EventTarget | null): boolean =>
      target instanceof Element && target.closest('.canvas-surface, .app-shell__workspace') !== null
    const collapse = (): void => {
      inspectingRef.current = false
      focusedMessageRef.current = null
      focusedElementRef.current = null
      suppressNextFocusRef.current = false
      setInteraction({ ...restingInteraction, suppressed: true })
      viewportRef.current?.scrollTo?.({ top: 0 })
    }
    const onPointerInput = (event: Event): void => {
      const notificationInput = isNotification(event.target)
      inputOriginRef.current = notificationInput ? 'notification' : 'other'
      if (inspectingRef.current && !notificationInput && isCanvas(event.target)) collapse()
    }
    const onKeyboardInput = (event: Event): void => {
      inputOriginRef.current = 'other'
      if (inspectingRef.current && !isNotification(event.target) && isCanvas(event.target))
        collapse()
    }
    const onFocus = (event: Event): void => {
      // Notification navigation can focus an Agent asynchronously. Only new canvas input
      // ends the inspection; the focus transfer belonging to that navigation does not.
      if (
        inspectingRef.current &&
        inputOriginRef.current !== 'notification' &&
        !isNotification(event.target) &&
        isCanvas(event.target)
      )
        collapse()
    }
    const pointerEvents = ['pointerdown', 'touchstart', 'wheel'] as const
    for (const type of pointerEvents)
      document.addEventListener(type, onPointerInput, { capture: true, passive: true })
    document.addEventListener('keydown', onKeyboardInput, true)
    document.addEventListener('focusin', onFocus, true)
    return () => {
      for (const type of pointerEvents) document.removeEventListener(type, onPointerInput, true)
      document.removeEventListener('keydown', onKeyboardInput, true)
      document.removeEventListener('focusin', onFocus, true)
    }
  }, [])

  useLayoutEffect(() => {
    const previousId = focusedMessageRef.current
    if (!previousId || (openIds.includes(previousId) && focusedElementRef.current?.isConnected))
      return
    focusedMessageRef.current = null
    focusedElementRef.current = null
    const active = document.activeElement
    if (active !== document.body && active && !viewportRef.current?.contains(active)) return
    const next =
      toggleRef.current ??
      viewportRef.current?.querySelector<HTMLButtonElement>(
        '.notification-stack-item:not([inert]) .notification-card__dismiss'
      ) ??
      returnFocusRef.current
    if (!next?.isConnected) return
    suppressNextFocusRef.current = !expanded
    if (!expanded) setInteraction((current) => ({ ...current, suppressed: true }))
    next.focus({ preventScroll: true })
    if (viewportRef.current?.contains(next))
      next.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [expanded, openIds])

  const onFocusCapture = (event: FocusEvent<HTMLDivElement>): void => {
    if (
      event.relatedTarget instanceof HTMLElement &&
      event.relatedTarget !== document.body &&
      !event.currentTarget.contains(event.relatedTarget)
    ) {
      returnFocusRef.current = event.relatedTarget
    }
    focusedMessageRef.current =
      event.target.closest<HTMLElement>('[data-notification-id]')?.dataset.notificationId ?? null
    focusedElementRef.current = event.target
    const preserveSuppression = suppressNextFocusRef.current
    suppressNextFocusRef.current = false
    inspectingRef.current = true
    setInteraction((current) => ({
      ...current,
      focused: true,
      suppressed: preserveSuppression ? current.suppressed : false
    }))
  }
  const onBlurCapture = (event: FocusEvent<HTMLDivElement>): void => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))
      return
    if (focusedMessageRef.current && !openIds.includes(focusedMessageRef.current)) return
    focusedMessageRef.current = null
    focusedElementRef.current = null
    setInteraction((current) => ({
      ...current,
      focused: false
    }))
  }
  const onPointerEnter = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.pointerType === 'touch') return
    inspectingRef.current = true
    setInteraction((current) => ({ ...current, hovered: true, suppressed: false }))
  }
  const onPointerLeave = (): void => {
    setInteraction((current) => ({
      ...current,
      hovered: false
    }))
  }
  const onExpand = (): void => {
    inputOriginRef.current = 'notification'
    inspectingRef.current = true
    setInteraction((current) =>
      current.pinned && !current.suppressed
        ? current
        : { ...current, pinned: true, suppressed: false }
    )
  }
  return {
    expanded,
    inspecting,
    paused: inspecting || hidden,
    toggleRef,
    viewportRef,
    toggleProps: { onClick: onExpand },
    viewportProps: {
      onClickCapture: onExpand,
      onFocusCapture,
      onBlurCapture,
      onPointerEnter,
      onPointerLeave
    }
  }
}

function documentHidden(): boolean {
  return document.hidden
}
function subscribeVisibility(listener: () => void): () => void {
  document.addEventListener('visibilitychange', listener)
  return () => document.removeEventListener('visibilitychange', listener)
}
