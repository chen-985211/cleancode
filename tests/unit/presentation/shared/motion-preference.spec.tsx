import { act, renderHook } from '@testing-library/react'

import { useSurfaceMotionPresence } from '../../../../src/presentation/shared/hooks/useSurfaceMotionPresence'

describe('application-owned surface motion', () => {
  it.each([false, true])(
    'plays the full exit with system reduced motion initially %s',
    (initial) => {
      const media = createMutableMediaQueryList(initial)
      vi.spyOn(window, 'matchMedia').mockReturnValue(media.value)
      const onExitComplete = vi.fn()
      const { result, rerender } = renderHook(
        (open: boolean) => useSurfaceMotionPresence(open, { onExitComplete }),
        { initialProps: true }
      )

      rerender(false)
      expect(result.current.phase).toBe('closing')
      act(() => media.setMatches(!initial))
      expect(result.current.phase).toBe('closing')
      expect(onExitComplete).not.toHaveBeenCalled()
      act(() => result.current.completeMotion())
      expect(result.current.phase).toBe('closed')
      expect(onExitComplete).toHaveBeenCalledOnce()
    }
  )
})

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
