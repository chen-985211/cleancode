import {
  TerminalZoomRasterCoordinator,
  type TerminalZoomRasterIdleDeadline,
  type TerminalZoomRasterPriority,
  type TerminalZoomRasterScheduler,
  type TerminalZoomRasterTarget
} from '../../../src/presentation/app-shell/terminalZoomRasterCoordinator'
import type { TerminalRasterScale } from '../../../src/presentation/app-shell/terminalZoomRasterPolicy'

describe('terminal zoom raster coordinator', () => {
  afterEach(() => vi.useRealTimers())

  it('keeps gesture frames compositor-only and performs focused and visible work in ordered idle slices', () => {
    vi.useFakeTimers()
    const scheduler = new ManualRasterScheduler()
    const coordinator = new TerminalZoomRasterCoordinator({ scheduler })
    const focused = createTarget('focused', 'focused')
    const visible = createTarget('visible', 'visible')
    const hidden = createTarget('hidden', 'hidden')
    coordinator.register(hidden)
    coordinator.register(visible)
    coordinator.register(focused)

    coordinator.beginInteraction()
    coordinator.updateCanvasZoom(1.6)
    vi.advanceTimersByTime(500)

    expect(focused.appliedScales).toEqual([])
    expect(visible.appliedScales).toEqual([])

    coordinator.endInteraction(1.6)
    vi.advanceTimersByTime(99)
    expect(scheduler.pendingIdleCount).toBe(0)
    vi.advanceTimersByTime(1)

    expect(scheduler.nextIdleTimeout).toBe(32)
    scheduler.runNextIdle({ timeRemaining: () => 10 })
    expect(focused.appliedScales).toEqual([1.75])
    expect(visible.appliedScales).toEqual([])
    expect(scheduler.pendingIdleCount).toBe(1)
    expect(scheduler.nextIdleTimeout).toBe(250)
    scheduler.runNextIdle({ timeRemaining: () => 10 })
    expect(visible.appliedScales).toEqual([1.75])
    expect(hidden.appliedScales).toEqual([])
  })

  it('waits for a usable idle slice instead of moving expensive work into a frame', () => {
    vi.useFakeTimers()
    const scheduler = new ManualRasterScheduler()
    const coordinator = new TerminalZoomRasterCoordinator({ scheduler })
    const target = createTarget('terminal', 'visible')
    coordinator.register(target)

    coordinator.updateCanvasZoom(1.6)
    vi.advanceTimersByTime(100)
    scheduler.runNextIdle({ timeRemaining: () => 2 })

    expect(target.appliedScales).toEqual([])
    expect(scheduler.pendingIdleCount).toBe(1)

    scheduler.runNextIdle({ timeRemaining: () => 10 })
    expect(target.appliedScales).toEqual([1.75])
  })

  it('invalidates queued work when a newer zoom generation starts', () => {
    vi.useFakeTimers()
    const scheduler = new ManualRasterScheduler()
    const coordinator = new TerminalZoomRasterCoordinator({ scheduler })
    const target = createTarget('terminal', 'visible')
    coordinator.register(target)

    coordinator.updateCanvasZoom(1.6)
    vi.advanceTimersByTime(100)
    expect(scheduler.pendingIdleCount).toBe(1)

    coordinator.beginInteraction()
    coordinator.updateCanvasZoom(1)
    scheduler.runNextIdle({ timeRemaining: () => 10 })
    expect(target.appliedScales).toEqual([])

    coordinator.endInteraction(1)
    vi.advanceTimersByTime(1_100)
    expect(target.appliedScales).toEqual([])
  })

  it('delays downgrades and removes released targets from pending work', () => {
    vi.useFakeTimers()
    const scheduler = new ManualRasterScheduler()
    const coordinator = new TerminalZoomRasterCoordinator({ scheduler })
    const target = createTarget('terminal', 'visible', 1.75)
    const unregister = coordinator.register(target)

    coordinator.updateCanvasZoom(1)
    vi.advanceTimersByTime(1_100)
    expect(scheduler.pendingIdleCount).toBe(1)

    unregister()
    scheduler.runNextIdle({ timeRemaining: () => 10 })
    expect(target.appliedScales).toEqual([])
  })

  it('downgrades an offscreen target while preserving high resolution for a visible target', () => {
    vi.useFakeTimers()
    const scheduler = new ManualRasterScheduler()
    const coordinator = new TerminalZoomRasterCoordinator({ scheduler })
    const visible = createTarget('visible', 'visible', 1.75)
    const hidden = createTarget('hidden', 'hidden', 1.75)
    coordinator.register(visible)
    coordinator.register(hidden)

    coordinator.updateCanvasZoom(1.6)
    vi.advanceTimersByTime(100)
    scheduler.runAllIdle()

    expect(visible.appliedScales).toEqual([])
    expect(hidden.appliedScales).toEqual([1])
  })

  it('reconciles a target when intersection visibility changes without another zoom event', () => {
    vi.useFakeTimers()
    const scheduler = new ManualRasterScheduler()
    const coordinator = new TerminalZoomRasterCoordinator({ scheduler })
    const target = createTarget('terminal', 'hidden')
    coordinator.updateCanvasZoom(1.6)
    coordinator.register(target)
    vi.advanceTimersByTime(100)
    expect(scheduler.pendingIdleCount).toBe(0)

    target.setPriority('visible')
    vi.advanceTimersByTime(100)
    scheduler.runNextIdle({ timeRemaining: () => 10 })

    expect(target.appliedScales).toEqual([1.75])
  })

  it('uses a hard window budget with focused-first and level-by-level fair visible allocation', () => {
    vi.useFakeTimers()
    const scheduler = new ManualRasterScheduler()
    const coordinator = new TerminalZoomRasterCoordinator({
      scheduler,
      maxBackingPixels: 650
    })
    const focused = createTarget('focused', 'focused', 1, { baseRasterCost: 100 })
    const firstVisible = createTarget('first-visible', 'visible', 1, { baseRasterCost: 100 })
    const secondVisible = createTarget('second-visible', 'visible', 1, {
      baseRasterCost: 100
    })
    coordinator.register(firstVisible)
    coordinator.register(secondVisible)
    coordinator.register(focused)

    coordinator.updateCanvasZoom(1.6)
    vi.advanceTimersByTime(100)
    scheduler.runAllIdle()

    expect(focused.appliedScales).toEqual([1.75])
    expect(firstVisible.appliedScales).toEqual([1.25])
    expect(secondVisible.appliedScales).toEqual([1.25])
    expect(
      [focused, firstVisible, secondVisible].reduce(
        (total, target) => total + target.getRasterCost(target.getRasterScale()),
        0
      )
    ).toBeLessThanOrEqual(650)
  })

  it('releases hidden backing pixels before admitting another visible upgrade', () => {
    vi.useFakeTimers()
    const scheduler = new ManualRasterScheduler()
    const coordinator = new TerminalZoomRasterCoordinator({
      scheduler,
      maxBackingPixels: 300
    })
    const first = createTarget('first', 'visible', 1.75, { baseRasterCost: 100 })
    const second = createTarget('second', 'visible', 1, { baseRasterCost: 100 })
    coordinator.updateCanvasZoom(1.6)
    coordinator.register(first)
    coordinator.register(second)
    vi.advanceTimersByTime(100)

    first.setPriority('hidden')
    vi.advanceTimersByTime(100)
    expect(scheduler.pendingIdleCount).toBe(1)

    scheduler.runNextIdle({ timeRemaining: () => 10 })
    expect(first.appliedScales).toEqual([1])
    expect(second.appliedScales).toEqual([])

    scheduler.runNextIdle({ timeRemaining: () => 10 })
    expect(second.appliedScales).toEqual([1.25])
  })

  it('cancels upgrades that depend on a permanently failed backing-store release', () => {
    vi.useFakeTimers()
    const scheduler = new ManualRasterScheduler()
    const coordinator = new TerminalZoomRasterCoordinator({
      scheduler,
      maxBackingPixels: 300
    })
    const hidden = createTarget('hidden', 'hidden', 1.75, {
      baseRasterCost: 100,
      shouldFail: (scale) => scale === 1
    })
    const visible = createTarget('visible', 'visible', 1, { baseRasterCost: 100 })
    coordinator.updateCanvasZoom(1.6)
    coordinator.register(hidden)
    coordinator.register(visible)
    vi.advanceTimersByTime(100)

    scheduler.runAllIdle()

    expect(hidden.setRasterScaleAttempts).toBe(3)
    expect(hidden.appliedScales).toEqual([])
    expect(visible.appliedScales).toEqual([])
  })

  it('reconciles the hard budget when a target raster cost changes', () => {
    vi.useFakeTimers()
    const scheduler = new ManualRasterScheduler()
    const coordinator = new TerminalZoomRasterCoordinator({
      scheduler,
      maxBackingPixels: 360
    })
    const target = createTarget('terminal', 'visible', 1, { baseRasterCost: 100 })
    coordinator.updateCanvasZoom(1.6)
    coordinator.register(target)
    vi.advanceTimersByTime(100)
    scheduler.runAllIdle()
    expect(target.appliedScales).toEqual([1.75])

    target.setBaseRasterCost(200)
    vi.advanceTimersByTime(100)
    scheduler.runAllIdle()

    expect(target.appliedScales).toEqual([1.75, 1.25])
    expect(target.getRasterCost(target.getRasterScale())).toBeLessThanOrEqual(360)
  })

  it('retries transient raster failures and eventually applies the requested scale', () => {
    vi.useFakeTimers()
    const scheduler = new ManualRasterScheduler()
    const coordinator = new TerminalZoomRasterCoordinator({ scheduler })
    const target = createTarget('terminal', 'focused', 1, { failuresBeforeSuccess: 2 })
    coordinator.updateCanvasZoom(1.6)
    coordinator.register(target)
    vi.advanceTimersByTime(100)

    scheduler.runAllIdle()

    expect(target.setRasterScaleAttempts).toBe(3)
    expect(target.appliedScales).toEqual([1.75])
  })

  it('falls back to baseline after a bounded number of permanent upgrade failures', () => {
    vi.useFakeTimers()
    const scheduler = new ManualRasterScheduler()
    const failures: unknown[] = []
    const coordinator = new TerminalZoomRasterCoordinator({
      scheduler,
      onRasterFailure: ({ error }) => failures.push(error)
    })
    const target = createTarget('terminal', 'focused', 1.5, {
      shouldFail: (scale) => scale === 1.75
    })
    coordinator.updateCanvasZoom(1.6)
    coordinator.register(target)
    vi.advanceTimersByTime(100)

    scheduler.runAllIdle()

    expect(target.setRasterScaleAttempts).toBe(4)
    expect(failures).toHaveLength(3)
    expect(target.appliedScales).toEqual([1])
  })
})

