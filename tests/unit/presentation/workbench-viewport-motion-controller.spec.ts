import type { Edge, ReactFlowInstance, Viewport } from '@xyflow/react'

import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types'
import {
  createWorkbenchViewportMotionController,
  type WorkbenchViewportCommand
} from '../../../src/presentation/app-shell/workbenchViewportMotion'

describe('workbench viewport motion controller', () => {
  it('presents the same spring state at the same elapsed time on 60Hz and 120Hz displays', async () => {
    const sixtyHertzFrames = new TestFrameScheduler()
    const hundredTwentyHertzFrames = new TestFrameScheduler()
    const sixtyHertzController = createWorkbenchViewportMotionController(sixtyHertzFrames)
    const hundredTwentyHertzController =
      createWorkbenchViewportMotionController(hundredTwentyHertzFrames)
    const sixtyHertzInstance = createViewportInstance()
    const hundredTwentyHertzInstance = createViewportInstance()
    const sixtyHertzCompletion = sixtyHertzController.transition(
      sixtyHertzInstance.value,
      centerCommand(1_480)
    )
    const hundredTwentyHertzCompletion = hundredTwentyHertzController.transition(
      hundredTwentyHertzInstance.value,
      centerCommand(1_480)
    )

    sixtyHertzFrames.step(1_000 / 60)
    hundredTwentyHertzFrames.step(1_000 / 120)
    hundredTwentyHertzFrames.step(1_000 / 120)

    expect(hundredTwentyHertzInstance.viewport.x).toBeCloseTo(sixtyHertzInstance.viewport.x, 8)
    expect(hundredTwentyHertzInstance.viewport.y).toBeCloseTo(sixtyHertzInstance.viewport.y, 8)
    expect(hundredTwentyHertzInstance.viewport.zoom).toBeCloseTo(
      sixtyHertzInstance.viewport.zoom,
      8
    )

    sixtyHertzController.cancel()
    hundredTwentyHertzController.cancel()
    await expect(sixtyHertzCompletion).resolves.toBe(false)
    await expect(hundredTwentyHertzCompletion).resolves.toBe(false)
  })

  it('advances through a delayed frame using real elapsed time instead of slowing the motion clock', async () => {
    const regularFrames = new TestFrameScheduler()
    const delayedFrames = new TestFrameScheduler()
    const regularController = createWorkbenchViewportMotionController(regularFrames)
    const delayedController = createWorkbenchViewportMotionController(delayedFrames)
    const regularInstance = createViewportInstance()
    const delayedInstance = createViewportInstance()
    const regularCompletion = regularController.transition(
      regularInstance.value,
      centerCommand(1_480)
    )
    const delayedCompletion = delayedController.transition(
      delayedInstance.value,
      centerCommand(1_480)
    )

    regularFrames.step()
    delayedFrames.step()
    for (let frame = 0; frame < 6; frame += 1) {
      regularFrames.step()
    }
    delayedFrames.step(100)

    expect(delayedInstance.viewport.x).toBeCloseTo(regularInstance.viewport.x, 8)
    expect(delayedInstance.viewport.y).toBeCloseTo(regularInstance.viewport.y, 8)
    expect(delayedInstance.viewport.zoom).toBeCloseTo(regularInstance.viewport.zoom, 8)

    regularController.cancel()
    delayedController.cancel()
    await expect(regularCompletion).resolves.toBe(false)
    await expect(delayedCompletion).resolves.toBe(false)
  })

  it('commits the final target when the display stops delivering animation frames', async () => {
    const frames = new TestFrameScheduler()
    const controller = createWorkbenchViewportMotionController(frames)
    const instance = createViewportInstance()
    const completion = controller.transition(instance.value, centerCommand(1_480))

    frames.step()
    const presentationBeforeSuspension = instance.viewport
    frames.elapseWithoutFrames(1_200)

    expect(presentationBeforeSuspension).not.toEqual({ x: -1_000, y: 0, zoom: 1 })
    expect(instance.viewport).toEqual({ x: -1_000, y: 0, zoom: 1 })
    await expect(completion).resolves.toBe(true)
    expect(frames.pendingCount).toBe(0)
    expect(frames.pendingTimeoutCount).toBe(0)
  })

  it('uses the same anchored zoom curve at every world position', async () => {
    const canvasSize = { height: 640, width: 960 }
    const originFrames = new TestFrameScheduler()
    const distantFrames = new TestFrameScheduler()
    const originController = createWorkbenchViewportMotionController(originFrames)
    const distantController = createWorkbenchViewportMotionController(distantFrames)
    const originCenter = { x: 0, y: 0 }
    const distantCenter = { x: 3_000, y: 2_000 }
    const originInstance = createViewportInstance(centeredViewport(originCenter, 0.35, canvasSize))
    const distantInstance = createViewportInstance(
      centeredViewport(distantCenter, 0.35, canvasSize)
    )
    const originCompletion = originController.transition(
      originInstance.value,
      focusCommand(originCenter, 0.9)
    )
    const distantCompletion = distantController.transition(
      distantInstance.value,
      focusCommand(distantCenter, 0.9)
    )
    let previousZoom = 0.35

    for (let frame = 0; frame < 8; frame += 1) {
      originFrames.step()
      distantFrames.step()
      expect(distantInstance.viewport.zoom).toBeCloseTo(originInstance.viewport.zoom, 12)
      expect(distantInstance.viewport.zoom).toBeGreaterThanOrEqual(previousZoom)
      expect(
        (canvasSize.width / 2 - distantInstance.viewport.x) / distantInstance.viewport.zoom
      ).toBeCloseTo(distantCenter.x, 10)
      expect(
        (canvasSize.height / 2 - distantInstance.viewport.y) / distantInstance.viewport.zoom
      ).toBeCloseTo(distantCenter.y, 10)
      previousZoom = distantInstance.viewport.zoom
    }

    originController.cancel()
    distantController.cancel()
    await expect(originCompletion).resolves.toBe(false)
    await expect(distantCompletion).resolves.toBe(false)
  })

  it('makes focus and overview zoom perceptually symmetric in log space', async () => {
    const canvasSize = { height: 640, width: 960 }
    const center = { x: 1_800, y: 1_100 }
    const focusFrames = new TestFrameScheduler()
    const overviewFrames = new TestFrameScheduler()
    const focusController = createWorkbenchViewportMotionController(focusFrames)
    const overviewController = createWorkbenchViewportMotionController(overviewFrames)
    const focusInstance = createViewportInstance(centeredViewport(center, 0.35, canvasSize))
    const overviewInstance = createViewportInstance(centeredViewport(center, 0.9, canvasSize))
    const focusCompletion = focusController.transition(
      focusInstance.value,
      focusCommand(center, 0.9)
    )
    const overviewCompletion = overviewController.transition(
      overviewInstance.value,
      focusCommand(center, 0.35)
    )

    const zoomRange = Math.log2(0.9) - Math.log2(0.35)
    let previousFocusZoom = 0.35
    let previousOverviewZoom = 0.9
    for (let frame = 0; frame < 8; frame += 1) {
      focusFrames.step()
      overviewFrames.step()

      const focusProgress = (Math.log2(focusInstance.viewport.zoom) - Math.log2(0.35)) / zoomRange
      const overviewProgress =
        (Math.log2(0.9) - Math.log2(overviewInstance.viewport.zoom)) / zoomRange
      expect(focusProgress).toBeCloseTo(overviewProgress, 12)
      expect(focusInstance.viewport.zoom).toBeGreaterThanOrEqual(previousFocusZoom)
      expect(overviewInstance.viewport.zoom).toBeLessThanOrEqual(previousOverviewZoom)
      previousFocusZoom = focusInstance.viewport.zoom
      previousOverviewZoom = overviewInstance.viewport.zoom
    }

    focusController.cancel()
    overviewController.cancel()
    await expect(focusCompletion).resolves.toBe(false)
    await expect(overviewCompletion).resolves.toBe(false)
  })

  it('briefly widens the view for a distant focus flight without making nearby moves breathe', async () => {
    const distantFrames = new TestFrameScheduler()
    const nearbyFrames = new TestFrameScheduler()
    const distantController = createWorkbenchViewportMotionController(distantFrames)
    const nearbyController = createWorkbenchViewportMotionController(nearbyFrames)
    const distantInstance = createViewportInstance()
    const nearbyInstance = createViewportInstance()
    const distantCompletion = distantController.transition(
      distantInstance.value,
      centerCommand(4_480)
    )
    const nearbyCompletion = nearbyController.transition(nearbyInstance.value, centerCommand(580))

    for (let frame = 0; frame < 7; frame += 1) {
      distantFrames.step()
      nearbyFrames.step()
    }

    expect(distantInstance.viewport.zoom).toBeLessThan(0.85)
    expect(distantInstance.viewport.zoom).toBeGreaterThanOrEqual(0.35)
    expect(nearbyInstance.viewport.zoom).toBeCloseTo(1, 8)

    distantFrames.finish()
    nearbyFrames.finish()
    await expect(distantCompletion).resolves.toBe(true)
    await expect(nearbyCompletion).resolves.toBe(true)
    expect(distantInstance.viewport).toEqual({ x: -4_000, y: 0, zoom: 1 })
    expect(nearbyInstance.viewport).toEqual({ x: -100, y: 0, zoom: 1 })
  })

  it('publishes only the latest successfully settled programmatic viewport', async () => {
    const frames = new TestFrameScheduler()
    const controller = createWorkbenchViewportMotionController(frames)
    const instance = createViewportInstance()
    const completions: Array<{ readonly viewport: Viewport }> = []
    const unsubscribe = controller.subscribe(instance.value, (completion) => {
      completions.push(completion)
    })
    const firstCompletion = controller.transition(instance.value, centerCommand(1_480))

    frames.step()
    frames.step()
    expect(completions).toEqual([])

    const latestCompletion = controller.transition(instance.value, centerCommand(380))

    frames.finish()
    await expect(firstCompletion).resolves.toBe(false)
    await expect(latestCompletion).resolves.toBe(true)
    expect(completions).toEqual([
      {
        intent: {
          canvasSize: { height: 640, width: 960 },
          type: 'adaptive-focus'
        },
        viewport: { x: 100, y: 0, zoom: 1 }
      }
    ])

    unsubscribe()
  })

  it('publishes each successfully applied presentation viewport', async () => {
    const frames = new TestFrameScheduler()
    const controller = createWorkbenchViewportMotionController(frames)
    const instance = createViewportInstance()
    const presentations: Viewport[] = []
    const unsubscribe = controller.subscribePresentation(instance.value, (viewport) => {
      presentations.push(viewport)
    })
    const completion = controller.transition(instance.value, centerCommand(1_480))

    frames.step()
    await vi.waitFor(() => expect(presentations).toHaveLength(1))
    expect(presentations[0]).toEqual(instance.viewport)

    frames.finish()
    await expect(completion).resolves.toBe(true)
    expect(presentations.at(-1)).toEqual({ x: -1_000, y: 0, zoom: 1 })

    unsubscribe()
  })

  it('retargets one in-flight spring from its presentation value and preserves velocity', async () => {
    const frames = new TestFrameScheduler()
    const controller = createWorkbenchViewportMotionController(frames)
    const instance = createViewportInstance()
    const firstCompletion = controller.transition(instance.value, centerCommand(580))

    frames.step()
    frames.step()
    const positionBeforeRetarget = instance.viewport.x
    const secondCompletion = controller.transition(instance.value, centerCommand(380))

    await expect(firstCompletion).resolves.toBe(false)
    expect(frames.pendingCount).toBe(1)

    frames.step()
    expect(instance.viewport.x).toBeLessThan(positionBeforeRetarget)

    frames.finish()
    await expect(secondCompletion).resolves.toBe(true)
    expect(instance.viewport).toEqual({ x: 100, y: 0, zoom: 1 })
    expect(frames.maximumPendingCount).toBe(1)
  })

  it('retargets a distant flight without jumping or zeroing its visible velocity', async () => {
    const frames = new TestFrameScheduler()
    const controller = createWorkbenchViewportMotionController(frames)
    const instance = createViewportInstance()
    const firstCompletion = controller.transition(instance.value, centerCommand(4_480))

    frames.step()
    frames.step()
    frames.step()
    const presentationBeforeRetarget = instance.viewport
    const secondCompletion = controller.transition(instance.value, centerCommand(-3_520))

    await expect(firstCompletion).resolves.toBe(false)
    expect(instance.viewport).toEqual(presentationBeforeRetarget)

    frames.step()
    expect(instance.viewport.x).toBeLessThan(presentationBeforeRetarget.x)

    frames.finish()
    await expect(secondCompletion).resolves.toBe(true)
    expect(instance.viewport).toEqual({ x: 4_000, y: 0, zoom: 1 })
  })

  it('cancels in the current presentation frame so direct manipulation can take over', async () => {
    const frames = new TestFrameScheduler()
    const controller = createWorkbenchViewportMotionController(frames)
    const instance = createViewportInstance()
    const completion = controller.transition(instance.value, centerCommand(1_480))

    frames.step()
    const presentationViewport = instance.viewport
    controller.cancel(instance.value)
    frames.finish()

    await expect(completion).resolves.toBe(false)
    expect(instance.viewport).toEqual(presentationViewport)
    expect(frames.pendingCount).toBe(0)
    expect(frames.pendingTimeoutCount).toBe(0)
  })

  it('lets an instant workspace restore supersede a spring without a late completion', async () => {
    const frames = new TestFrameScheduler()
    const controller = createWorkbenchViewportMotionController(frames)
    const instance = createViewportInstance()
    const staleCompletion = controller.transition(instance.value, centerCommand(1_480))

    frames.step()
    const restoreCompletion = controller.transition(instance.value, {
      intent: { type: 'instant' },
      type: 'set-viewport',
      viewport: { x: -240, y: 80, zoom: 0.75 }
    })

    await expect(staleCompletion).resolves.toBe(false)
    await expect(restoreCompletion).resolves.toBe(true)
    expect(instance.viewport).toEqual({ x: -240, y: 80, zoom: 0.75 })
    expect(frames.pendingCount).toBe(0)
    expect(frames.pendingTimeoutCount).toBe(0)
  })

  it('rejects a stale completion when a newer instant target starts before apply resolves', async () => {
    const frames = new TestFrameScheduler()
    const controller = createWorkbenchViewportMotionController(frames)
    const instance = createDeferredViewportInstance()
    const staleCompletion = controller.transition(instance.value, {
      intent: { type: 'instant' },
      type: 'set-viewport',
      viewport: { x: -120, y: 40, zoom: 0.9 }
    })
    const latestCompletion = controller.transition(instance.value, {
      intent: { type: 'instant' },
      type: 'set-viewport',
      viewport: { x: -280, y: 80, zoom: 0.7 }
    })

    instance.completions[0]?.(true)
    await expect(staleCompletion).resolves.toBe(false)

    instance.completions[1]?.(true)
    await expect(latestCompletion).resolves.toBe(true)
  })
})

