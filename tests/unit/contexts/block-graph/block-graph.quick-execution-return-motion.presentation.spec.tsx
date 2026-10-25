import { act, renderHook } from '@testing-library/react'

import { useQuickExecutionDragMotionPresentation } from '../../../../src/contexts/block-graph/presentation/motion/useQuickExecutionDragMotionPresentation'
import type { QuickExecutionDragMotion } from '../../../../src/contexts/block-graph/presentation/view-models/quickExecutionDrag'

describe('quick execution return motion', () => {
  let now: number
  let nextId: number
  let frames: Map<number, FrameRequestCallback>

  beforeEach(() => {
    now = 0
    nextId = 0
    frames = new Map()
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++nextId, callback)
      return nextId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id)
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it.each([24, 160, 360])(
    'preserves the original gradual settling for a %s pixel return',
    (distance) => {
      const onComplete = vi.fn()
      const motion: QuickExecutionDragMotion = {
        id: 'return',
        kind: 'move',
        offset: { x: distance, y: -80 }
      }
      const { result } = renderHook(() =>
        useQuickExecutionDragMotionPresentation(motion, onComplete)
      )
      const surface = document.createElement('div')
      act(() => result.current.surfaceRef(surface))
      let previous = Math.hypot(distance, 80)
      for (let frame = 0; frame < 63 && !onComplete.mock.calls.length; frame++) {
        step()
        const remaining = Math.hypot(read(surface, 'x'), read(surface, 'y'))
        expect(remaining).toBeLessThanOrEqual(previous)
        previous = remaining
      }
      expect(onComplete).toHaveBeenCalledExactlyOnceWith('return')
      expect(now).toBeGreaterThanOrEqual(750)
      expect(now).toBeLessThanOrEqual(1050)
      expect(read(surface, 'x')).toBe(0)
      expect(read(surface, 'y')).toBe(0)
      expect(surface.style.getPropertyValue('--quick-execution-return-chrome-opacity')).toBe('0')
    }
  )

  it('finishes an already aligned return in the same presentation pass', () => {
    const onComplete = vi.fn()
    const motion: QuickExecutionDragMotion = {
      id: 'aligned',
      kind: 'move',
      offset: { x: 0, y: 0 }
    }
    const { result } = renderHook(() => useQuickExecutionDragMotionPresentation(motion, onComplete))
    act(() => result.current.surfaceRef(document.createElement('div')))
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('aligned')
    expect(frames.size).toBe(0)
  })

  function step() {
    now += 1000 / 60
    const pending = [...frames.values()]
    frames.clear()
    act(() => pending.forEach((callback) => callback(now)))
  }
})

function read(surface: HTMLElement, axis: 'x' | 'y'): number {
  return Number.parseFloat(surface.style.getPropertyValue(`--workbench-object-motion-${axis}`))
}