class ManualRasterScheduler implements TerminalZoomRasterScheduler {
  private nextIdleId = 1
  private readonly idleCallbacks = new Map<
    number,
    {
      readonly callback: (deadline: TerminalZoomRasterIdleDeadline) => void
      readonly timeout: number
    }
  >()

  get pendingIdleCount(): number {
    return this.idleCallbacks.size
  }

  get nextIdleTimeout(): number | undefined {
    return this.idleCallbacks.values().next().value?.timeout
  }

  setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout> {
    return setTimeout(callback, delay)
  }

  clearTimeout(handle: ReturnType<typeof setTimeout>): void {
    clearTimeout(handle)
  }

  requestIdle(
    callback: (deadline: TerminalZoomRasterIdleDeadline) => void,
    timeout: number
  ): number {
    const id = this.nextIdleId++
    this.idleCallbacks.set(id, { callback, timeout })
    return id
  }

  cancelIdle(id: number): void {
    this.idleCallbacks.delete(id)
  }

  runNextIdle(deadline: Partial<TerminalZoomRasterIdleDeadline> = {}): void {
    const entry = this.idleCallbacks.entries().next().value as
      | [
          number,
          {
            readonly callback: (deadline: TerminalZoomRasterIdleDeadline) => void
            readonly timeout: number
          }
        ]
      | undefined
    if (!entry) return
    this.idleCallbacks.delete(entry[0])
    entry[1].callback({
      didTimeout: deadline.didTimeout ?? false,
      timeRemaining: deadline.timeRemaining ?? (() => 10)
    })
  }