function centerCommand(centerX: number): WorkbenchViewportCommand {
  return {
    center: { x: centerX, y: 320 },
    intent: {
      canvasSize: { height: 640, width: 960 },
      type: 'adaptive-focus'
    },
    type: 'center',
    zoom: 1
  }
}

function focusCommand(
  center: { readonly x: number; readonly y: number },
  zoom: number
): WorkbenchViewportCommand {
  return {
    center,
    intent: {
      canvasSize: { height: 640, width: 960 },
      type: 'adaptive-focus'
    },
    type: 'center',
    zoom
  }
}

function centeredViewport(
  center: { readonly x: number; readonly y: number },
  zoom: number,
  canvasSize: { readonly height: number; readonly width: number }
): Viewport {
  return {
    x: canvasSize.width / 2 - center.x * zoom,
    y: canvasSize.height / 2 - center.y * zoom,
    zoom
  }
}

function createViewportInstance(initialViewport: Viewport = { x: 0, y: 0, zoom: 1 }) {
  let viewport = initialViewport
  const setViewport = vi.fn(async (nextViewport: Viewport) => {
    viewport = nextViewport
    return true
  })
  const value = {
    getNodes: () => [],
    getNodesBounds: () => ({ height: 0, width: 0, x: 0, y: 0 }),
    getViewport: () => viewport,
    setViewport
  } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>

  return {
    get viewport() {
      return viewport
    },
    value
  }
}

