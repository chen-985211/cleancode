import {
  createSelectionIndicatorMotionController,
  selectionMotionDynamics,
  type SelectionIndicatorAnimation,
  type SelectionIndicatorAnimationDriver,
  type SelectionIndicatorAnimationFrame,
  type SelectionIndicatorMotionRoot,
  type SelectionMotionTarget
} from '../../../../src/presentation/shared/motion/selectionMotion'
import type { SpringProgressMotionFrameScheduler } from '../../../../src/presentation/shared/motion/springProgressMotion'

describe('selection motion', () => {
  it('projects the initial selection without an entrance animation', () => {
    const scheduler = createFrameScheduler()
    const root = createRoot()
    const controller = createSelectionIndicatorMotionController({ scheduler })

    controller.targetChanged(root, target(12, 44, 180, 40), { reducedMotion: false })

    expect(readNumber(root, '--cc-selection-motion-x')).toBe(12)
    expect(readNumber(root, '--cc-selection-motion-y')).toBe(44)
    expect(readNumber(root, '--cc-selection-motion-width')).toBe(180)
    expect(readNumber(root, '--cc-selection-motion-height')).toBe(40)
    expect(root.attributes.get('data-selection-motion-state')).toBe('settled')
    expect(scheduler.pendingFrames()).toBe(0)
  })

  it('uses the shared critically damped selection response to move between targets', () => {
    const scheduler = createFrameScheduler()
    const root = createRoot()
    const controller = createSelectionIndicatorMotionController({ scheduler })

    expect(selectionMotionDynamics).toEqual({ dampingRatio: 1, response: 0.24 })
    controller.targetChanged(root, target(0, 0, 180, 40), { reducedMotion: false })
    controller.targetChanged(root, target(0, 132, 180, 40), { reducedMotion: false })

    expect(root.attributes.get('data-selection-motion-state')).toBe('moving')
    expect(readNumber(root, '--cc-selection-motion-y')).toBe(0)

    scheduler.advanceNextFrame(80)
    expect(readNumber(root, '--cc-selection-motion-y')).toBeGreaterThan(0)
    expect(readNumber(root, '--cc-selection-motion-y')).toBeLessThan(132)

    scheduler.advanceUntilIdle()
    expect(readNumber(root, '--cc-selection-motion-y')).toBe(132)
    expect(root.attributes.get('data-selection-motion-state')).toBe('settled')
  })

  it('redirects from the live presentation without jumping to either endpoint', () => {
    const scheduler = createFrameScheduler()
    const root = createRoot()
    const controller = createSelectionIndicatorMotionController({ scheduler })

    controller.targetChanged(root, target(0, 0), { reducedMotion: false })
    controller.targetChanged(root, target(0, 132), { reducedMotion: false })
    scheduler.advanceNextFrame(72)
    const beforeRedirect = readNumber(root, '--cc-selection-motion-y')

    controller.targetChanged(root, target(0, 44), { reducedMotion: false })

    expect(readNumber(root, '--cc-selection-motion-y')).toBe(beforeRedirect)
    scheduler.advanceNextFrame()
    expect(Math.abs(readNumber(root, '--cc-selection-motion-y') - 44)).toBeLessThan(
      Math.abs(beforeRedirect - 44)
    )
  })

  it('projects a new target immediately when reduced motion takes over', () => {
    const scheduler = createFrameScheduler()
    const root = createRoot()
    const controller = createSelectionIndicatorMotionController({ scheduler })

    controller.targetChanged(root, target(0, 0), { reducedMotion: false })
    controller.targetChanged(root, target(120, 0), { reducedMotion: false })
    scheduler.advanceNextFrame(40)
    controller.targetChanged(root, target(240, 0), { reducedMotion: true })

    expect(readNumber(root, '--cc-selection-motion-x')).toBe(240)
    expect(root.attributes.get('data-selection-motion-state')).toBe('settled')
    expect(scheduler.pendingFrames()).toBe(0)
  })

  it('hands sampled transform keyframes to the browser animation driver', async () => {
    const scheduler = createFrameScheduler()
    const animationDriver = createAnimationDriver()
    const root = createRoot()
    const controller = createSelectionIndicatorMotionController({ animationDriver, scheduler })

    controller.targetChanged(root, target(0, 0, 180, 40), { reducedMotion: false })
    controller.targetChanged(root, target(0, 132, 180, 40), { reducedMotion: false })

    const animation = animationDriver.animations[0]
    expect(animation).toBeDefined()
    expect(animation?.frames.length).toBeGreaterThan(2)
    expect(animation?.frames[0]).toEqual({ offset: 0, transform: 'translate3d(0px, 0px, 0)' })
    expect(animation?.frames.at(-1)).toEqual({
      offset: 1,
      transform: 'translate3d(0px, 132px, 0)'
    })
    expect(animation?.options).toMatchObject({ easing: 'linear', fill: 'both' })
    expect(animation?.options.duration).toBeGreaterThan(0)
    expect(scheduler.pendingFrames()).toBe(0)
    expect(root.attributes.get('data-selection-motion-state')).toBe('moving')

    animation?.finish()
    await settlePromises()

    expect(readNumber(root, '--cc-selection-motion-y')).toBe(132)
    expect(root.attributes.get('data-selection-motion-state')).toBe('settled')
  })

  it('redirects compositor motion from its analytic presentation and ignores stale completion', async () => {
    const scheduler = createFrameScheduler()
    const animationDriver = createAnimationDriver()
    const root = createRoot()
    const controller = createSelectionIndicatorMotionController({ animationDriver, scheduler })

    controller.targetChanged(root, target(0, 0), { reducedMotion: false })
    controller.targetChanged(root, target(0, 132), { reducedMotion: false })
    scheduler.elapse(72)
    controller.targetChanged(root, target(0, 44), { reducedMotion: false })

    const firstAnimation = animationDriver.animations[0]
    const redirectedAnimation = animationDriver.animations[1]
    const redirectedStartY = readTransformAxis(redirectedAnimation?.frames[0], 'y')
    expect(firstAnimation?.cancelled()).toBe(true)
    expect(redirectedStartY).toBeGreaterThan(0)
    expect(redirectedStartY).toBeLessThan(132)
    expect(Math.abs(readTransformAxis(redirectedAnimation?.frames[1], 'y') - 44)).toBeLessThan(
      Math.abs(redirectedStartY - 44)
    )

    firstAnimation?.finish()
    await settlePromises()
    expect(root.attributes.get('data-selection-motion-state')).toBe('moving')

    redirectedAnimation?.finish()
    await settlePromises()
    expect(readNumber(root, '--cc-selection-motion-y')).toBe(44)
    expect(root.attributes.get('data-selection-motion-state')).toBe('settled')
  })

  it('cancels compositor motion when reduced motion takes over', () => {
    const scheduler = createFrameScheduler()
    const animationDriver = createAnimationDriver()
    const root = createRoot()
    const controller = createSelectionIndicatorMotionController({ animationDriver, scheduler })

    controller.targetChanged(root, target(0, 0), { reducedMotion: false })
    controller.targetChanged(root, target(120, 0), { reducedMotion: false })
    scheduler.elapse(40)
    controller.targetChanged(root, target(240, 0), { reducedMotion: true })

    expect(animationDriver.animations[0]?.cancelled()).toBe(true)
    expect(animationDriver.animations).toHaveLength(1)
    expect(readNumber(root, '--cc-selection-motion-x')).toBe(240)
    expect(root.attributes.get('data-selection-motion-state')).toBe('settled')
  })

  it('falls back to requestAnimationFrame when browser animation creation fails', () => {
    const scheduler = createFrameScheduler()
    const animationDriver: SelectionIndicatorAnimationDriver = {
      animate: () => {
        throw new Error('animation unavailable')
      }
    }
    const root = createRoot()
    const controller = createSelectionIndicatorMotionController({ animationDriver, scheduler })

    controller.targetChanged(root, target(0, 0), { reducedMotion: false })
    controller.targetChanged(root, target(0, 132), { reducedMotion: false })

    expect(scheduler.pendingFrames()).toBe(1)
    scheduler.advanceUntilIdle()
    expect(readNumber(root, '--cc-selection-motion-y')).toBe(132)
    expect(root.attributes.get('data-selection-motion-state')).toBe('settled')
  })

  it('cancels compositor work and clears presentation when disposed', () => {
    const scheduler = createFrameScheduler()
    const animationDriver = createAnimationDriver()
    const root = createRoot()
    const controller = createSelectionIndicatorMotionController({ animationDriver, scheduler })

    controller.targetChanged(root, target(0, 0), { reducedMotion: false })
    controller.targetChanged(root, target(0, 132), { reducedMotion: false })
    controller.dispose()

    expect(animationDriver.animations[0]?.cancelled()).toBe(true)
    expect(root.attributes.has('data-selection-motion-state')).toBe(false)
    expect(root.properties.size).toBe(0)
  })
})

