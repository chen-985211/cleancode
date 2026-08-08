import {
  createProjectSidebarMotionController,
  type ProjectSidebarMotionFrameScheduler,
  type ProjectSidebarMotionRoot
} from '../../../src/presentation/app-shell/projectSidebarMotion'

describe('project sidebar motion', () => {
  it('moves a complete surface with a perceptible spring and settles at the expanded endpoint', () => {
    const scheduler = createFrameScheduler()
    const root = createRoot()
    const controller = createProjectSidebarMotionController({ scheduler })

    controller.intentChanged(root, {
      expandedWidth: 280,
      isCollapsed: true,
      reducedMotion: false
    })
    controller.intentChanged(root, {
      expandedWidth: 280,
      isCollapsed: false,
      reducedMotion: false
    })

    expect(root.attributes.get('data-project-sidebar-motion-state')).toBe('opening')
    scheduler.advanceNextFrame(100)
    expect(readWidth(root)).toBeGreaterThan(100)
    expect(readWidth(root)).toBeLessThan(280)

    const offsets = advanceAndReadOffsets(scheduler, root)
    expect(Math.max(...offsets)).toBeGreaterThan(0)
    expect(readWidth(root)).toBe(280)
    expect(readOffset(root)).toBe(0)
    expect(root.attributes.get('data-project-sidebar-motion-state')).toBe('expanded')
    expect(scheduler.pendingFrames()).toBe(0)
  })

  it('reverses from the current presentation without resetting its position', () => {
    const scheduler = createFrameScheduler()
    const root = createRoot()
    const controller = createProjectSidebarMotionController({ scheduler })

    controller.intentChanged(root, {
      expandedWidth: 280,
      isCollapsed: true,
      reducedMotion: false
    })
    controller.intentChanged(root, {
      expandedWidth: 280,
      isCollapsed: false,
      reducedMotion: false
    })
    scheduler.advanceNextFrame()
    scheduler.advanceNextFrame()
    const widthBeforeReversal = readWidth(root)
    const offsetBeforeReversal = readOffset(root)

    controller.intentChanged(root, {
      expandedWidth: 280,
      isCollapsed: true,
      reducedMotion: false
    })

    expect(readWidth(root)).toBe(widthBeforeReversal)
    expect(readOffset(root)).toBe(offsetBeforeReversal)
    expect(root.attributes.get('data-project-sidebar-motion-state')).toBe('closing')
    scheduler.advanceNextFrame()
    expect(readWidth(root)).toBeGreaterThan(widthBeforeReversal)
    scheduler.advanceUntilIdle()
    expect(readWidth(root)).toBe(0)
    expect(readOffset(root)).toBe(-100)
    expect(root.attributes.get('data-project-sidebar-motion-state')).toBe('collapsed')
  })

  it('projects the requested endpoint immediately when reduced motion is active or changes', () => {
    const scheduler = createFrameScheduler()
    const root = createRoot()
    const controller = createProjectSidebarMotionController({ scheduler })

    controller.intentChanged(root, {
      expandedWidth: 280,
      isCollapsed: false,
      reducedMotion: false
    })
    controller.intentChanged(root, {
      expandedWidth: 280,
      isCollapsed: true,
      reducedMotion: false
    })
    scheduler.advanceNextFrame()
    expect(readWidth(root)).toBeGreaterThan(0)

    controller.intentChanged(root, {
      expandedWidth: 280,
      isCollapsed: true,
      reducedMotion: true
    })

    expect(readWidth(root)).toBe(0)
    expect(readOffset(root)).toBe(-100)
    expect(root.attributes.get('data-project-sidebar-motion-state')).toBe('collapsed')
    expect(scheduler.pendingFrames()).toBe(0)
  })

  it('consumes all elapsed time when a rendering frame is delayed', () => {
    const regularScheduler = createFrameScheduler()
    const delayedScheduler = createFrameScheduler()
    const regularRoot = createRoot()
    const delayedRoot = createRoot()
    const regularController = createProjectSidebarMotionController({ scheduler: regularScheduler })
    const delayedController = createProjectSidebarMotionController({ scheduler: delayedScheduler })

    for (const [controller, root] of [
      [regularController, regularRoot],
      [delayedController, delayedRoot]
    ] as const) {
      controller.intentChanged(root, {
        expandedWidth: 280,
        isCollapsed: true,
        reducedMotion: false
      })
      controller.intentChanged(root, {
        expandedWidth: 280,
        isCollapsed: false,
        reducedMotion: false
      })
    }

    for (let frame = 0; frame < 12; frame += 1) regularScheduler.advanceNextFrame()
    delayedScheduler.advanceNextFrame(100)

    expect(readWidth(delayedRoot)).toBeCloseTo(readWidth(regularRoot), 4)
    expect(readOffset(delayedRoot)).toBeCloseTo(readOffset(regularRoot), 4)
  })
})

function readWidth(root: ReturnType<typeof createRoot>): number {
  return Number.parseFloat(root.properties.get('--cc-sidebar-motion-width') ?? '0')
}

function readOffset(root: ReturnType<typeof createRoot>): number {
  return Number.parseFloat(root.properties.get('--cc-sidebar-motion-offset') ?? '0')
}

function advanceAndReadOffsets(
  scheduler: ReturnType<typeof createFrameScheduler>,
  root: ReturnType<typeof createRoot>
): number[] {
  const values: number[] = []
  for (let frame = 0; frame < 240 && scheduler.pendingFrames() > 0; frame += 1) {
    scheduler.advanceNextFrame()
    values.push(readOffset(root))
  }
  return values
}

function createRoot(): ProjectSidebarMotionRoot & {
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

function createFrameScheduler(): ProjectSidebarMotionFrameScheduler & {
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
