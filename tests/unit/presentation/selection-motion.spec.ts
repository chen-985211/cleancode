import {
  createSelectionIndicatorMotionController,
  selectionMotionDynamics,
  type SelectionIndicatorMotionRoot,
  type SelectionMotionTarget
} from '../../../src/presentation/app-shell/selectionMotion'
import type { SpringProgressMotionFrameScheduler } from '../../../src/presentation/app-shell/springProgressMotion'

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
