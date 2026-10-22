import { createWorkbenchObjectSpringController } from '../../../src/presentation/app-shell/workbench/nodes/workbenchObjectSpring'

describe('workbench shell frame clock', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(document, 'timeline')
  })

  it.each([0, 40, 120])(
    'keeps adjacent shells synchronized when mounting takes %s ms within one frame',
    (mountCost) => {
      let frameTime = 0
      let wallTime = 0
      const callbacks = new Map<number, FrameRequestCallback>()
      let nextFrame = 0
      vi.spyOn(window.performance, 'now').mockImplementation(() => wallTime)
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
        callbacks.set(++nextFrame, callback)
        return nextFrame
      })
      vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => callbacks.delete(id))
      Object.defineProperty(document, 'timeline', {
        configurable: true,
        value: {
          get currentTime() {
            return frameTime
          }
        }
      })
      const shells = [document.createElement('div'), document.createElement('div')]
      const controllers = shells.map(() => createWorkbenchObjectSpringController())
      const targets = [
        { x: 0, y: 0, width: 420, height: 280 },
        { x: 484, y: 0, width: 220, height: 44 }
      ]
      try {
        controllers.forEach((controller, index) => {
          wallTime = index * mountCost
          controller.motionChanged(
            shells[index]!,
            {
              id: `reflow-${index}`,
              kind: 'group-reflow',
              offset: { x: 0, y: 0 },
              shellRect: {
                from: { x: index * 284, y: 0, width: 220, height: 44 },
                to: targets[index]!
              }
            },
            false,
            () => undefined
          )
        })
        frameTime = wallTime
        for (let frame = 0; frame < 12; frame++) {
          frameTime += 50
          wallTime = frameTime + mountCost
          const pending = [...callbacks.values()]
          callbacks.clear()
          pending.forEach((callback) => callback(frameTime))
          const firstWidth = parseFloat(
            shells[0]!.style.getPropertyValue('--workbench-object-motion-shell-width')
          )
          const secondX =
            484 + parseFloat(shells[1]!.style.getPropertyValue('--workbench-object-motion-shell-x'))
          expect(secondX - firstWidth).toBeCloseTo(64, 3)
        }
      } finally {
        controllers.forEach((controller) => controller.dispose())
      }
    }
  )
})
