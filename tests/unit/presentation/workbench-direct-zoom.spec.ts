import type { Edge, ReactFlowInstance, Viewport } from '@xyflow/react'

import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types'
import { createWorkbenchDirectZoomController } from '../../../src/presentation/app-shell/workbenchDirectZoom'

describe('workbench direct zoom controller', () => {
  it('follows one continuous time-based curve at 60Hz and 120Hz', () => {
    const sixtyHertzFrames = new TestFrameScheduler()
    const hundredTwentyHertzFrames = new TestFrameScheduler()
    const sixtyHertzController = createWorkbenchDirectZoomController(sixtyHertzFrames)
    const hundredTwentyHertzController =
      createWorkbenchDirectZoomController(hundredTwentyHertzFrames)
    const sixtyHertzInstance = createViewportInstance()
    const hundredTwentyHertzInstance = createViewportInstance()
    const input = {
      anchor: { x: 320, y: 240 },
      deltaZoomStops: 0.25,
      reducedMotion: false
    }

    sixtyHertzController.retarget(sixtyHertzInstance.value, input)
    hundredTwentyHertzController.retarget(hundredTwentyHertzInstance.value, input)
    sixtyHertzFrames.step(1_000 / 60)
    hundredTwentyHertzFrames.step(1_000 / 120)
    hundredTwentyHertzFrames.step(1_000 / 120)

    const targetZoomStops = 0.25
    const sixtyHertzZoomStops = Math.log2(sixtyHertzInstance.viewport.zoom)
    const hundredTwentyHertzZoomStops = Math.log2(hundredTwentyHertzInstance.viewport.zoom)
    expect(sixtyHertzZoomStops / targetZoomStops).toBeGreaterThan(0.35)
    expect(sixtyHertzZoomStops / targetZoomStops).toBeLessThan(0.7)
    expect(hundredTwentyHertzZoomStops).toBeCloseTo(sixtyHertzZoomStops, 10)
    expect(hundredTwentyHertzInstance.viewport.x).toBeCloseTo(sixtyHertzInstance.viewport.x, 10)
    expect(hundredTwentyHertzInstance.viewport.y).toBeCloseTo(sixtyHertzInstance.viewport.y, 10)
    expect(sixtyHertzInstance.value.setViewport).toHaveBeenCalledTimes(1)
    expect(hundredTwentyHertzInstance.value.setViewport).toHaveBeenCalledTimes(2)

    sixtyHertzFrames.finish()
    hundredTwentyHertzFrames.finish()
    expect(sixtyHertzInstance.viewport.zoom).toBeCloseTo(2 ** targetZoomStops, 3)
    expect(hundredTwentyHertzInstance.viewport.zoom).toBeCloseTo(2 ** targetZoomStops, 3)
    sixtyHertzController.cancel()
    hundredTwentyHertzController.cancel()
  })

  it('does not restart the frame clock when wheel events outpace presentation frames', () => {
    const burstFrames = new TestFrameScheduler()
    const coalescedFrames = new TestFrameScheduler()
    const burstController = createWorkbenchDirectZoomController(burstFrames)
    const coalescedController = createWorkbenchDirectZoomController(coalescedFrames)
    const burstInstance = createViewportInstance()
    const coalescedInstance = createViewportInstance()
    const input = {
      anchor: { x: 320, y: 240 },
      reducedMotion: false
    }

    burstController.retarget(burstInstance.value, { ...input, deltaZoomStops: 0.1 })
    for (let eventIndex = 0; eventIndex < 3; eventIndex += 1) {
      burstFrames.elapseWithoutFrames(4)
      burstController.retarget(burstInstance.value, { ...input, deltaZoomStops: 0.1 })
    }
    burstFrames.step(1_000 / 60 - 12)

    coalescedController.retarget(coalescedInstance.value, {
      ...input,
      deltaZoomStops: 0.4
    })
    coalescedFrames.step(1_000 / 60)

    expect(burstInstance.viewport.zoom).toBeCloseTo(coalescedInstance.viewport.zoom, 10)
    expect(burstInstance.viewport.x).toBeCloseTo(coalescedInstance.viewport.x, 10)
    expect(burstInstance.viewport.y).toBeCloseTo(coalescedInstance.viewport.y, 10)
    burstController.cancel()
    coalescedController.cancel()
  })

  it('coalesces a wheel burst into one continuous motion while keeping the pointer world anchor fixed', async () => {
    const frames = new TestFrameScheduler()
    const controller = createWorkbenchDirectZoomController(frames)
    const instance = createViewportInstance({ x: 80, y: -40, zoom: 1 })
    const anchor = { x: 320, y: 220 }
    const worldAnchor = {
      x: (anchor.x - instance.viewport.x) / instance.viewport.zoom,
      y: (anchor.y - instance.viewport.y) / instance.viewport.zoom
    }
    const presentations: Viewport[] = []
    const completions: Viewport[] = []

    controller.subscribePresentation(instance.value, (viewport) => presentations.push(viewport))
    controller.subscribe(instance.value, ({ viewport }) => completions.push(viewport))

    expect(
      controller.retarget(instance.value, {
        anchor,
        deltaZoomStops: 0.1,
        reducedMotion: false
      })
    ).toBe(true)
    expect(
      controller.retarget(instance.value, {
        anchor,
        deltaZoomStops: 0.1,
        reducedMotion: false
      })
    ).toBe(false)

    expect(instance.viewport.zoom).toBe(1)
    expect(instance.value.setViewport).not.toHaveBeenCalled()
    expect(frames.pendingCount).toBe(1)

    frames.step()
    await vi.waitFor(() => expect(presentations).toHaveLength(1))

    expect(Math.log2(instance.viewport.zoom)).toBeGreaterThan(0.07)
    expect(Math.log2(instance.viewport.zoom)).toBeLessThan(0.14)
    expect(instance.viewport.zoom).toBeLessThan(2 ** 0.2)
    expect(instance.value.setViewport).toHaveBeenCalledTimes(1)
    expect(completions).toEqual([])

    frames.finish()
    frames.elapseWithoutFrames(150)
    await vi.waitFor(() => expect(completions).toHaveLength(1))

    expect(instance.viewport.zoom).toBeCloseTo(2 ** 0.2, 10)
    expect(presentations.length).toBeGreaterThan(2)
    presentations.forEach((viewport) => {
      expect((anchor.x - viewport.x) / viewport.zoom).toBeCloseTo(worldAnchor.x, 10)
      expect((anchor.y - viewport.y) / viewport.zoom).toBeCloseTo(worldAnchor.y, 10)
    })
    expect(completions).toEqual([instance.viewport])
  })

  it('preserves presentation velocity when wheel input reverses', () => {
    const frames = new TestFrameScheduler()
    const controller = createWorkbenchDirectZoomController(frames)
    const instance = createViewportInstance()
    const input = {
      anchor: { x: 480, y: 320 },
      reducedMotion: false
    }

    controller.retarget(instance.value, { ...input, deltaZoomStops: 0.5 })
    frames.step()
    const zoomBeforeReversal = Math.log2(instance.viewport.zoom)

    controller.retarget(instance.value, { ...input, deltaZoomStops: -0.3 })
    frames.step()
    const zoomAfterReversal = Math.log2(instance.viewport.zoom)

    expect(zoomAfterReversal).toBeGreaterThan(zoomBeforeReversal)
    frames.finish()
    expect(instance.viewport.zoom).toBeCloseTo(2 ** 0.2, 3)
    controller.cancel()
  })

  it('clamps every delta mode to the shared canvas zoom bounds', async () => {
    const frames = new TestFrameScheduler()
    const controller = createWorkbenchDirectZoomController(frames)
    const maximumInstance = createViewportInstance({ x: 0, y: 0, zoom: 1.55 })
    const minimumInstance = createViewportInstance({ x: 0, y: 0, zoom: 0.36 })

    controller.retarget(maximumInstance.value, {
      anchor: { x: 400, y: 300 },
      deltaZoomStops: 4,
      reducedMotion: true
    })
    frames.elapseWithoutFrames(150)
    await vi.waitFor(() => expect(maximumInstance.viewport.zoom).toBe(1.6))

    controller.retarget(minimumInstance.value, {
      anchor: { x: 400, y: 300 },
      deltaZoomStops: -4,
      reducedMotion: true
    })
    frames.elapseWithoutFrames(150)
    await vi.waitFor(() => expect(minimumInstance.viewport.zoom).toBe(0.35))
  })

  it('applies reduced motion immediately but commits only once after the wheel burst ends', async () => {
    const frames = new TestFrameScheduler()
    const controller = createWorkbenchDirectZoomController(frames)
    const instance = createViewportInstance()
    const completions: Viewport[] = []

    controller.subscribe(instance.value, ({ viewport }) => completions.push(viewport))
    controller.retarget(instance.value, {
      anchor: { x: 300, y: 200 },
      deltaZoomStops: 0.1,
      reducedMotion: true
    })
    const firstTarget = instance.viewport.zoom
    controller.retarget(instance.value, {
      anchor: { x: 300, y: 200 },
      deltaZoomStops: 0.1,
      reducedMotion: true
    })

    expect(instance.viewport.zoom).toBeGreaterThan(firstTarget)
    expect(completions).toEqual([])
    expect(frames.pendingCount).toBe(0)

    frames.elapseWithoutFrames(149)
    expect(completions).toEqual([])
    frames.elapseWithoutFrames(1)
    await vi.waitFor(() => expect(completions).toEqual([instance.viewport]))
  })

  it('settles the current wheel target when reduced motion changes at runtime', async () => {
    const frames = new TestFrameScheduler()
    const controller = createWorkbenchDirectZoomController(frames)
    const instance = createViewportInstance()
    const completions: Viewport[] = []
    controller.subscribe(instance.value, ({ viewport }) => completions.push(viewport))
    controller.retarget(instance.value, {
      anchor: { x: 300, y: 200 },
      deltaZoomStops: 0.25,
      reducedMotion: false
    })
    frames.step()

    controller.setReducedMotion(true, instance.value)

    await vi.waitFor(() => expect(instance.viewport.zoom).toBeCloseTo(2 ** 0.25, 10))
    expect(frames.pendingCount).toBe(0)
    expect(completions).toEqual([])
    frames.elapseWithoutFrames(150)
    await vi.waitFor(() => expect(completions).toEqual([instance.viewport]))
  })

  it('cancels at the current presentation without a late completion', () => {
    const frames = new TestFrameScheduler()
    const controller = createWorkbenchDirectZoomController(frames)
    const instance = createViewportInstance()
    const completions = vi.fn()

    controller.subscribe(instance.value, completions)
    controller.retarget(instance.value, {
      anchor: { x: 480, y: 320 },
      deltaZoomStops: 0.5,
      reducedMotion: false
    })
    frames.step()
    const presentation = instance.viewport
    controller.cancel(instance.value)
    frames.elapseWithoutFrames(2_000)
    frames.finish()

    expect(instance.viewport).toEqual(presentation)
    expect(completions).not.toHaveBeenCalled()
    expect(frames.pendingCount).toBe(0)
    expect(frames.pendingTimeoutCount).toBe(0)
  })

  it('suppresses an asynchronously applied presentation from an older wheel target', async () => {
    const frames = new TestFrameScheduler()
    const controller = createWorkbenchDirectZoomController(frames)
    const instance = createDeferredViewportInstance()
    const presentations: Viewport[] = []
    const completions: Viewport[] = []

    controller.subscribePresentation(instance.value, (viewport) => presentations.push(viewport))
    controller.subscribe(instance.value, ({ viewport }) => completions.push(viewport))
    controller.retarget(instance.value, {
      anchor: { x: 320, y: 240 },
      deltaZoomStops: 0.1,
      reducedMotion: true
    })
    controller.retarget(instance.value, {
      anchor: { x: 320, y: 240 },
      deltaZoomStops: 0.1,
      reducedMotion: true
    })

    instance.applications[0]?.complete(true)
    await Promise.resolve()
    expect(presentations).toEqual([])

    instance.applications[1]?.complete(true)
    await vi.waitFor(() => expect(presentations).toEqual([instance.applications[1]?.viewport]))
    frames.elapseWithoutFrames(150)
    expect(completions).toEqual([])

    instance.applications[2]?.complete(true)
    await vi.waitFor(() => expect(completions).toEqual([instance.applications[2]?.viewport]))
  })

  it('commits the exact target when animation frames stop arriving', async () => {
    const frames = new TestFrameScheduler()
    const controller = createWorkbenchDirectZoomController(frames)
    const instance = createViewportInstance()
    const completions: Viewport[] = []

    controller.subscribe(instance.value, ({ viewport }) => completions.push(viewport))
    controller.retarget(instance.value, {
      anchor: { x: 480, y: 320 },
      deltaZoomStops: 0.25,
      reducedMotion: false
    })
    frames.step()
    frames.elapseWithoutFrames(1_350)

    await vi.waitFor(() => expect(completions).toEqual([instance.viewport]))
    expect(instance.viewport.zoom).toBeCloseTo(2 ** 0.25, 10)
    expect(frames.pendingCount).toBe(0)
    expect(frames.pendingTimeoutCount).toBe(0)
  })
})

