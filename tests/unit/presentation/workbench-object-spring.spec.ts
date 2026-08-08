import {
  createWorkbenchObjectSpringController,
  type WorkbenchObjectSpringFrameScheduler,
  type WorkbenchObjectSpringSurface
} from '../../../src/presentation/app-shell/workbenchObjectSpring'
import type { WorkbenchObjectMotion } from '../../../src/presentation/app-shell/types'

describe('workbench object spring', () => {
  it('moves an expanding member from the committed group origin to its final position', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const completed = vi.fn()
    const controller = createWorkbenchObjectSpringController({ scheduler })

    controller.motionChanged(
      surface,
      createMotion('group-expand', { x: -320, y: -170 }),
      false,
      completed
    )

    expect(readProperty(surface, '--workbench-object-motion-x')).toBe(-320)
    expect(readProperty(surface, '--workbench-object-motion-y')).toBe(-170)
    expect(readProperty(surface, '--workbench-object-motion-opacity')).toBeCloseTo(0.28)

    scheduler.advanceNextFrame(100)
    expect(readProperty(surface, '--workbench-object-motion-x')).toBeGreaterThan(-320)
    expect(readProperty(surface, '--workbench-object-motion-x')).toBeLessThan(0)
    expect(readProperty(surface, '--workbench-object-motion-opacity')).toBeGreaterThan(0.28)

    scheduler.advanceUntilIdle()
    expect(readProperty(surface, '--workbench-object-motion-x')).toBe(0)
    expect(readProperty(surface, '--workbench-object-motion-y')).toBe(0)
    expect(readProperty(surface, '--workbench-object-motion-opacity')).toBe(1)
    expect(completed).toHaveBeenCalledOnce()
    expect(completed).toHaveBeenCalledWith('group-expand:terminal-1')
  })

  it('keeps the live screen position and velocity when a new graph layout retargets the member', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const completed = vi.fn()
    const controller = createWorkbenchObjectSpringController({ scheduler })

    controller.motionChanged(
      surface,
      createMotion('group-join', { x: 180, y: 60 }),
      false,
      completed
    )
    scheduler.advanceNextFrame()
    scheduler.advanceNextFrame()
    const xBeforeRetarget = readProperty(surface, '--workbench-object-motion-x')
    const yBeforeRetarget = readProperty(surface, '--workbench-object-motion-y')

    controller.motionChanged(
      surface,
      createMotion('group-reflow', { x: -44, y: 24 }, 'group-reflow:terminal-1'),
      false,
      completed
    )

    expect(readProperty(surface, '--workbench-object-motion-x')).toBeCloseTo(
      xBeforeRetarget - 44,
      4
    )
    expect(readProperty(surface, '--workbench-object-motion-y')).toBeCloseTo(
      yBeforeRetarget + 24,
      4
    )
    scheduler.advanceUntilIdle()
    expect(completed).toHaveBeenCalledOnce()
    expect(completed).toHaveBeenCalledWith('group-reflow:terminal-1')
  })

  it('projects a collapsing exit to its final invisible endpoint before completing', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const completed = vi.fn()
    const controller = createWorkbenchObjectSpringController({ scheduler })

    controller.motionChanged(
      surface,
      createMotion('group-collapse', { x: -280, y: -140 }),
      false,
      completed
    )
    scheduler.advanceUntilIdle()

    expect(readProperty(surface, '--workbench-object-motion-x')).toBe(-280)
    expect(readProperty(surface, '--workbench-object-motion-y')).toBe(-140)
    expect(readProperty(surface, '--workbench-object-motion-opacity')).toBe(0)
    expect(completed).toHaveBeenCalledOnce()
  })

  it('reveals one final-geometry group material without scaling the live shell', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const completed = vi.fn()
    const controller = createWorkbenchObjectSpringController({ scheduler })
    const motion: WorkbenchObjectMotion = {
      ...createMotion('group-expand', { x: 0, y: 0 }, 'group-expand:group-1'),
      contentOpacity: { from: 0, to: 1 },
      opacity: { from: 1, to: 1 }
    }

    controller.motionChanged(surface, motion, false, completed)

    expect(readProperty(surface, '--workbench-object-motion-opacity')).toBe(1)
    expect(surface.properties.has('--workbench-object-motion-previous-width')).toBe(false)
    expect(surface.properties.has('--workbench-object-motion-previous-height')).toBe(false)
    expect(readProperty(surface, '--workbench-object-motion-content-opacity')).toBe(0)

    scheduler.advanceNextFrame(100)
    expect(readProperty(surface, '--workbench-object-motion-content-opacity')).toBeGreaterThan(0)
    expect(readProperty(surface, '--workbench-object-motion-content-opacity')).toBeLessThan(1)

    scheduler.advanceUntilIdle()
    expect(readProperty(surface, '--workbench-object-motion-content-opacity')).toBe(1)
    expect(completed).toHaveBeenCalledWith('group-expand:group-1')
  })

  it('preserves the shell reveal progress when disclosure reverses', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const controller = createWorkbenchObjectSpringController({ scheduler })
    const expandMotion: WorkbenchObjectMotion = {
      ...createMotion('group-expand', { x: 0, y: 0 }, 'group-expand:group-1'),
      contentOpacity: { from: 0, to: 1 },
      opacity: { from: 1, to: 1 }
    }

    controller.motionChanged(surface, expandMotion, false, vi.fn())
    scheduler.advanceNextFrame(80)
    const currentMaterialOpacity = readProperty(
      surface,
      '--workbench-object-motion-content-opacity'
    )

    controller.motionChanged(
      surface,
      {
        ...createMotion('group-collapse', { x: 0, y: 0 }, 'group-collapse:group-1'),
        contentOpacity: { from: 0, to: 1 },
        opacity: { from: 1, to: 1 }
      },
      false,
      vi.fn()
    )

    expect(readProperty(surface, '--workbench-object-motion-content-opacity')).toBeCloseTo(
      1 - currentMaterialOpacity,
      4
    )
  })

  it('consumes a delayed frame without changing the elapsed-time result', () => {
    const regularScheduler = createFrameScheduler()
    const delayedScheduler = createFrameScheduler()
    const regularSurface = createSurface()
    const delayedSurface = createSurface()
    const regularController = createWorkbenchObjectSpringController({
      scheduler: regularScheduler
    })
    const delayedController = createWorkbenchObjectSpringController({
      scheduler: delayedScheduler
    })
    const motion = createMotion('group-join', { x: 240, y: -90 })

    regularController.motionChanged(regularSurface, motion, false, vi.fn())
    delayedController.motionChanged(delayedSurface, motion, false, vi.fn())
    for (let frame = 0; frame < 12; frame += 1) regularScheduler.advanceNextFrame()
    delayedScheduler.advanceNextFrame(100)

    expect(readProperty(delayedSurface, '--workbench-object-motion-x')).toBeCloseTo(
      readProperty(regularSurface, '--workbench-object-motion-x'),
      4
    )
    expect(readProperty(delayedSurface, '--workbench-object-motion-y')).toBeCloseTo(
      readProperty(regularSurface, '--workbench-object-motion-y'),
      4
    )
  })

  it('completes immediately at the same endpoint for reduced motion', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const completed = vi.fn()
    const controller = createWorkbenchObjectSpringController({ scheduler })

    controller.motionChanged(
      surface,
      createMotion('group-collapse', { x: 120, y: 80 }),
      true,
      completed
    )

    expect(readProperty(surface, '--workbench-object-motion-x')).toBe(120)
    expect(readProperty(surface, '--workbench-object-motion-y')).toBe(80)
    expect(readProperty(surface, '--workbench-object-motion-opacity')).toBe(0)
    expect(completed).toHaveBeenCalledOnce()
    expect(scheduler.pendingFrames()).toBe(0)
  })
})

