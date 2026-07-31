import { describe, expect, it, vi } from 'vitest'

import {
  shouldReassertTerminalStartupDimensions,
  startTerminalStartupGridReconciliation
} from '../../../src/presentation/app-shell/terminalStartupGridReconciliation'

describe('terminal startup grid reconciliation', () => {
  it('reports the final grid when layout becomes authoritative after the early mount frames', () => {
    const scheduler = createFrameScheduler()
    let sample = 0
    const onDimensionsChange = vi.fn()

    startTerminalStartupGridReconciliation({
      initialDimensions: { columns: 203, rows: 50 },
      canSettle: () => sample >= 20,
      measure: () => {
        sample += 1
        return sample < 20 ? { columns: 203, rows: 50 } : { columns: 79, rows: 50 }
      },
      onDimensionsChange,
      requestFrame: scheduler.requestFrame,
      cancelFrame: scheduler.cancelFrame
    })

    scheduler.run()

    expect(onDimensionsChange).toHaveBeenCalledOnce()
    expect(onDimensionsChange).toHaveBeenCalledWith({ columns: 79, rows: 50 })
    expect(scheduler.framesRun()).toBeGreaterThan(12)
    expect(scheduler.framesRun()).toBeLessThan(180)
  })

  it('hands off after an authoritative grid remains stable', () => {
    const scheduler = createFrameScheduler()
    const onDimensionsChange = vi.fn()

    startTerminalStartupGridReconciliation({
      initialDimensions: { columns: 112, rows: 34 },
      canSettle: () => true,
      measure: () => ({ columns: 112, rows: 34 }),
      onDimensionsChange,
      requestFrame: scheduler.requestFrame,
      cancelFrame: scheduler.cancelFrame
    })

    scheduler.run()

    expect(onDimensionsChange).not.toHaveBeenCalled()
    expect(scheduler.framesRun()).toBeGreaterThan(0)
    expect(scheduler.framesRun()).toBeLessThan(180)
  })

  it('reasserts an unchanged grid once after the Windows startup surface settles', () => {
    const scheduler = createFrameScheduler()
    const onDimensionsChange = vi.fn()
    const onSettledDimensions = vi.fn()

    startTerminalStartupGridReconciliation({
      initialDimensions: { columns: 112, rows: 34 },
      canSettle: () => true,
      measure: () => ({ columns: 112, rows: 34 }),
      onDimensionsChange,
      onSettledDimensions,
      requestFrame: scheduler.requestFrame,
      cancelFrame: scheduler.cancelFrame
    })

    scheduler.run()

    expect(onDimensionsChange).not.toHaveBeenCalled()
    expect(onSettledDimensions).toHaveBeenCalledOnce()
    expect(onSettledDimensions).toHaveBeenCalledWith({ columns: 112, rows: 34 })
    expect(scheduler.pendingFrames()).toBe(0)
  })

  it.each([
    ['Win32', true],
    ['Windows', true],
    ['MacIntel', false],
    ['Linux x86_64', false]
  ])('selects Windows startup reassertion for platform %s', (platform, expected) => {
    expect(shouldReassertTerminalStartupDimensions(platform)).toBe(expected)
  })

  it('ignores unusable measurements without treating them as stable', () => {
    const scheduler = createFrameScheduler()
    let sample = 0
    const onDimensionsChange = vi.fn()

    startTerminalStartupGridReconciliation({
      initialDimensions: null,
      canSettle: () => true,
      measure: () => {
        sample += 1
        return sample < 15 ? { columns: 0, rows: 0 } : { columns: 96, rows: 28 }
      },
      onDimensionsChange,
      requestFrame: scheduler.requestFrame,
      cancelFrame: scheduler.cancelFrame
    })

    scheduler.run()

    expect(onDimensionsChange).toHaveBeenCalledOnce()
    expect(onDimensionsChange).toHaveBeenCalledWith({ columns: 96, rows: 28 })
    expect(scheduler.framesRun()).toBeGreaterThan(15)
  })

  it('reports each changed grid once while startup layout converges', () => {
    const scheduler = createFrameScheduler()
    let sample = 0
    const measurements = [
      { columns: 120, rows: 36 },
      { columns: 120, rows: 36 },
      { columns: 96, rows: 32 },
      { columns: 96, rows: 32 },
      { columns: 79, rows: 28 }
    ]
    const onDimensionsChange = vi.fn()

    startTerminalStartupGridReconciliation({
      initialDimensions: measurements[0]!,
      canSettle: () => sample >= measurements.length,
      measure: () => measurements[Math.min(sample++, measurements.length - 1)]!,
      onDimensionsChange,
      requestFrame: scheduler.requestFrame,
      cancelFrame: scheduler.cancelFrame
    })

    scheduler.run()

    expect(onDimensionsChange.mock.calls).toEqual([
      [{ columns: 96, rows: 32 }],
      [{ columns: 79, rows: 28 }]
    ])
  })

  it('stops at the hard frame cap when the surface never becomes authoritative', () => {
    const scheduler = createFrameScheduler()

    startTerminalStartupGridReconciliation({
      initialDimensions: { columns: 80, rows: 24 },
      canSettle: () => false,
      measure: () => ({ columns: 80, rows: 24 }),
      onDimensionsChange: vi.fn(),
      requestFrame: scheduler.requestFrame,
      cancelFrame: scheduler.cancelFrame
    })

    scheduler.run()

    expect(scheduler.framesRun()).toBe(180)
    expect(scheduler.pendingFrames()).toBe(0)
  })

  it('stops measuring as soon as the owning surface cancels', () => {
    const scheduler = createFrameScheduler()
    const measure = vi.fn(() => ({ columns: 120, rows: 36 }))
    const handle = startTerminalStartupGridReconciliation({
      initialDimensions: { columns: 80, rows: 24 },
      canSettle: () => false,
      measure,
      onDimensionsChange: vi.fn(),
      requestFrame: scheduler.requestFrame,
      cancelFrame: scheduler.cancelFrame
    })

    scheduler.run(3)
    handle.cancel()
    const measurementsBeforeDrain = measure.mock.calls.length
    scheduler.run()

    expect(scheduler.pendingFrames()).toBe(0)
    expect(measure).toHaveBeenCalledTimes(measurementsBeforeDrain)
  })

  it('does not schedule another frame when a dimension callback releases the surface', () => {
    const scheduler = createFrameScheduler()
    const measure = vi.fn(() => ({ columns: 120, rows: 36 }))
    const handle = startTerminalStartupGridReconciliation({
      initialDimensions: { columns: 80, rows: 24 },
      canSettle: () => false,
      measure,
      onDimensionsChange: () => handle.cancel(),
      requestFrame: scheduler.requestFrame,
      cancelFrame: scheduler.cancelFrame
    })

    scheduler.run()

    expect(scheduler.framesRun()).toBe(1)
    expect(measure).toHaveBeenCalledOnce()
    expect(scheduler.pendingFrames()).toBe(0)
  })

  it('does not reassert a stable grid after the owning surface cancels', () => {
    const scheduler = createFrameScheduler()
    const onDimensionsChange = vi.fn()
    const onSettledDimensions = vi.fn()
    const handle = startTerminalStartupGridReconciliation({
      initialDimensions: { columns: 120, rows: 36 },
      canSettle: () => true,
      measure: () => ({ columns: 120, rows: 36 }),
      onDimensionsChange,
      onSettledDimensions,
      requestFrame: scheduler.requestFrame,
      cancelFrame: scheduler.cancelFrame
    })

    scheduler.run(3)
    handle.cancel()
    scheduler.run()

    expect(onDimensionsChange).not.toHaveBeenCalled()
    expect(onSettledDimensions).not.toHaveBeenCalled()
    expect(scheduler.pendingFrames()).toBe(0)
  })
})

function createFrameScheduler() {
  let nextFrameId = 0
  let frameCount = 0
  const pending = new Map<number, () => void>()

  return {
    requestFrame: (callback: () => void): number => {
      const frameId = ++nextFrameId
      pending.set(frameId, callback)
      return frameId
    },
    cancelFrame: (frameId: number): void => {
      pending.delete(frameId)
    },
    run: (limit = 1_000): void => {
      while (pending.size > 0 && frameCount < limit) {
        const [frameId, callback] = pending.entries().next().value!
        pending.delete(frameId)
        frameCount += 1
        callback()
      }
    },
    framesRun: (): number => frameCount,
    pendingFrames: (): number => pending.size
  }
}
