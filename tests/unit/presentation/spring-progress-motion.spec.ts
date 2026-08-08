import {
  createSpringProgressMotionController,
  type SpringProgressMotionFrameScheduler,
  type SpringProgressMotionRoot
} from '../../../src/presentation/app-shell/springProgressMotion'

describe('spring progress motion', () => {
  it('advances a visible surface with a critically damped spring without overshooting', () => {
    const scheduler = createFrameScheduler()
    const root = createRoot()
    const settled = vi.fn()
    const controller = createController(scheduler)

    controller.intentChanged(root, {
      onSettled: settled,
      present: presentProgress,
      reducedMotion: false,
      visible: true
    })

    expect(readProgress(root)).toBe(0)
    expect(root.attributes.get('data-test-motion-state')).toBe('opening')

    scheduler.advanceNextFrame(100)
    expect(readProgress(root)).toBeGreaterThan(0)
    expect(readProgress(root)).toBeLessThan(1)

    scheduler.advanceUntilIdle()
    expect(readProgress(root)).toBe(1)
    expect(root.maximumProgress).toBeLessThanOrEqual(1)
    expect(root.attributes.get('data-test-motion-state')).toBe('open')
    expect(settled).toHaveBeenCalledOnce()
  })

  it('reverses from the current presentation instead of restarting', () => {
    const scheduler = createFrameScheduler()
    const root = createRoot()
    const controller = createController(scheduler)

    controller.intentChanged(root, {
      onSettled: vi.fn(),
      present: presentProgress,
      reducedMotion: false,
      visible: true
    })
    scheduler.advanceNextFrame(90)
    const progressBeforeReversal = readProgress(root)

    controller.intentChanged(root, {
      onSettled: vi.fn(),
      present: presentProgress,
      reducedMotion: false,
      visible: false
    })

    expect(readProgress(root)).toBe(progressBeforeReversal)
    expect(root.attributes.get('data-test-motion-state')).toBe('closing')
    scheduler.advanceNextFrame()
    expect(readProgress(root)).toBeLessThan(progressBeforeReversal)

    scheduler.advanceUntilIdle()
    expect(readProgress(root)).toBe(0)
    expect(root.attributes.get('data-test-motion-state')).toBe('closed')
  })

  it('projects directly to the endpoint when reduced motion is enabled', () => {
    const scheduler = createFrameScheduler()
    const root = createRoot()
    const settled = vi.fn()
    const controller = createController(scheduler)

    controller.intentChanged(root, {
      onSettled: settled,
      present: presentProgress,
      reducedMotion: true,
      visible: true
    })

    expect(readProgress(root)).toBe(1)
    expect(root.attributes.get('data-test-motion-state')).toBe('open')
    expect(scheduler.pendingFrames()).toBe(0)
    expect(settled).toHaveBeenCalledOnce()
  })
})

function createController(scheduler: SpringProgressMotionFrameScheduler) {
  return createSpringProgressMotionController({
    clear: (root) => root.style.removeProperty('--test-spring-progress'),
    dynamics: { dampingRatio: 1, response: 0.3 },
    scheduler,
    stateAttribute: 'data-test-motion-state'
  })
}

function presentProgress(root: SpringProgressMotionRoot, progress: number): void {
  root.style.setProperty('--test-spring-progress', `${progress}`)
  if ('maximumProgress' in root && typeof root.maximumProgress === 'number') {
    root.maximumProgress = Math.max(root.maximumProgress, progress)
  }
}

function readProgress(root: ReturnType<typeof createRoot>): number {
  return Number.parseFloat(root.properties.get('--test-spring-progress') ?? '0')
}

function createRoot(): SpringProgressMotionRoot & {
  readonly attributes: Map<string, string>
  readonly properties: Map<string, string>
  maximumProgress: number
} {
  const attributes = new Map<string, string>()
  const properties = new Map<string, string>()
  return {
    attributes,
    maximumProgress: 0,
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
