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
  const pinnedRef = useRef(false)
  const keyboardNavigationRef = useRef(false)
  const inspectingRef = useRef(false)
  const [interaction, setInteraction] = useState(restingInteraction)
  const hidden = useSyncExternalStore(subscribeVisibility, documentHidden, () => false)
  const inspecting = interaction.focused || interaction.hovered || interaction.pinned
  const expanded = inspecting && !interaction.suppressed
  if (openIds.length === 0 && inspecting) setInteraction(restingInteraction)

  useLayoutEffect(() => {
    inspectingRef.current = inspecting
    pinnedRef.current = interaction.pinned
    if (!inspecting) keyboardNavigationRef.current = false
  }, [inspecting, interaction.pinned])

  useEffect(() => {
    const isNotification = (target: EventTarget | null): boolean =>
      target instanceof Node && viewportRef.current?.contains(target) === true
    const isCanvas = (target: EventTarget | null): boolean =>
      target instanceof Element && target.closest('.canvas-surface, .app-shell__workspace') !== null
    const collapse = (): void => {
      inspectingRef.current = false
      pinnedRef.current = false
      keyboardNavigationRef.current = false
      focusedMessageRef.current = null
      focusedElementRef.current = null
      suppressNextFocusRef.current = false
      setInteraction({ ...restingInteraction, suppressed: true })
      viewportRef.current?.scrollTo?.({ top: 0 })
    }
    const onPointerInput = (event: Event): void => {
      keyboardNavigationRef.current = false
      if (inspectingRef.current && !isNotification(event.target) && isCanvas(event.target))
        collapse()
    }
    const onKeyboardInput = (event: KeyboardEvent): void => {
      keyboardNavigationRef.current = event.key === 'Tab'
      if (inspectingRef.current && !isNotification(event.target) && isCanvas(event.target))
        collapse()
    }
    const clearKeyboardNavigation = (): void => {
      keyboardNavigationRef.current = false
    }
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.key === 'Tab') clearKeyboardNavigation()
    }
    const onFocus = (event: Event): void => {
      // A Tab belongs to the next focus move, even when it stays in notifications or
      // the sidebar. Later programmatic navigation must not inherit that input.
      const keyboardNavigation = keyboardNavigationRef.current
      clearKeyboardNavigation()
      if (
        inspectingRef.current &&
        (!pinnedRef.current || keyboardNavigation) &&
        !isNotification(event.target) &&
        isCanvas(event.target)
      )
        collapse()
    }
    const pointerEvents = ['pointerdown', 'touchstart', 'wheel'] as const
    for (const type of pointerEvents)
      document.addEventListener(type, onPointerInput, { capture: true, passive: true })
    document.addEventListener('keydown', onKeyboardInput, true)
    document.addEventListener('keyup', onKeyUp, true)
    document.addEventListener('focusin', onFocus, true)
    window.addEventListener('blur', clearKeyboardNavigation)
    return () => {
      for (const type of pointerEvents) document.removeEventListener(type, onPointerInput, true)
      document.removeEventListener('keydown', onKeyboardInput, true)
      document.removeEventListener('keyup', onKeyUp, true)
      document.removeEventListener('focusin', onFocus, true)
      window.removeEventListener('blur', clearKeyboardNavigation)
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
    const returningInside = viewportRef.current?.contains(next) === true
    suppressNextFocusRef.current = returningInside && !expanded
    if (suppressNextFocusRef.current)
      setInteraction((current) => ({ ...current, suppressed: true }))
    next.focus({ preventScroll: true })
    suppressNextFocusRef.current = false
    if (returningInside) next.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
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
    pinnedRef.current = true
    keyboardNavigationRef.current = false
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