function target(x: number, y: number, width = 100, height = 32): SelectionMotionTarget {
  return { height, width, x, y }
}

function readNumber(root: ReturnType<typeof createRoot>, property: string): number {
  return Number.parseFloat(root.properties.get(property) ?? '0')
}

function createRoot(): SelectionIndicatorMotionRoot & {
  readonly attributes: Map<string, string>
  readonly properties: Map<string, string>
} {
  const attributes = new Map<string, string>()
  const properties = new Map<string, string>()
  return {
    attributes,
    properties,
    removeAttribute: (name) => attributes.delete(name),
    setAttribute: (name, value) => attributes.set(name, value),
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

function createFrameScheduler(): SpringProgressMotionFrameScheduler & {
  readonly advanceNextFrame: (milliseconds?: number) => void
  readonly advanceUntilIdle: () => void
  readonly elapse: (milliseconds: number) => void
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
    elapse: (milliseconds) => {
      now += milliseconds
    },
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

interface RecordedAnimation {
  readonly cancelled: () => boolean
  readonly finish: () => void
  readonly frames: readonly SelectionIndicatorAnimationFrame[]
  readonly options: KeyframeAnimationOptions
}

function createAnimationDriver(): SelectionIndicatorAnimationDriver & {
  readonly animations: RecordedAnimation[]
} {
  const animations: RecordedAnimation[] = []
  return {
    animations,
    animate: (_root, frames, options) => {
      let isCancelled = false
      let finish = (): void => undefined
      const finished = new Promise<void>((resolve) => {
        finish = resolve
      })
      const animation: SelectionIndicatorAnimation = {
        cancel: () => {
          isCancelled = true
        },
        finished
      }
      animations.push({
        cancelled: () => isCancelled,
        finish,
        frames,
        options
      })
      return animation
    }
  }
}

function readTransformAxis(
  frame: SelectionIndicatorAnimationFrame | undefined,
  axis: 'x' | 'y'
): number {
  const match = frame?.transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px, 0\)/)
  return Number.parseFloat(match?.[axis === 'x' ? 1 : 2] ?? '0')
}

async function settlePromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}