function createViewportInstance(initialViewport: Viewport = { x: 0, y: 0, zoom: 1 }) {
  let viewport = initialViewport
  const value = {
    getViewport: () => viewport,
    setViewport: vi.fn(async (nextViewport: Viewport) => {
      viewport = nextViewport
      return true
    })
  } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>

  return {
    get viewport() {
      return viewport
    },
    value
  }
}

function createDeferredViewportInstance(): {
  readonly applications: Array<{
    readonly complete: (applied: boolean) => void
    readonly viewport: Viewport
  }>
  readonly value: ReactFlowInstance<WorkbenchFlowNode, Edge>
} {
  let viewport: Viewport = { x: 0, y: 0, zoom: 1 }
  const applications: Array<{
    readonly complete: (applied: boolean) => void
    readonly viewport: Viewport
  }> = []
  const value = {
    getViewport: () => viewport,
    setViewport: (nextViewport: Viewport) => {
      viewport = nextViewport
      return new Promise<boolean>((complete) => applications.push({ complete, viewport }))
    }
  } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>

  return { applications, value }
}

class TestFrameScheduler {
  private callbacks = new Map<number, FrameRequestCallback>()
  private timeoutCallbacks = new Map<
    number,
    { readonly callback: () => void; readonly dueAt: number }
  >()
  private nextFrameId = 1
  private nextTimeoutId = 1
  private timestamp = 0

