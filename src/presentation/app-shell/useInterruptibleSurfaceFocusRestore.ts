import { useCallback, useEffect, useRef, type RefObject } from 'react'

interface InterruptibleSurfaceFocusRestore {
  readonly beginFocusRestore: () => void
  readonly cancelFocusRestore: () => void
  readonly completeFocusRestore: () => void
}

export function useInterruptibleSurfaceFocusRestore(
  surfaceRef: RefObject<HTMLElement | null>,
  triggerRef: RefObject<HTMLElement | null>
): InterruptibleSurfaceFocusRestore {
  const shouldRestoreFocusRef = useRef(true)
  const stopWatchingRef = useRef<() => void>(() => undefined)

  const stopWatching = useCallback((): void => {
    stopWatchingRef.current()
    stopWatchingRef.current = () => undefined
  }, [])

  const beginFocusRestore = useCallback((): void => {
    stopWatchingRef.current()
    shouldRestoreFocusRef.current = true
    const cancelFromExternalIntent = (event: Event): void => {
      if (!surfaceRef.current?.contains(event.target as Node)) {
        shouldRestoreFocusRef.current = false
      }
    }
    document.addEventListener('pointerdown', cancelFromExternalIntent, true)
    document.addEventListener('contextmenu', cancelFromExternalIntent, true)
    document.addEventListener('focusin', cancelFromExternalIntent, true)
    stopWatchingRef.current = () => {
      document.removeEventListener('pointerdown', cancelFromExternalIntent, true)
      document.removeEventListener('contextmenu', cancelFromExternalIntent, true)
      document.removeEventListener('focusin', cancelFromExternalIntent, true)
    }
  }, [surfaceRef])

  const cancelFocusRestore = useCallback((): void => {
    shouldRestoreFocusRef.current = false
    stopWatching()
  }, [stopWatching])

  const completeFocusRestore = useCallback((): void => {
    stopWatching()
    if (shouldRestoreFocusRef.current) triggerRef.current?.focus()
  }, [stopWatching, triggerRef])

  useEffect(() => stopWatching, [stopWatching])

  return { beginFocusRestore, cancelFocusRestore, completeFocusRestore }
}
