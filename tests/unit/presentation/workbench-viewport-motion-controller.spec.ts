import type { Edge, ReactFlowInstance, Viewport } from '@xyflow/react'

import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types'
import {
  createWorkbenchViewportMotionController,
  type WorkbenchViewportCommand
} from '../../../src/presentation/app-shell/workbenchViewportMotion'

describe('workbench viewport motion controller', () => {
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
