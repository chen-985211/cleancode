import {
  createWorkbenchNodeHoverMotionController,
  resolveWorkbenchHoverImpulse,
  type WorkbenchNodeHoverMotionFrameScheduler,
  type WorkbenchNodeHoverMotionSurface
} from '../../../src/presentation/app-shell/workbenchNodeHoverMotion'

describe('workbench node hover motion', () => {
  it('turns pointer velocity into a restrained nonlinear impulse', () => {
    expect(resolveWorkbenchHoverImpulse(0)).toBe(0)
    expect(resolveWorkbenchHoverImpulse(20)).toBeCloseTo(0.663, 3)
    expect(resolveWorkbenchHoverImpulse(-20)).toBeCloseTo(-0.663, 3)
    expect(resolveWorkbenchHoverImpulse(1_000)).toBe(2.4)
  })

  it('responds from the current presentation and settles without a scripted overshoot', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const controller = createWorkbenchNodeHoverMotionController({ scheduler })

    controller.pointerMoved(null, { x: 0, y: 0 })
    controller.pointerMoved(surface, { x: 20, y: 8 })
    scheduler.advanceNextFrame()

    expect(surface.classNames).toContain('workbench-object-hover-motion--active')
    expect(
      Number(surface.properties.get('--workbench-object-hover-x')?.replace('px', ''))
    ).toBeCloseTo(resolveWorkbenchHoverImpulse(20), 3)
    expect(
      Number(surface.properties.get('--workbench-object-hover-y')?.replace('px', ''))
    ).toBeCloseTo(resolveWorkbenchHoverImpulse(8), 3)

    controller.pointerMoved(null, { x: 32, y: 12 })
    scheduler.advanceUntilIdle()

    expect(surface.properties.has('--workbench-object-hover-x')).toBe(false)
    expect(surface.properties.has('--workbench-object-hover-y')).toBe(false)
    expect(surface.classNames).not.toContain('workbench-object-hover-motion--active')
  })

  it('clears presentation immediately when dragging or reduced motion suspends feedback', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const controller = createWorkbenchNodeHoverMotionController({ scheduler })

    controller.pointerMoved(null, { x: 0, y: 0 })
    controller.pointerMoved(surface, { x: 40, y: 20 })
    controller.suspend()

    expect(surface.properties.size).toBe(0)
    expect(surface.classNames).not.toContain('workbench-object-hover-motion--active')
    expect(scheduler.pendingFrames()).toBe(0)
  })

  it('stops scheduling frames after an impulse settles while the pointer stays over the node', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const controller = createWorkbenchNodeHoverMotionController({ scheduler })

    controller.pointerMoved(null, { x: 0, y: 0 })
    controller.pointerMoved(surface, { x: 12, y: 6 })
    scheduler.advanceUntilIdle()

    expect(surface.properties.size).toBe(0)
    expect(scheduler.pendingFrames()).toBe(0)
  })

  it('samples pointer travel once per display frame instead of accumulating raw event frequency', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const controller = createWorkbenchNodeHoverMotionController({ scheduler })

    controller.pointerMoved(null, { x: 0, y: 0 })
    controller.pointerMoved(surface, { x: 4, y: 2 })
    controller.pointerMoved(surface, { x: 20, y: 8 })
    scheduler.advanceNextFrame()

    expect(
      Number(surface.properties.get('--workbench-object-hover-x')?.replace('px', ''))
    ).toBeCloseTo(resolveWorkbenchHoverImpulse(20), 3)
    expect(scheduler.pendingFrames()).toBe(1)
  })

  it('tracks approach on blank canvas without running an idle animation loop', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const controller = createWorkbenchNodeHoverMotionController({ scheduler })

    controller.pointerMoved(null, { x: 0, y: 0 })
    controller.pointerMoved(null, { x: 8, y: 4 })
    expect(scheduler.pendingFrames()).toBe(0)

    controller.pointerMoved(surface, { x: 20, y: 10 })
    scheduler.advanceNextFrame()

    expect(
      Number(surface.properties.get('--workbench-object-hover-x')?.replace('px', ''))
    ).toBeCloseTo(resolveWorkbenchHoverImpulse(12), 3)
  })
})

function createSurface(): WorkbenchNodeHoverMotionSurface & {
  readonly classNames: Set<string>
  readonly properties: Map<string, string>
} {
  const classNames = new Set<string>()
  const properties = new Map<string, string>()

  return {
    classList: {
      add: (className) => {
        classNames.add(className)
      },
      remove: (className) => {
        classNames.delete(className)
      }
    },
    classNames,
    properties,
    style: {
      removeProperty: (property) => {
        const previousValue = properties.get(property) ?? ''
        properties.delete(property)
        return previousValue
      },
      setProperty: (property, value) => {
        properties.set(property, value ?? '')
      }
    }
  }
}

function createFrameScheduler(): WorkbenchNodeHoverMotionFrameScheduler & {
  readonly advanceNextFrame: () => void
  readonly advanceUntilIdle: () => void
  readonly pendingFrames: () => number
} {
  let nextFrameId = 1
  let now = 0
  const callbacks = new Map<number, FrameRequestCallback>()

  return {
    advanceNextFrame: () => {
      now += 1000 / 120
      const pendingCallbacks = [...callbacks.values()]
      callbacks.clear()
      pendingCallbacks.forEach((callback) => callback(now))
    },
    advanceUntilIdle: () => {
      for (let frame = 0; frame < 240 && callbacks.size > 0; frame += 1) {
        now += 1000 / 120
        const pendingCallbacks = [...callbacks.values()]
        callbacks.clear()
        pendingCallbacks.forEach((callback) => callback(now))
      }
    },
    cancelFrame: (frameId) => callbacks.delete(frameId),
    now: () => now,
    pendingFrames: () => callbacks.size,
    requestFrame: (callback) => {
      const frameId = nextFrameId
      nextFrameId += 1
      callbacks.set(frameId, callback)
      return frameId
    }
  }
}