function createMotion(
  kind: WorkbenchObjectMotion['kind'],
  offset: WorkbenchObjectMotion['offset'],
  id = `${kind}:terminal-1`
): WorkbenchObjectMotion {
  return { id, kind, offset }
}

function readProperty(surface: ReturnType<typeof createSurface>, property: string): number {
  return Number.parseFloat(surface.properties.get(property) ?? '0')
}

function createSurface(): WorkbenchObjectSpringSurface & {
  readonly properties: Map<string, string>
} {
  const properties = new Map<string, string>()
  return {
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

function createFrameScheduler(): WorkbenchObjectSpringFrameScheduler & {
  readonly advanceNextFrame: (milliseconds?: number) => void
  readonly advanceUntilIdle: () => void
  readonly pendingFrames: () => number
} {
  let nextFrameId = 1
  let now = 0
  const callbacks = new Map<number, FrameRequestCallback>()
  const advanceNextFrame = (milliseconds = 1000 / 120): void => {
    now += milliseconds
    const pendingCallbacks = [...callbacks.values()]
    callbacks.clear()
    pendingCallbacks.forEach((callback) => callback(now))
  }
  return {
    advanceNextFrame,
    advanceUntilIdle: () => {
      for (let frame = 0; frame < 240 && callbacks.size > 0; frame += 1) advanceNextFrame()
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
