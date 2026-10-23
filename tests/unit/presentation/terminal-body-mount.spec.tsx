import { act, renderHook } from '@testing-library/react'
import { useTerminalBodyMount } from '../../../src/presentation/app-shell/workbench/nodes/terminal/useTerminalBodyMount'

function setup() {
  const shell = document.createElement('section')
  let size = { width: 220, height: 44 }
  shell.getBoundingClientRect = () => ({ ...size }) as DOMRect
  const surfaceRef = { current: shell }
  const hook = renderHook(
    ({ expanded, blocked }) => useTerminalBodyMount(expanded, blocked, surfaceRef),
    { initialProps: { expanded: false, blocked: false } }
  )
  return {
    ...hook,
    expandShell: () => {
      size = { width: 225, height: 50 }
    }
  }
}

describe('terminal first disclosure body mount', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('waits for real shell feedback before initialization and retains the body thereafter', () => {
    const { result, rerender, expandShell, unmount } = setup()
    rerender({ expanded: true, blocked: false })
    act(() => vi.advanceTimersByTime(100))
    expect(result.current).toBe(false)
    expandShell()
    act(() => vi.advanceTimersToNextFrame())
    expect(result.current).toBe(false)
    act(() => vi.advanceTimersToNextFrame())
    expect(result.current).toBe(false)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(true)
    rerender({ expanded: false, blocked: false })
    expect(result.current).toBe(true)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['before-feedback', 'after-feedback', 'before-task'] as const)(
    'cancels first disclosure %s',
    (phase) => {
      const { result, rerender, expandShell, unmount } = setup()
      rerender({ expanded: true, blocked: false })
      if (phase !== 'before-feedback') {
        expandShell()
        act(() => vi.advanceTimersToNextFrame())
      }
      if (phase === 'before-task') act(() => vi.advanceTimersToNextFrame())
      rerender({ expanded: false, blocked: false })
      act(() => vi.runAllTimers())
      expect(result.current).toBe(false)
      expect(vi.getTimerCount()).toBe(0)
      rerender({ expanded: true, blocked: false })
      unmount()
      expect(vi.getTimerCount()).toBe(0)
    }
  )

  it('cancels pending initialization when its group hides and resumes when visible again', () => {
    const { result, rerender, expandShell } = setup()
    rerender({ expanded: true, blocked: false })
    act(() => vi.advanceTimersToNextFrame())
    rerender({ expanded: true, blocked: true })
    act(() => vi.runAllTimers())
    expect(result.current).toBe(false)
    expandShell()
    rerender({ expanded: true, blocked: false })
    act(() => vi.runAllTimers())
    expect(result.current).toBe(true)
  })
})