function createDeferredViewportInstance(): {
  readonly completions: Array<(completed: boolean) => void>
  readonly value: ReactFlowInstance<WorkbenchFlowNode, Edge>
} {
  let viewport: Viewport = { x: 0, y: 0, zoom: 1 }
  const completions: Array<(completed: boolean) => void> = []
  const value = {
    getNodes: () => [],
    getNodesBounds: () => ({ height: 0, width: 0, x: 0, y: 0 }),
    getViewport: () => viewport,
    setViewport: (nextViewport: Viewport) => {
      viewport = nextViewport
      return new Promise<boolean>((resolve) => completions.push(resolve))
    }
  } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>

  return { completions, value }
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
  maximumPendingCount = 0

  readonly cancelFrame = (frameId: number): void => {
    this.callbacks.delete(frameId)
  }

  readonly now = (): number => this.timestamp

  readonly cancelTimeout = (timeoutId: number): void => {
    this.timeoutCallbacks.delete(timeoutId)
  }

  readonly requestFrame = (callback: FrameRequestCallback): number => {
    const frameId = this.nextFrameId
    this.nextFrameId += 1
    this.callbacks.set(frameId, callback)
    this.maximumPendingCount = Math.max(this.maximumPendingCount, this.callbacks.size)
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

  step(milliseconds = 1000 / 60): void {
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
      throw new Error('Viewport spring did not settle within the test frame budget.')
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
