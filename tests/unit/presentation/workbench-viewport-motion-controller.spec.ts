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

function createViewportInstance() {
  let viewport: Viewport = { x: 0, y: 0, zoom: 1 }
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
  private nextFrameId = 1
  private timestamp = 0
  maximumPendingCount = 0

  readonly cancelFrame = (frameId: number): void => {
    this.callbacks.delete(frameId)
  }

  readonly now = (): number => this.timestamp

  readonly requestFrame = (callback: FrameRequestCallback): number => {
    const frameId = this.nextFrameId
    this.nextFrameId += 1
    this.callbacks.set(frameId, callback)
    this.maximumPendingCount = Math.max(this.maximumPendingCount, this.callbacks.size)
    return frameId
  }

  get pendingCount(): number {
    return this.callbacks.size
  }

  step(milliseconds = 1000 / 60): void {
    this.timestamp += milliseconds
    const callbacks = [...this.callbacks.values()]
    this.callbacks.clear()
    callbacks.forEach((callback) => callback(this.timestamp))
  }

  finish(): void {
    for (let frame = 0; frame < 180 && this.pendingCount > 0; frame += 1) {
      this.step()
    }
    if (this.pendingCount > 0) {
      throw new Error('Viewport spring did not settle within the test frame budget.')
    }
  }
}
