export interface MotionPreferenceStore {
  readonly getSnapshot: () => boolean
  readonly subscribe: (listener: () => void) => () => void
}

type MatchMedia = (query: string) => MediaQueryList

const reducedMotionQuery = '(prefers-reduced-motion: reduce)'

export function createMotionPreferenceStore(
  matchMedia: MatchMedia | undefined = browserMatchMedia
): MotionPreferenceStore {
  const listeners = new Set<() => void>()
  let mediaQuery: MediaQueryList | null = null
  let listening = false

  const ensureMediaQuery = (): MediaQueryList | null => {
    if (mediaQuery || !matchMedia) return mediaQuery
    mediaQuery = matchMedia(reducedMotionQuery)
    return mediaQuery
  }

  const notify = (): void => listeners.forEach((listener) => listener())

  const startListening = (): void => {
    const query = ensureMediaQuery()
    if (!query || listening) return
    if (typeof query.addEventListener === 'function') query.addEventListener('change', notify)
    else query.addListener(notify)
    listening = true
  }

  const stopListening = (): void => {
    if (!mediaQuery || !listening) return
    if (typeof mediaQuery.removeEventListener === 'function') {
      mediaQuery.removeEventListener('change', notify)
    } else {
      mediaQuery.removeListener(notify)
    }
    listening = false
    mediaQuery = null
  }

  return {
    getSnapshot: () => ensureMediaQuery()?.matches ?? false,
    subscribe: (listener) => {
      listeners.add(listener)
      startListening()
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) stopListening()
      }
    }
  }
}

export const motionPreferenceStore = createMotionPreferenceStore()

export function prefersReducedMotion(): boolean {
  return motionPreferenceStore.getSnapshot()
}

export function subscribeReducedMotionPreference(
  listener: (reducedMotion: boolean) => void
): () => void {
  return motionPreferenceStore.subscribe(() => listener(motionPreferenceStore.getSnapshot()))
}

function browserMatchMedia(query: string): MediaQueryList {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return createStaticMediaQueryList(query)
  }
  return window.matchMedia(query)
}

function createStaticMediaQueryList(media: string): MediaQueryList {
  return {
    matches: false,
    media,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => true
  }
}
