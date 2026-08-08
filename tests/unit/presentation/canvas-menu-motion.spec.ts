import {
  createCanvasMenuMotionController,
  type CanvasMenuMotionFrameScheduler,
  type CanvasMenuMotionPresentation
} from '../../../src/presentation/app-shell/canvasMenuMotion'

describe('canvas menu motion', () => {
  it('presents the same spring state at the same elapsed time on 60Hz and 120Hz displays', () => {
    const sixtyHertz = createHarness()
    const hundredTwentyHertz = createHarness()

    void sixtyHertz.controller.setOpen(true)
    void hundredTwentyHertz.controller.setOpen(true)
    sixtyHertz.scheduler.step(1_000 / 60)
    hundredTwentyHertz.scheduler.step(1_000 / 120)
    hundredTwentyHertz.scheduler.step(1_000 / 120)

    expect(hundredTwentyHertz.current.progress).toBeCloseTo(sixtyHertz.current.progress, 10)
    expect(hundredTwentyHertz.current.velocity).toBeCloseTo(sixtyHertz.current.velocity, 10)
  })

  it('keeps a visible growth phase through the first 100 milliseconds', () => {
    const harness = createHarness()

    void harness.controller.setOpen(true)
    for (let frame = 0; frame < 6; frame += 1) harness.scheduler.step()

    expect(harness.current.progress).toBeGreaterThan(0.4)
    expect(harness.current.progress).toBeLessThan(0.6)
    expect(harness.current.phase).toBe('opening')
  })

  it('retargets from the live presentation and drops velocity away from the closing target', async () => {
    const harness = createHarness()
    const opening = harness.controller.setOpen(true)

    harness.scheduler.step()
    harness.scheduler.step()
    const beforeReversal = harness.current
    const closing = harness.controller.setOpen(false)

    await expect(opening).resolves.toBe(false)
    expect(harness.current.progress).toBe(beforeReversal.progress)
    expect(harness.current.velocity).toBe(0)
    expect(harness.current.phase).toBe('closing')

    harness.scheduler.step()
    expect(harness.current.progress).toBeLessThan(beforeReversal.progress)
    expect(harness.current.velocity).toBeLessThan(0)

    harness.scheduler.finish()
    await expect(closing).resolves.toBe(true)
    expect(harness.current).toEqual({ phase: 'closed', progress: 0, velocity: 0 })
  })

  it('lets closing immediately reverse into opening without adding a second animation frame', async () => {
    const harness = createHarness()
    const firstOpening = harness.controller.setOpen(true)
    harness.scheduler.finish()
    await expect(firstOpening).resolves.toBe(true)

    const closing = harness.controller.setOpen(false)
    harness.scheduler.step()
    harness.scheduler.step()
    const beforeReopen = harness.current
    const reopening = harness.controller.setOpen(true)

    await expect(closing).resolves.toBe(false)
    expect(harness.current.progress).toBe(beforeReopen.progress)
    expect(harness.current.velocity).toBe(0)
    expect(harness.scheduler.maximumPendingFrames).toBe(1)

    harness.scheduler.step()
    expect(harness.current.progress).toBeGreaterThan(beforeReopen.progress)
    expect(harness.current.velocity).toBeGreaterThan(0)

    harness.scheduler.finish()
    await expect(reopening).resolves.toBe(true)
    expect(harness.current).toEqual({ phase: 'open', progress: 1, velocity: 0 })
  })

  it('settles to the latest target when the display stops delivering frames', async () => {
    const harness = createHarness()
    const completion = harness.controller.setOpen(true)

    harness.scheduler.step()
    expect(harness.current.progress).toBeGreaterThan(0)
    expect(harness.current.progress).toBeLessThan(1)
    harness.scheduler.elapseWithoutFrames(1_000)

    await expect(completion).resolves.toBe(true)
    expect(harness.current).toEqual({ phase: 'open', progress: 1, velocity: 0 })
    expect(harness.scheduler.pendingFrames).toBe(0)
    expect(harness.scheduler.pendingTimeouts).toBe(0)
  })

  it('applies reduced motion immediately while preserving the same semantic phases', async () => {
    const harness = createHarness({ reducedMotion: true })

    await expect(harness.controller.setOpen(true)).resolves.toBe(true)
    expect(harness.current).toEqual({ phase: 'open', progress: 1, velocity: 0 })
    await expect(harness.controller.setOpen(false)).resolves.toBe(true)
    expect(harness.current).toEqual({ phase: 'closed', progress: 0, velocity: 0 })
    expect(harness.scheduler.pendingFrames).toBe(0)
  })
})

function createHarness({ reducedMotion = false }: { readonly reducedMotion?: boolean } = {}) {
  const scheduler = new TestFrameScheduler()
  let current: CanvasMenuMotionPresentation = { phase: 'closed', progress: 0, velocity: 0 }
  const controller = createCanvasMenuMotionController({
    onPresent: (presentation) => {
      current = presentation
    },
    reducedMotion,
    scheduler
  })

  return {
    controller,
    get current() {
      return current
    },
    scheduler
  }
}

class TestFrameScheduler implements CanvasMenuMotionFrameScheduler {
  private clock = 0
  private nextId = 1
  private frames = new Map<number, FrameRequestCallback>()
  private timeouts = new Map<number, { readonly callback: () => void; readonly deadline: number }>()
  maximumPendingFrames = 0

  cancelFrame = (frameId: number): void => {
    this.frames.delete(frameId)
  }

  cancelTimeout = (timeoutId: number): void => {
    this.timeouts.delete(timeoutId)
  }

  now = (): number => this.clock

  requestFrame = (callback: FrameRequestCallback): number => {
    const id = this.nextId++
    this.frames.set(id, callback)
    this.maximumPendingFrames = Math.max(this.maximumPendingFrames, this.frames.size)
    return id
  }

  requestTimeout = (callback: () => void, delayMilliseconds: number): number => {
    const id = this.nextId++
    this.timeouts.set(id, { callback, deadline: this.clock + delayMilliseconds })
    return id
  }

  get pendingFrames(): number {
    return this.frames.size
  }

  get pendingTimeouts(): number {
    return this.timeouts.size
  }

  step(milliseconds = 1_000 / 60): void {
    this.clock += milliseconds
    const frames = [...this.frames.values()]
    this.frames.clear()
    frames.forEach((callback) => callback(this.clock))
    this.runDueTimeouts()
  }

  finish(): void {
    for (let frame = 0; frame < 240 && this.frames.size > 0; frame += 1) this.step()
    if (this.frames.size > 0) throw new Error('Canvas menu spring did not settle.')
  }

  elapseWithoutFrames(milliseconds: number): void {
    this.clock += milliseconds
    this.runDueTimeouts()
  }

  private runDueTimeouts(): void {
    const due = [...this.timeouts.entries()].filter(([, timeout]) => timeout.deadline <= this.clock)
    due.forEach(([id, timeout]) => {
      this.timeouts.delete(id)
      timeout.callback()
    })
  }
}
