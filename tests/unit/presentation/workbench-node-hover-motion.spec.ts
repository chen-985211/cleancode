import {
  createWorkbenchNodeHoverMotionController,
  workbenchNodeHoverScale,
  type WorkbenchNodeHoverMotionFrameScheduler,
  type WorkbenchNodeHoverMotionSurface
} from '../../../src/presentation/app-shell/workbenchNodeHoverMotion'

describe('workbench node hover motion', () => {
  it('grows past the hover scale once, then settles back without moving the node', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const controller = createWorkbenchNodeHoverMotionController({ scheduler })

    controller.hoveredSurfaceChanged(surface)

    const presentedScales = advanceAndReadScales(scheduler, surface)

    expect(surface.classNames).toContain('workbench-object-hover-motion--active')
    expect(Math.max(...presentedScales)).toBeGreaterThan(workbenchNodeHoverScale)
    expect(readScale(surface)).toBeCloseTo(workbenchNodeHoverScale, 4)
    expect(surface.properties.has('--workbench-object-hover-x')).toBe(false)
    expect(surface.properties.has('--workbench-object-hover-y')).toBe(false)
    expect(scheduler.pendingFrames()).toBe(0)
  })

  it('springs from the live hover scale back to rest when the pointer leaves', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const controller = createWorkbenchNodeHoverMotionController({ scheduler })

    controller.hoveredSurfaceChanged(surface)
    scheduler.advanceNextFrame()
    scheduler.advanceNextFrame()
    const scaleBeforeLeave = readScale(surface)

    controller.hoveredSurfaceChanged(null)

    expect(readScale(surface)).toBe(scaleBeforeLeave)
    expect(surface.classNames).toContain('workbench-object-hover-motion--active')

    scheduler.advanceUntilIdle()

    expect(surface.properties.has('--workbench-object-hover-scale')).toBe(false)
    expect(surface.classNames).not.toContain('workbench-object-hover-motion--active')
    expect(scheduler.pendingFrames()).toBe(0)
  })

  it('retargets the previous and next nodes independently when hover changes', () => {
    const scheduler = createFrameScheduler()
    const firstSurface = createSurface()
    const secondSurface = createSurface()
    const controller = createWorkbenchNodeHoverMotionController({ scheduler })

    controller.hoveredSurfaceChanged(firstSurface)
    scheduler.advanceNextFrame()
    controller.hoveredSurfaceChanged(secondSurface)
    scheduler.advanceNextFrame()

    expect(readScale(firstSurface)).toBeGreaterThan(1)
    expect(readScale(secondSurface)).toBeGreaterThan(1)

    scheduler.advanceUntilIdle()

    expect(firstSurface.properties.has('--workbench-object-hover-scale')).toBe(false)
    expect(readScale(secondSurface)).toBeCloseTo(workbenchNodeHoverScale, 4)
    expect(secondSurface.classNames).toContain('workbench-object-hover-motion--active')
  })

  it('does not restart an already settled hover spring for repeated pointer moves', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const controller = createWorkbenchNodeHoverMotionController({ scheduler })

    controller.hoveredSurfaceChanged(surface)
    scheduler.advanceUntilIdle()
    controller.hoveredSurfaceChanged(surface)

    expect(readScale(surface)).toBeCloseTo(workbenchNodeHoverScale, 4)
    expect(scheduler.pendingFrames()).toBe(0)
  })

  it('clears presentation immediately when dragging or reduced motion suspends feedback', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const controller = createWorkbenchNodeHoverMotionController({ scheduler })

    controller.hoveredSurfaceChanged(surface)
    scheduler.advanceNextFrame()
    controller.suspend()

    expect(surface.properties.size).toBe(0)
    expect(surface.classNames).not.toContain('workbench-object-hover-motion--active')
    expect(scheduler.pendingFrames()).toBe(0)
  })
})

function readScale(surface: ReturnType<typeof createSurface>): number {
  return Number(surface.properties.get('--workbench-object-hover-scale') ?? '1')
}

function advanceAndReadScales(
  scheduler: ReturnType<typeof createFrameScheduler>,
  surface: ReturnType<typeof createSurface>
): number[] {
  const values: number[] = []
  for (let frame = 0; frame < 240 && scheduler.pendingFrames() > 0; frame += 1) {
    scheduler.advanceNextFrame()
    values.push(readScale(surface))
  }
  return values
}

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
