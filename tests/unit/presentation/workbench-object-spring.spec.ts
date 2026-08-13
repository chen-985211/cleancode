import {
  createWorkbenchObjectSpringController,
  type WorkbenchObjectSpringFrameScheduler,
  type WorkbenchObjectSpringSurface
} from '../../../src/presentation/app-shell/workbenchObjectSpring'
import type { WorkbenchObjectMotion } from '../../../src/presentation/app-shell/types'

describe('workbench object spring', () => {
  it('materializes a created object from the center without changing layout geometry', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const completed = vi.fn()
    const controller = createWorkbenchObjectSpringController({ scheduler })

    controller.motionChanged(
      surface,
      createPresenceMotion('create', { from: 0, to: 1 }),
      false,
      completed
    )

    expect(readProperty(surface, '--workbench-object-motion-scale')).toBe(0)
    scheduler.advanceNextFrame(80)
    expect(readProperty(surface, '--workbench-object-motion-scale')).toBeGreaterThan(0)
    expect(readProperty(surface, '--workbench-object-motion-scale')).toBeLessThan(1)

    scheduler.advanceUntilIdle()
    expect(readProperty(surface, '--workbench-object-motion-scale')).toBe(1)
    expect(completed).toHaveBeenCalledOnce()
    expect(completed).toHaveBeenCalledWith('create:terminal-1')
  })

  it('collapses a deleted object into its center before completing', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const completed = vi.fn()
    const controller = createWorkbenchObjectSpringController({ scheduler })

    controller.motionChanged(
      surface,
      createPresenceMotion('delete', { from: 1, to: 0 }),
      false,
      completed
    )

    expect(readProperty(surface, '--workbench-object-motion-scale')).toBe(1)
    scheduler.advanceNextFrame(80)
    expect(readProperty(surface, '--workbench-object-motion-scale')).toBeGreaterThan(0)
    expect(readProperty(surface, '--workbench-object-motion-scale')).toBeLessThan(1)

    scheduler.advanceUntilIdle()
    expect(readProperty(surface, '--workbench-object-motion-scale')).toBe(0)
    expect(completed).toHaveBeenCalledOnce()
    expect(completed).toHaveBeenCalledWith('delete:terminal-1')
  })

  it('redirects an in-flight creation into deletion from the live scale', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const completed = vi.fn()
    const controller = createWorkbenchObjectSpringController({ scheduler })

    controller.motionChanged(
      surface,
      createPresenceMotion('create', { from: 0, to: 1 }),
      false,
      completed
    )
    scheduler.advanceNextFrame(80)
    const scaleBeforeDelete = readProperty(surface, '--workbench-object-motion-scale')

    controller.motionChanged(
      surface,
      createPresenceMotion('delete', { from: 1, to: 0 }),
      false,
      completed
    )

    expect(readProperty(surface, '--workbench-object-motion-scale')).toBeCloseTo(
      scaleBeforeDelete,
      4
    )
    scheduler.advanceNextFrame()
    expect(readProperty(surface, '--workbench-object-motion-scale')).toBeLessThan(scaleBeforeDelete)
    scheduler.advanceUntilIdle()
    expect(completed).toHaveBeenCalledOnce()
    expect(completed).toHaveBeenCalledWith('delete:terminal-1')
  })

  it('settles a deleted object immediately at the same center endpoint for reduced motion', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const completed = vi.fn()
    const controller = createWorkbenchObjectSpringController({ scheduler })

    controller.motionChanged(
      surface,
      createPresenceMotion('delete', { from: 1, to: 0 }),
      true,
      completed
    )

    expect(readProperty(surface, '--workbench-object-motion-scale')).toBe(0)
    expect(completed).toHaveBeenCalledOnce()
    expect(scheduler.pendingFrames()).toBe(0)
  })

  it('moves an expanding member from the committed group origin to its final position', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const completed = vi.fn()
    const controller = createWorkbenchObjectSpringController({ scheduler })

    const motion: WorkbenchObjectMotion = {
      ...createMotion('group-expand', { x: -320, y: -170 }),
      contentDelayMs: 220,
      contentOpacity: { from: 0, to: 1 },
      delayMs: 0,
      opacity: { from: 0, to: 1 },
      opacityDelayMs: 160,
      scale: { from: 0.88, to: 1 }
    }
    controller.motionChanged(surface, motion, false, completed)

    expect(readProperty(surface, '--workbench-object-motion-x')).toBe(-320)
    expect(readProperty(surface, '--workbench-object-motion-y')).toBe(-170)
    expect(readProperty(surface, '--workbench-object-motion-opacity')).toBe(0)
    expect(readProperty(surface, '--workbench-object-motion-content-opacity')).toBe(0)
    expect(readProperty(surface, '--workbench-object-motion-scale')).toBe(0.88)

    scheduler.advanceNextFrame(80)
    expect(readProperty(surface, '--workbench-object-motion-x')).toBeGreaterThan(-320)
    expect(readProperty(surface, '--workbench-object-motion-scale')).toBeGreaterThan(0.88)
    expect(readProperty(surface, '--workbench-object-motion-opacity')).toBe(0)
    expect(readProperty(surface, '--workbench-object-motion-content-opacity')).toBe(0)

    scheduler.advanceNextFrame(80)
    expect(readProperty(surface, '--workbench-object-motion-x')).toBeGreaterThan(-320)
    expect(readProperty(surface, '--workbench-object-motion-x')).toBeLessThan(0)
    expect(readProperty(surface, '--workbench-object-motion-opacity')).toBe(0)
    expect(readProperty(surface, '--workbench-object-motion-scale')).toBeGreaterThan(0.88)
    expect(readProperty(surface, '--workbench-object-motion-content-opacity')).toBe(0)

    scheduler.advanceNextFrame(40)
    expect(readProperty(surface, '--workbench-object-motion-opacity')).toBeGreaterThan(0)
    expect(readProperty(surface, '--workbench-object-motion-content-opacity')).toBe(0)

    scheduler.advanceNextFrame(40)
    expect(readProperty(surface, '--workbench-object-motion-content-opacity')).toBeGreaterThan(0)

    scheduler.advanceUntilIdle()
    expect(readProperty(surface, '--workbench-object-motion-x')).toBe(0)
    expect(readProperty(surface, '--workbench-object-motion-y')).toBe(0)
    expect(readProperty(surface, '--workbench-object-motion-opacity')).toBe(1)
    expect(readProperty(surface, '--workbench-object-motion-scale')).toBe(1)
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

  it('keeps a directly hidden collapsing exit invisible while its lifecycle settles', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const completed = vi.fn()
    const controller = createWorkbenchObjectSpringController({ scheduler })

    controller.motionChanged(
      surface,
      {
        ...createMotion('group-collapse', { x: -280, y: -140 }),
        opacity: { from: 0, to: 0 }
      },
      false,
      completed
    )

    expect(readProperty(surface, '--workbench-object-motion-opacity')).toBe(0)
    scheduler.advanceUntilIdle()

    expect(readProperty(surface, '--workbench-object-motion-x')).toBe(-280)
    expect(readProperty(surface, '--workbench-object-motion-y')).toBe(-140)
    expect(readProperty(surface, '--workbench-object-motion-opacity')).toBe(0)
    expect(readProperty(surface, '--workbench-object-motion-scale')).toBe(1)
    expect(completed).toHaveBeenCalledOnce()
  })

  it('hides an expanding member immediately when disclosure reverses into collapse', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const controller = createWorkbenchObjectSpringController({ scheduler })

    controller.motionChanged(
      surface,
      {
        ...createMotion('group-expand', { x: -280, y: -140 }),
        opacity: { from: 0, to: 1 }
      },
      false,
      vi.fn()
    )
    scheduler.advanceNextFrame(80)
    expect(readProperty(surface, '--workbench-object-motion-opacity')).toBeGreaterThan(0)

    controller.motionChanged(
      surface,
      {
        ...createMotion('group-collapse', { x: -280, y: -140 }, 'group-collapse:terminal-1'),
        opacity: { from: 0, to: 0 }
      },
      false,
      vi.fn()
    )

    expect(readProperty(surface, '--workbench-object-motion-opacity')).toBe(0)
  })

  it('morphs one group material between world rects without scaling the live shell', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const completed = vi.fn()
    const controller = createWorkbenchObjectSpringController({ scheduler })
    const motion = createShellMotion(
      'group-expand',
      { height: 180, width: 320, x: 100, y: 100 },
      { height: 458, width: 984, x: 140, y: 120 }
    )

    controller.motionChanged(surface, motion, false, completed)

    expect(readProperty(surface, '--workbench-object-motion-opacity')).toBe(1)
    expect(readProperty(surface, '--workbench-object-motion-shell-x')).toBe(-40)
    expect(readProperty(surface, '--workbench-object-motion-shell-y')).toBe(-20)
    expect(readProperty(surface, '--workbench-object-motion-shell-width')).toBe(320)
    expect(readProperty(surface, '--workbench-object-motion-shell-height')).toBe(180)
    expect(readProperty(surface, '--workbench-object-motion-scale')).toBe(1)
    expect(readProperty(surface, '--workbench-object-motion-content-opacity')).toBe(0)

    scheduler.advanceNextFrame(100)
    expect(readProperty(surface, '--workbench-object-motion-content-opacity')).toBeGreaterThan(0)
    expect(readProperty(surface, '--workbench-object-motion-content-opacity')).toBeLessThan(1)
    expect(readProperty(surface, '--workbench-object-motion-shell-x')).toBeGreaterThan(-40)
    expect(readProperty(surface, '--workbench-object-motion-shell-x')).toBeLessThan(0)
    expect(readProperty(surface, '--workbench-object-motion-shell-width')).toBeGreaterThan(320)
    expect(readProperty(surface, '--workbench-object-motion-shell-width')).toBeLessThan(984)

    scheduler.advanceUntilIdle()
    expect(readProperty(surface, '--workbench-object-motion-content-opacity')).toBe(1)
    expect(readProperty(surface, '--workbench-object-motion-shell-x')).toBe(0)
    expect(readProperty(surface, '--workbench-object-motion-shell-y')).toBe(0)
    expect(readProperty(surface, '--workbench-object-motion-shell-width')).toBe(984)
    expect(readProperty(surface, '--workbench-object-motion-shell-height')).toBe(458)
    expect(completed).toHaveBeenCalledWith('group-expand:group-1')
  })

  it('keeps the group shell reveal synchronized with disclosure member travel', () => {
    const memberScheduler = createFrameScheduler()
    const shellScheduler = createFrameScheduler()
    const memberSurface = createSurface()
    const shellSurface = createSurface()
    const memberController = createWorkbenchObjectSpringController({
      scheduler: memberScheduler
    })
    const shellController = createWorkbenchObjectSpringController({ scheduler: shellScheduler })

    memberController.motionChanged(
      memberSurface,
      {
        ...createMotion('group-expand', { x: -320, y: -170 }),
        scale: { from: 0.88, to: 1 }
      },
      false,
      vi.fn()
    )
    shellController.motionChanged(
      shellSurface,
      createShellMotion(
        'group-expand',
        { height: 180, width: 320, x: 100, y: 100 },
        { height: 458, width: 984, x: 100, y: 100 }
      ),
      false,
      vi.fn()
    )

    memberScheduler.advanceNextFrame(100)
    shellScheduler.advanceNextFrame(100)

    const memberProgress =
      1 - Math.abs(readProperty(memberSurface, '--workbench-object-motion-x')) / 320
    const shellProgress =
      (readProperty(shellSurface, '--workbench-object-motion-shell-width') - 320) / (984 - 320)
    expect(shellProgress).toBeCloseTo(memberProgress, 4)
  })

  it('preserves the material world rect when disclosure reverses across root geometry', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const controller = createWorkbenchObjectSpringController({ scheduler })
    const collapsedRect = { height: 180, width: 320, x: 100, y: 100 }
    const expandedRect = { height: 458, width: 984, x: 140, y: 120 }
    const expandMotion = createShellMotion('group-expand', collapsedRect, expandedRect)

    controller.motionChanged(surface, expandMotion, false, vi.fn())
    scheduler.advanceNextFrame(80)
    const worldXBeforeReverse =
      expandedRect.x + readProperty(surface, '--workbench-object-motion-shell-x')
    const worldYBeforeReverse =
      expandedRect.y + readProperty(surface, '--workbench-object-motion-shell-y')
    const widthBeforeReverse = readProperty(surface, '--workbench-object-motion-shell-width')

    controller.motionChanged(
      surface,
      createShellMotion('group-collapse', expandedRect, collapsedRect),
      false,
      vi.fn()
    )

    expect(
      collapsedRect.x + readProperty(surface, '--workbench-object-motion-shell-x')
    ).toBeCloseTo(worldXBeforeReverse, 4)
    expect(
      collapsedRect.y + readProperty(surface, '--workbench-object-motion-shell-y')
    ).toBeCloseTo(worldYBeforeReverse, 4)
    expect(readProperty(surface, '--workbench-object-motion-shell-width')).toBeCloseTo(
      widthBeforeReverse,
      4
    )
    scheduler.advanceNextFrame()
    expect(readProperty(surface, '--workbench-object-motion-shell-width')).toBeLessThan(
      widthBeforeReverse
    )
  })

  it('cancels a fresh cascade delay when an in-flight member reverses', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const controller = createWorkbenchObjectSpringController({ scheduler })

    controller.motionChanged(
      surface,
      {
        ...createMotion('group-expand', { x: -320, y: -170 }),
        scale: { from: 0.88, to: 1 }
      },
      false,
      vi.fn()
    )
    scheduler.advanceNextFrame(80)
    const xBeforeReverse = readProperty(surface, '--workbench-object-motion-x')

    controller.motionChanged(
      surface,
      {
        ...createMotion('group-collapse', { x: -320, y: -170 }, 'group-collapse:terminal-1'),
        delayMs: 60,
        scale: { from: 1, to: 0.88 }
      },
      false,
      vi.fn()
    )
    scheduler.advanceNextFrame()

    expect(readProperty(surface, '--workbench-object-motion-x')).toBeLessThan(xBeforeReverse)
  })

  it('makes collapse settle faster than expansion over the same distance', () => {
    const expandScheduler = createFrameScheduler()
    const collapseScheduler = createFrameScheduler()
    const expandSurface = createSurface()
    const collapseSurface = createSurface()
    const expandController = createWorkbenchObjectSpringController({
      scheduler: expandScheduler
    })
    const collapseController = createWorkbenchObjectSpringController({
      scheduler: collapseScheduler
    })

    expandController.motionChanged(
      expandSurface,
      createMotion('group-expand', { x: -320, y: 0 }),
      false,
      vi.fn()
    )
    collapseController.motionChanged(
      collapseSurface,
      createMotion('group-collapse', { x: -320, y: 0 }),
      false,
      vi.fn()
    )
    expandScheduler.advanceNextFrame(80)
    collapseScheduler.advanceNextFrame(80)

    const expandProgress =
      1 - Math.abs(readProperty(expandSurface, '--workbench-object-motion-x')) / 320
    const collapseProgress = Math.abs(
      readProperty(collapseSurface, '--workbench-object-motion-x') / 320
    )
    expect(collapseProgress).toBeGreaterThan(expandProgress)
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

  it('releases a detached canvas card under gravity before a restrained landing rebound', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const completed = vi.fn()
    const controller = createWorkbenchObjectSpringController({ scheduler })

    controller.motionChanged(
      surface,
      {
        ...createMotion('canvas-arrange', { x: -24, y: -18 }),
        positionDynamics: 'drop'
      },
      false,
      completed
    )

    expect(readProperty(surface, '--workbench-object-motion-y')).toBe(-18)
    scheduler.advanceNextFrame(50)
    const firstDropPosition = readProperty(surface, '--workbench-object-motion-y')
    scheduler.advanceNextFrame(50)
    const secondDropPosition = readProperty(surface, '--workbench-object-motion-y')

    expect(firstDropPosition).toBeCloseTo(-15.75, 1)
    expect(secondDropPosition).toBeCloseTo(-9, 1)
    expect(secondDropPosition - firstDropPosition).toBeGreaterThan(firstDropPosition + 18)

    scheduler.advanceNextFrame(50)
    expect(readProperty(surface, '--workbench-object-motion-y')).toBeLessThan(0)
    scheduler.advanceUntilIdle()

    expect(readProperty(surface, '--workbench-object-motion-y')).toBe(0)
    expect(completed).toHaveBeenCalledOnce()
  })

  it('lets a grid item curve naturally by adapting each axis to its travel distance', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const completed = vi.fn()
    const controller = createWorkbenchObjectSpringController({ scheduler })

    controller.motionChanged(
      surface,
      {
        ...createMotion('canvas-arrange', { x: -900, y: -100 }),
        positionDynamics: 'grid'
      },
      false,
      completed
    )
    scheduler.advanceNextFrame(50)

    const xProgress = 1 - Math.abs(readProperty(surface, '--workbench-object-motion-x')) / 900
    const yProgress = 1 - Math.abs(readProperty(surface, '--workbench-object-motion-y')) / 100
    expect(xProgress).toBeGreaterThan(0)
    expect(yProgress).toBeGreaterThan(0)
    expect(xProgress).toBeLessThan(yProgress)

    scheduler.advanceUntilIdle()
    expect(readProperty(surface, '--workbench-object-motion-x')).toBe(0)
    expect(readProperty(surface, '--workbench-object-motion-y')).toBe(0)
    expect(completed).toHaveBeenCalledOnce()
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

function createPresenceMotion(
  kind: 'create' | 'delete',
  scale: NonNullable<WorkbenchObjectMotion['scale']>
): WorkbenchObjectMotion {
  return { ...createMotion(kind, { x: 0, y: 0 }), scale }
}

function createShellMotion(
  kind: 'group-collapse' | 'group-expand',
  from: NonNullable<WorkbenchObjectMotion['shellRect']>['from'],
  to: NonNullable<WorkbenchObjectMotion['shellRect']>['to']
): WorkbenchObjectMotion {
  return {
    ...createMotion(kind, { x: 0, y: 0 }, `${kind}:group-1`),
    contentOpacity: { from: 0, to: 1 },
    opacity: { from: 1, to: 1 },
    shellRect: { from, to }
  }
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