  readonly cancelFrame = (frameId: number): void => {
    this.callbacks.delete(frameId)
  }

  readonly cancelTimeout = (timeoutId: number): void => {
    this.timeoutCallbacks.delete(timeoutId)
  }

  readonly now = (): number => this.timestamp

  readonly requestFrame = (callback: FrameRequestCallback): number => {
    const frameId = this.nextFrameId
    this.nextFrameId += 1
    this.callbacks.set(frameId, callback)
    return frameId
  }

  readonly requestTimeout = (callback: () => void, delayMilliseconds: number): number => {
    const timeoutId = this.nextTimeoutId
    this.nextTimeoutId += 1
    this.timeoutCallbacks.set(timeoutId, {
      callback,
      dueAt: this.timestamp + delayMilliseconds
    })
    return timeoutId
  }

  get pendingCount(): number {
    return this.callbacks.size
  }

  get pendingTimeoutCount(): number {
    return this.timeoutCallbacks.size
  }

  elapseWithoutFrames(milliseconds: number): void {
    this.timestamp += milliseconds
    this.runDueTimeouts()
  }

  step(milliseconds = 1_000 / 60): void {
    this.timestamp += milliseconds
    const callbacks = [...this.callbacks.values()]
    this.callbacks.clear()
    callbacks.forEach((callback) => callback(this.timestamp))
    this.runDueTimeouts()
  }

  finish(): void {
    for (let frame = 0; frame < 180 && this.pendingCount > 0; frame += 1) {
      this.step()
    }
    if (this.pendingCount > 0) {
      throw new Error('Direct zoom spring did not settle within the test frame budget.')
    }
  }

  private runDueTimeouts(): void {
    const dueTimeouts = [...this.timeoutCallbacks.entries()].filter(
      ([, timeout]) => timeout.dueAt <= this.timestamp
    )
    for (const [timeoutId, timeout] of dueTimeouts) {
      this.timeoutCallbacks.delete(timeoutId)
      timeout.callback()
    }
  }
}