  runAllIdle(): void {
    while (this.idleCallbacks.size > 0) this.runNextIdle()
  }
}

function createTarget(
  id: string,
  priority: TerminalZoomRasterPriority,
  initialScale: TerminalRasterScale = 1,
  {
    baseRasterCost: initialBaseRasterCost = 100,
    failuresBeforeSuccess = 0,
    shouldFail = () => false
  }: {
    readonly baseRasterCost?: number
    readonly failuresBeforeSuccess?: number
    readonly shouldFail?: (scale: TerminalRasterScale) => boolean
  } = {}
): TerminalZoomRasterTarget & {
  readonly appliedScales: TerminalRasterScale[]
  readonly setRasterScaleAttempts: number
  setBaseRasterCost(cost: number): void
  setPriority(priority: TerminalZoomRasterPriority): void
} {
  let currentScale = initialScale
  let currentPriority = priority
  let baseRasterCost = initialBaseRasterCost
  let remainingFailures = failuresBeforeSuccess
  let setRasterScaleAttempts = 0
  const appliedScales: TerminalRasterScale[] = []
  const priorityListeners = new Set<() => void>()
  const costListeners = new Set<() => void>()
  return {
    id,
    appliedScales,
    get setRasterScaleAttempts() {
      return setRasterScaleAttempts
    },
    getRasterPriority: () => currentPriority,
    getRasterScale: () => currentScale,
    getRasterCost: (scale) => Math.ceil(baseRasterCost * scale * scale),
    onRasterPriorityChange: (listener) => {
      priorityListeners.add(listener)
      return () => priorityListeners.delete(listener)
    },
    onRasterCostChange: (listener) => {
      costListeners.add(listener)
      return () => costListeners.delete(listener)
    },
    setRasterScale: (scale) => {
      setRasterScaleAttempts += 1
      if (remainingFailures > 0) {
        remainingFailures -= 1
        throw new Error('transient raster failure')
      }
      if (shouldFail(scale)) throw new Error('permanent raster failure')
      currentScale = scale
      appliedScales.push(scale)
    },
    setBaseRasterCost: (cost: number) => {
      baseRasterCost = cost
      for (const listener of costListeners) listener()
    },
    setPriority: (nextPriority: TerminalZoomRasterPriority) => {
      currentPriority = nextPriority
      for (const listener of priorityListeners) listener()
    }
  }
}
