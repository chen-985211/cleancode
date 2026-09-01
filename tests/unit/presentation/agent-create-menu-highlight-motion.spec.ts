import {
  createAgentCreateMenuHighlightMotionController,
  type AgentCreateMenuHighlightMotionFrameScheduler,
  type AgentCreateMenuHighlightMotionRoot
} from '../../../src/presentation/app-shell/workbench/creation/agentCreateMenuHighlightMotion'

describe('Agent create menu highlight motion', () => {
  it('lands the first highlight directly and retargets the moving spring without a jump', () => {
    const scheduler = createFrameScheduler()
    const root = createRoot()
    const controller = createAgentCreateMenuHighlightMotionController({ scheduler })

    controller.moveTo(root, { height: 38, top: 5 })
    expect(readY(root)).toBe(5)
    expect(root.attributes.get('data-visible')).toBe('true')
    expect(scheduler.pendingFrames()).toBe(0)

    controller.moveTo(root, { height: 38, top: 81 })
    expect(readY(root)).toBe(5)
    expect(root.attributes.get('data-motion-state')).toBe('moving')

    scheduler.advanceNextFrame(50)
    const yBeforeRetarget = readY(root)
    expect(yBeforeRetarget).toBeGreaterThan(5)
    expect(yBeforeRetarget).toBeLessThan(81)

    controller.moveTo(root, { height: 38, top: 18 })
    expect(readY(root)).toBe(yBeforeRetarget)

    scheduler.advanceUntilIdle()
    expect(readY(root)).toBe(18)
    expect(root.attributes.get('data-motion-state')).toBe('idle')
  })

  it('settles the current target immediately when reduced motion becomes active', () => {
    const scheduler = createFrameScheduler()
    const root = createRoot()
    const controller = createAgentCreateMenuHighlightMotionController({ scheduler })

    controller.moveTo(root, { height: 38, top: 5 })
    controller.moveTo(root, { height: 38, top: 81 })
    scheduler.advanceNextFrame(40)
    expect(readY(root)).not.toBe(81)

    controller.setReducedMotion(true)
    expect(readY(root)).toBe(81)
    expect(scheduler.pendingFrames()).toBe(0)

    controller.moveTo(root, { height: 38, top: 119 })
    expect(readY(root)).toBe(119)
    expect(scheduler.pendingFrames()).toBe(0)
  })

  it('clears a stale pointer highlight and lands the next target without a ghost transition', () => {
    const scheduler = createFrameScheduler()
    const root = createRoot()
    const controller = createAgentCreateMenuHighlightMotionController({ scheduler })

    controller.moveTo(root, { height: 38, top: 5 })
    controller.moveTo(root, { height: 38, top: 81 })
    expect(scheduler.pendingFrames()).toBe(1)

    controller.hide(root)
    expect(root.attributes.has('data-visible')).toBe(false)
    expect(root.attributes.has('data-target-y')).toBe(false)
    expect(readY(root)).toBe(5)
    expect(scheduler.pendingFrames()).toBe(0)

    controller.moveTo(root, { height: 38, top: 119 })
    expect(readY(root)).toBe(119)
    expect(scheduler.pendingFrames()).toBe(0)
  })
})

function readY(root: ReturnType<typeof createRoot>): number {
  return Number.parseFloat(root.properties.get('--cc-agent-create-menu-highlight-y') ?? '0')
}

function createRoot(): AgentCreateMenuHighlightMotionRoot & {
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

function createFrameScheduler(): AgentCreateMenuHighlightMotionFrameScheduler & {
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
