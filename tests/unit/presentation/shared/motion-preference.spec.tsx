import { act, render, screen } from '@testing-library/react'

import {
  createMotionPreferenceStore,
  type MotionPreferenceStore
} from '../../../../src/presentation/shared/motion/motionPreference'
import { usePrefersReducedMotion } from '../../../../src/presentation/shared/hooks/usePrefersReducedMotion'

describe('motion preference', () => {
  it('shares one media listener and releases it after the final subscriber leaves', () => {
    const media = createMutableMediaQueryList(false)
    const matchMedia = vi.fn(() => media.value)
    const store = createMotionPreferenceStore(matchMedia)
    const first = vi.fn()
    const second = vi.fn()

    const unsubscribeFirst = store.subscribe(first)
    const unsubscribeSecond = store.subscribe(second)

    expect(matchMedia).toHaveBeenCalledOnce()
    expect(media.addEventListener).toHaveBeenCalledOnce()

    media.setMatches(true)
    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()
    expect(store.getSnapshot()).toBe(true)

    unsubscribeFirst()
    expect(media.removeEventListener).not.toHaveBeenCalled()
    unsubscribeSecond()
    expect(media.removeEventListener).toHaveBeenCalledOnce()
  })

  it('projects runtime preference changes through the React hook', () => {
    const media = createMutableMediaQueryList(false)
    const store = createMotionPreferenceStore(() => media.value)
    const view = render(<PreferenceHarness store={store} />)

    expect(screen.getByTestId('preference')).toHaveTextContent('full')

    act(() => media.setMatches(true))
    expect(screen.getByTestId('preference')).toHaveTextContent('reduced')

    view.unmount()
    expect(media.removeEventListener).toHaveBeenCalledOnce()
  })
})

function PreferenceHarness({ store }: { readonly store: MotionPreferenceStore }) {
  const reducedMotion = usePrefersReducedMotion(store)
  return <output data-testid="preference">{reducedMotion ? 'reduced' : 'full'}</output>
}

function createMutableMediaQueryList(initialMatches: boolean) {
  let matches = initialMatches
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const addEventListener = vi.fn(
    (_type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (typeof listener === 'function') {
        listeners.add(listener as (event: MediaQueryListEvent) => void)
      }
    }
  )
  const removeEventListener = vi.fn(
    (_type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (typeof listener === 'function') {
        listeners.delete(listener as (event: MediaQueryListEvent) => void)
      }
    }
  )
  const value = {
    get matches() {
      return matches
    },
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener,
    removeEventListener,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: () => true
  } as MediaQueryList

  return {
    addEventListener,
    removeEventListener,
    setMatches(nextMatches: boolean) {
      matches = nextMatches
      const event = { matches, media: value.media } as MediaQueryListEvent
      listeners.forEach((listener) => listener(event))
    },
    value
  }
}
