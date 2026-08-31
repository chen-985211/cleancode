import {
  applicationSettingsPaneEntryOffset,
  createApplicationSettingsPaneMotionController,
  resolveApplicationSettingsPaneDirection,
  type ApplicationSettingsPaneMotionLayer,
  type ApplicationSettingsPaneMotionRoot
} from '../../../src/presentation/app-shell/applicationSettingsPaneMotion'
import type { SpringProgressMotionFrameScheduler } from '../../../src/presentation/shared/motion/springProgressMotion'

describe('application settings pane motion', () => {
  it('derives spatial direction from the stable navigation order', () => {
    expect(resolveApplicationSettingsPaneDirection('shortcuts', 'terminal')).toBe('forward')
    expect(resolveApplicationSettingsPaneDirection('agents', 'canvas')).toBe('backward')
    expect(resolveApplicationSettingsPaneDirection('canvas', 'canvas')).toBe('none')
  })

  it('moves the next pane in from the right while the previous pane exits left', () => {
    const scheduler = createFrameScheduler()
    const previous = createRoot()
    const next = createRoot()
    const controller = createApplicationSettingsPaneMotionController({ scheduler })

    controller.layersChanged([settledLayer('shortcuts', previous)], {
      onSettled: vi.fn(),
      reducedMotion: true
    })
    controller.layersChanged(
      [
        outgoingLayer('shortcuts', previous, -applicationSettingsPaneEntryOffset),
        incomingLayer('terminal', next, applicationSettingsPaneEntryOffset)
      ],
      { onSettled: vi.fn(), reducedMotion: false }
    )

    expect(readX(previous)).toBe(0)
    expect(readX(next)).toBeGreaterThan(0)
    expect(readOpacity(next)).toBe(0)

    scheduler.advanceNextFrame(90)
    expect(readX(previous)).toBeLessThan(0)
    expect(readX(next)).toBeGreaterThan(0)
    expect(readOpacity(next)).toBeGreaterThan(0)

    scheduler.advanceUntilIdle()
    expect(readX(next)).toBe(0)
    expect(readOpacity(next)).toBe(1)
  })

  it('redirects an in-flight pane from its current position', () => {
    const scheduler = createFrameScheduler()
    const first = createRoot()
    const second = createRoot()
    const controller = createApplicationSettingsPaneMotionController({ scheduler })

    controller.layersChanged([settledLayer('shortcuts', first)], {
      onSettled: vi.fn(),
      reducedMotion: true
    })
    controller.layersChanged(
      [
        outgoingLayer('shortcuts', first, -applicationSettingsPaneEntryOffset),
        incomingLayer('canvas', second, applicationSettingsPaneEntryOffset)
      ],
      { onSettled: vi.fn(), reducedMotion: false }
    )
    scheduler.advanceNextFrame(80)
    const xBeforeRedirect = readX(second)

    controller.layersChanged(
      [outgoingLayer('canvas', second, -applicationSettingsPaneEntryOffset)],
      { onSettled: vi.fn(), reducedMotion: false }
    )

    expect(readX(second)).toBe(xBeforeRedirect)
    scheduler.advanceNextFrame()
    expect(readX(second)).toBeLessThan(xBeforeRedirect)
  })
})

function settledLayer(id: string, root: ApplicationSettingsPaneMotionRoot) {
  return layer(id, root, 0, 1, 0, 1)
}

function outgoingLayer(id: string, root: ApplicationSettingsPaneMotionRoot, targetX: number) {
  return layer(id, root, 0, 1, targetX, 0)
}

function incomingLayer(id: string, root: ApplicationSettingsPaneMotionRoot, initialX: number) {
  return layer(id, root, initialX, 0, 0, 1)
}

function layer(
  id: string,
  root: ApplicationSettingsPaneMotionRoot,
  initialX: number,
  initialOpacity: number,
  targetX: number,
  targetOpacity: number
): ApplicationSettingsPaneMotionLayer {
  return { id, initialOpacity, initialX, root, targetOpacity, targetX }
}

function readX(root: ReturnType<typeof createRoot>): number {
  return Number.parseFloat(root.properties.get('--application-settings-pane-motion-x') ?? '0')
}

function readOpacity(root: ReturnType<typeof createRoot>): number {
  return Number.parseFloat(root.properties.get('--application-settings-pane-motion-opacity') ?? '0')
}

function createRoot(): ApplicationSettingsPaneMotionRoot & {
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

function createFrameScheduler(): SpringProgressMotionFrameScheduler & {
  readonly advanceNextFrame: (milliseconds?: number) => void
  readonly advanceUntilIdle: () => void
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
    requestFrame: (callback) => {
      const frameId = nextFrameId
      nextFrameId += 1
      callbacks.set(frameId, callback)
      return frameId
    }
  }
}
