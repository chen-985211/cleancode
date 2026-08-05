import { createWorkbenchViewportFlight } from '../../../src/presentation/app-shell/workbenchViewportFlight'

describe('workbench viewport flight', () => {
  it('does not widen an anchored zoom at a distant world position', () => {
    const canvasSize = { height: 640, width: 960 }
    const center = { x: 3_000, y: 2_000 }
    const viewportAt = (zoom: number) => ({
      x: canvasSize.width / 2 - center.x * zoom,
      y: canvasSize.height / 2 - center.y * zoom,
      zoom
    })

    expect(createWorkbenchViewportFlight(viewportAt(0.6), viewportAt(0.9), canvasSize)).toBeNull()
  })
})
