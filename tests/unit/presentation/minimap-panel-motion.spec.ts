import {
  createMinimapPanelMotionController,
  type MinimapPanelMotionFrameScheduler,
  type MinimapPanelMotionRoot
} from '../../../src/presentation/app-shell/minimapPanelMotion'

describe('minimap panel motion', () => {
  it('moves the panel, controls, and directional toggle through one spring presentation', () => {
    const scheduler = createFrameScheduler()
    const root = createRoot()
    const settled = vi.fn()
    const controller = createMinimapPanelMotionController({ scheduler })

    controller.intentChanged(root, {
      expanded: false,
      onSettled: settled,
      reducedMotion: false
    })
    controller.intentChanged(root, {
      expanded: true,
      onSettled: settled,
      reducedMotion: false
    })

    expect(readProperty(root, '--canvas-minimap-panel-height')).toBe(0)
    expect(readProperty(root, '--canvas-minimap-toggle-rotation')).toBe(0)
    expect(root.attributes.get('data-canvas-minimap-motion-state')).toBe('opening')

    scheduler.advanceNextFrame(100)
    expect(readProperty(root, '--canvas-minimap-panel-height')).toBeGreaterThan(0)
    expect(readProperty(root, '--canvas-minimap-panel-height')).toBeLessThan(120)
    expect(readProperty(root, '--canvas-minimap-toggle-rotation')).toBeGreaterThan(0)
    expect(readProperty(root, '--canvas-minimap-toggle-rotation')).toBeLessThan(180)
    expect(readProperty(root, '--canvas-minimap-panel-opacity')).toBeGreaterThan(0)
    expect(readProperty(root, '--canvas-minimap-panel-gap')).toBeGreaterThan(0)

    scheduler.advanceUntilIdle()
    expect(readProperty(root, '--canvas-minimap-panel-height')).toBe(120)
    expect(readProperty(root, '--canvas-minimap-panel-gap')).toBe(6)
    expect(readProperty(root, '--canvas-minimap-panel-opacity')).toBe(1)
    expect(readProperty(root, '--canvas-minimap-toggle-rotation')).toBe(180)
    expect(root.attributes.get('data-canvas-minimap-motion-state')).toBe('expanded')
    expect(settled).toHaveBeenCalledOnce()
  })

  it('reverses immediately from the current presentation without a layout jump', () => {
    const scheduler = createFrameScheduler()
    const root = createRoot()
    const controller = createMinimapPanelMotionController({ scheduler })

    controller.intentChanged(root, {
      expanded: false,
      onSettled: vi.fn(),
      reducedMotion: false
    })
    controller.intentChanged(root, {
      expanded: true,
      onSettled: vi.fn(),
      reducedMotion: false
    })
    scheduler.advanceNextFrame(80)
    const heightBeforeReversal = readProperty(root, '--canvas-minimap-panel-height')
    const rotationBeforeReversal = readProperty(root, '--canvas-minimap-toggle-rotation')

    controller.intentChanged(root, {
      expanded: false,
      onSettled: vi.fn(),
      reducedMotion: false
    })

    expect(readProperty(root, '--canvas-minimap-panel-height')).toBe(heightBeforeReversal)
    expect(readProperty(root, '--canvas-minimap-toggle-rotation')).toBe(rotationBeforeReversal)
    scheduler.advanceNextFrame()
    expect(readProperty(root, '--canvas-minimap-panel-height')).toBeLessThan(heightBeforeReversal)
    expect(readProperty(root, '--canvas-minimap-toggle-rotation')).toBeLessThan(
      rotationBeforeReversal
    )
    scheduler.advanceUntilIdle()
    expect(readProperty(root, '--canvas-minimap-panel-height')).toBe(0)
    expect(readProperty(root, '--canvas-minimap-toggle-rotation')).toBe(0)
    expect(root.attributes.get('data-canvas-minimap-motion-state')).toBe('collapsed')
  })

  it('projects the endpoint immediately for reduced motion', () => {
    const scheduler = createFrameScheduler()
    const root = createRoot()
    const settled = vi.fn()
    const controller = createMinimapPanelMotionController({ scheduler })

    controller.intentChanged(root, {
      expanded: true,
      onSettled: settled,
      reducedMotion: true
    })

    expect(readProperty(root, '--canvas-minimap-panel-height')).toBe(120)
    expect(readProperty(root, '--canvas-minimap-panel-opacity')).toBe(1)
    expect(readProperty(root, '--canvas-minimap-toggle-rotation')).toBe(180)
    expect(root.attributes.get('data-canvas-minimap-motion-state')).toBe('expanded')
    expect(scheduler.pendingFrames()).toBe(0)
    expect(settled).toHaveBeenCalledOnce()
  })
})

function readProperty(root: ReturnType<typeof createRoot>, property: string): number {
  return Number.parseFloat(root.properties.get(property) ?? '0')
}

function createRoot(): MinimapPanelMotionRoot & {
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

function createFrameScheduler(): MinimapPanelMotionFrameScheduler & {
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
