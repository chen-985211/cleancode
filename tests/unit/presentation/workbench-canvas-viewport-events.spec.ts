import {
  commitCompletedCanvasViewportMotion,
  persistCanvasViewportFromMoveEnd,
  synchronizeCanvasViewportFromMove
} from '../../../src/presentation/app-shell/workbenchCanvasViewport'

describe('workbench canvas viewport events', () => {
  it('keeps programmatic spring frames out of React state and commits the settled target once', () => {
    const projection = createViewportProjection()
    const frames = [
      { x: -40, y: 10, zoom: 0.98 },
      { x: -120, y: 30, zoom: 0.92 },
      { x: -200, y: 50, zoom: 0.85 }
    ]

    for (const event of [null, undefined]) {
      for (const viewport of frames) {
        synchronizeCanvasViewportFromMove({
          event,
          viewport,
          ...projection
        })
        persistCanvasViewportFromMoveEnd({
          event,
          isRestoringViewport: false,
          viewport,
          ...projection
        })
      }
    }

    expect(projection.setCanvasViewport).not.toHaveBeenCalled()
    expect(projection.setViewportZoom).not.toHaveBeenCalled()
    expect(projection.onViewportChange).not.toHaveBeenCalled()

    commitCompletedCanvasViewportMotion({
      completion: {
        intent: { type: 'spatial' },
        viewport: frames.at(-1)!
      },
      ...projection
    })

    expect(projection.setCanvasViewport).toHaveBeenCalledOnce()
    expect(projection.setCanvasViewport).toHaveBeenCalledWith(frames.at(-1))
    expect(projection.setViewportZoom).toHaveBeenCalledOnce()
    expect(projection.setViewportZoom).toHaveBeenCalledWith(0.85)
    expect(projection.onViewportChange).toHaveBeenCalledOnce()
    expect(projection.onViewportChange).toHaveBeenCalledWith(frames.at(-1))
  })

  it('continues projecting direct manipulation and persists its final viewport', () => {
    const projection = createViewportProjection()
    const viewport = { x: -180, y: 60, zoom: 0.8 }
    const event = new MouseEvent('mousemove')

    synchronizeCanvasViewportFromMove({ event, viewport, ...projection })
    persistCanvasViewportFromMoveEnd({
      event,
      isRestoringViewport: false,
      viewport,
      ...projection
    })

    expect(projection.setCanvasViewport).toHaveBeenCalledWith(viewport)
    expect(projection.setViewportZoom).toHaveBeenCalledWith(0.8)
    expect(projection.onViewportChange).toHaveBeenCalledOnce()
    expect(projection.onViewportChange).toHaveBeenCalledWith(viewport)
  })

  it('leaves instant restoration and preview commits with their explicit callers', () => {
    const projection = createViewportProjection()

    commitCompletedCanvasViewportMotion({
      completion: {
        intent: { type: 'instant' },
        viewport: { x: -240, y: 80, zoom: 0.75 }
      },
      ...projection
    })

    expect(projection.setCanvasViewport).not.toHaveBeenCalled()
    expect(projection.setViewportZoom).not.toHaveBeenCalled()
    expect(projection.onViewportChange).not.toHaveBeenCalled()
  })

  it('reports programmatic zoom frames and completion without treating them as persistence', () => {
    const projection = createViewportProjection()
    const viewport = { x: -120, y: 30, zoom: 1.6 }

    synchronizeCanvasViewportFromMove({ event: null, viewport, ...projection })
    persistCanvasViewportFromMoveEnd({
      event: null,
      isRestoringViewport: false,
      viewport,
      ...projection
    })

    expect(projection.onRasterZoomChange).toHaveBeenCalledWith(1.6)
    expect(projection.onRasterInteractionEnd).toHaveBeenCalledWith(1.6)
    expect(projection.setCanvasViewport).not.toHaveBeenCalled()
    expect(projection.onViewportChange).not.toHaveBeenCalled()
  })
})

function createViewportProjection() {
  return {
    onViewportChange: vi.fn(),
    onRasterInteractionEnd: vi.fn(),
    onRasterZoomChange: vi.fn(),
    setCanvasViewport: vi.fn(),
    setViewportZoom: vi.fn()
  }
}
