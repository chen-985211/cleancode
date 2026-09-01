import {
  createTerminalGroupDropSpringController,
  terminalGroupDropEngagedScale,
  terminalGroupDropRemovalScale,
  type TerminalGroupDropSpringFrameScheduler,
  type TerminalGroupDropSpringSurface
} from '../../../../src/contexts/block-graph/presentation/motion/terminalGroupDropSpring'

describe('terminal group drop spring', () => {
  it('springs the group past its engaged scale and settles while a terminal is near', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const controller = createTerminalGroupDropSpringController({ scheduler })

    controller.feedbackChanged(surface, 'join')

    expect(surface.classNames).toContain('terminal-group-drop-spring--active')
    const scales = advanceAndReadScales(scheduler, surface)

    expect(Math.max(...scales)).toBeGreaterThan(terminalGroupDropEngagedScale)
    expect(readScale(surface)).toBeCloseTo(terminalGroupDropEngagedScale, 4)
    expect(scheduler.pendingFrames()).toBe(0)
  })

  it('returns from the live scale and velocity when the terminal moves away', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const controller = createTerminalGroupDropSpringController({ scheduler })

    controller.feedbackChanged(surface, 'join')
    scheduler.advanceNextFrame()
    scheduler.advanceNextFrame()
    const scaleBeforeLeaving = readScale(surface)

    controller.feedbackChanged(surface, null)

    expect(readScale(surface)).toBe(scaleBeforeLeaving)
    expect(surface.classNames).toContain('terminal-group-drop-spring--active')

    scheduler.advanceUntilIdle()

    expect(surface.properties.has('--terminal-group-drop-scale')).toBe(false)
    expect(surface.classNames).not.toContain('terminal-group-drop-spring--active')
  })

  it('carries the current velocity when the drag rapidly leaves and re-enters', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const controller = createTerminalGroupDropSpringController({ scheduler })

    controller.feedbackChanged(surface, 'join')
    scheduler.advanceNextFrame()
    controller.feedbackChanged(surface, null)
    scheduler.advanceNextFrame()
    const scaleWhileReturning = readScale(surface)
    controller.feedbackChanged(surface, 'join')

    expect(readScale(surface)).toBe(scaleWhileReturning)
    scheduler.advanceUntilIdle()
    expect(readScale(surface)).toBeCloseTo(terminalGroupDropEngagedScale, 4)
  })

  it('does not restart a settled spring for repeated drag preview updates', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const controller = createTerminalGroupDropSpringController({ scheduler })

    controller.feedbackChanged(surface, 'join')
    scheduler.advanceUntilIdle()
    controller.feedbackChanged(surface, 'join')

    expect(scheduler.pendingFrames()).toBe(0)
  })

  it('clears the presentation immediately when reduced motion suspends feedback', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const controller = createTerminalGroupDropSpringController({ scheduler })

    controller.feedbackChanged(surface, 'join')
    scheduler.advanceNextFrame()
    controller.suspend()

    expect(surface.properties.size).toBe(0)
    expect(surface.classNames).not.toContain('terminal-group-drop-spring--active')
    expect(scheduler.pendingFrames()).toBe(0)
  })

  it('contracts the group without color or copy when a member crosses the removal boundary', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const controller = createTerminalGroupDropSpringController({ scheduler })

    controller.feedbackChanged(surface, 'leave')

    const scales = advanceAndReadScales(scheduler, surface)

    expect(Math.min(...scales)).toBeLessThan(terminalGroupDropRemovalScale)
    expect(readScale(surface)).toBeCloseTo(terminalGroupDropRemovalScale, 4)
    expect(scheduler.pendingFrames()).toBe(0)
  })

  it('carries live scale and velocity when feedback reverses from joining to removal', () => {
    const scheduler = createFrameScheduler()
    const surface = createSurface()
    const controller = createTerminalGroupDropSpringController({ scheduler })

    controller.feedbackChanged(surface, 'join')
    scheduler.advanceNextFrame()
    scheduler.advanceNextFrame()
    const scaleBeforeReversal = readScale(surface)

    controller.feedbackChanged(surface, 'leave')

    expect(readScale(surface)).toBe(scaleBeforeReversal)
    scheduler.advanceUntilIdle()
    expect(readScale(surface)).toBeCloseTo(terminalGroupDropRemovalScale, 4)
  })

  it('consumes all elapsed time when a presentation frame is delayed', () => {
    const regularScheduler = createFrameScheduler()
    const delayedScheduler = createFrameScheduler()
    const regularSurface = createSurface()
    const delayedSurface = createSurface()
    const regularController = createTerminalGroupDropSpringController({
      scheduler: regularScheduler
    })
    const delayedController = createTerminalGroupDropSpringController({
      scheduler: delayedScheduler
    })

    regularController.feedbackChanged(regularSurface, 'join')
    delayedController.feedbackChanged(delayedSurface, 'join')
    for (let frame = 0; frame < 12; frame += 1) regularScheduler.advanceNextFrame()
    delayedScheduler.advanceNextFrame(100)

    expect(readScale(delayedSurface)).toBeCloseTo(readScale(regularSurface), 6)
  })
})

function readScale(surface: ReturnType<typeof createSurface>): number {
  return Number(surface.properties.get('--terminal-group-drop-scale') ?? '1')
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

function createSurface(): TerminalGroupDropSpringSurface & {
  readonly classNames: Set<string>
  readonly properties: Map<string, string>
} {
  const classNames = new Set<string>()
  const properties = new Map<string, string>()

  return {
    classList: {
      add: (className) => classNames.add(className),
      remove: (className) => classNames.delete(className)
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

function createFrameScheduler(): TerminalGroupDropSpringFrameScheduler & {
  readonly advanceNextFrame: (milliseconds?: number) => void
  readonly advanceUntilIdle: () => void
  readonly pendingFrames: () => number
} {
  let nextFrameId = 1
  let now = 0
  const callbacks = new Map<number, FrameRequestCallback>()

  return {
    advanceNextFrame: (milliseconds = 1000 / 120) => {
      now += milliseconds
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
