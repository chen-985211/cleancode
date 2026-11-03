import {
  TerminalZoomRasterCoordinator,
  type TerminalZoomRasterIdleDeadline
} from '../../../../src/contexts/run/presentation/terminal-surface/terminalZoomRasterCoordinator'

afterEach(() => vi.useRealTimers())

it.each([0.35, 0.77, 0.96, 1, 1.1, 1.2, 1.4, 1.6])(
  'matches display scale %s after return, independently of a previous workspace zoom',
  (displayScale) => {
    vi.useFakeTimers()
    const callbacks = new Map<number, (deadline: TerminalZoomRasterIdleDeadline) => void>()
    let nextId = 0
    let scale = 1
    const target = {
      id: 'windows-terminal',
      getRasterPriority: () => 'visible' as const,
      getRasterScale: () => scale,
      getPreferredRasterScale: () => displayScale,
      getRasterCost: (value: number) => Math.ceil(100 * value) ** 2,
      setRasterScale: (value: number) => {
        scale = value
      }
    }
    const coordinator = new TerminalZoomRasterCoordinator({
      scheduler: {
        setTimeout: (callback, delay) => setTimeout(callback, delay),
        clearTimeout: (handle) => clearTimeout(handle),
        requestIdle: (callback) => {
          callbacks.set(++nextId, callback)
          return nextId
        },
        cancelIdle: (id) => {
          callbacks.delete(id)
        }
      }
    })
    try {
      coordinator.register(target)
      coordinator.endInteraction(1.6)
      const drain = () => {
        for (const [id, callback] of callbacks) {
          callbacks.delete(id)
          callback({ didTimeout: false, timeRemaining: () => 20 })
        }
      }
      drain()
      expect(scale).toBe(displayScale)
      vi.advanceTimersByTime(1000)
      drain()
      expect(scale).toBe(displayScale)
    } finally {
      coordinator.dispose()
    }
  }
)
