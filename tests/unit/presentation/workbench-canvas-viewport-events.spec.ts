import {
  commitCompletedCanvasViewportMotion,
  persistCanvasViewportFromMoveEnd,
  synchronizeCanvasViewportFromMove
} from '../../../src/presentation/app-shell/workbench/viewport/workbenchCanvasViewport'

describe('workbench canvas viewport events', () => {
  it('projects programmatic spring frames without persisting and commits the settled target once', () => {
    const projection = createViewportProjection()
    const frames = [
      { x: -40, y: 10, zoom: 0.98 },
      { x: -120, y: 30, zoom: 0.92 },
      { x: -200, y: 50, zoom: 0.85 }
    ]

    for (const viewport of frames) {
      synchronizeCanvasViewportFromMove({ viewport, ...projection })
      persistCanvasViewportFromMoveEnd({
        event: null,
        isRestoringViewport: false,
        viewport,
        ...projection
      })
    }

    expect(projection.projectCanvasViewport).toHaveBeenCalledTimes(3)
    expect(projection.onViewportChange).not.toHaveBeenCalled()

    commitCompletedCanvasViewportMotion({
      completion: {
        intent: { type: 'spatial' },
        viewport: frames.at(-1)!
      },
      ...projection
    })

    expect(projection.projectCanvasViewport).toHaveBeenCalledTimes(4)
    expect(projection.projectCanvasViewport).toHaveBeenLastCalledWith(frames.at(-1))
    expect(projection.onViewportChange).toHaveBeenCalledOnce()
    expect(projection.onViewportChange).toHaveBeenCalledWith(frames.at(-1))
  })

  it('continues projecting direct manipulation and persists its final viewport', () => {
    const projection = createViewportProjection()
    const viewport = { x: -180, y: 60, zoom: 0.8 }
    const event = new MouseEvent('mousemove')

    synchronizeCanvasViewportFromMove({ viewport, ...projection })
    persistCanvasViewportFromMoveEnd({
      event,
      isRestoringViewport: false,
      viewport,
      ...projection
    })

    expect(projection.projectCanvasViewport).toHaveBeenCalledWith(viewport)
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

    expect(projection.projectCanvasViewport).not.toHaveBeenCalled()
    expect(projection.onViewportChange).not.toHaveBeenCalled()
  })

  it('reports programmatic zoom frames and completion without treating them as persistence', () => {
    const projection = createViewportProjection()
    const viewport = { x: -120, y: 30, zoom: 1.6 }

    synchronizeCanvasViewportFromMove({ viewport, ...projection })
    persistCanvasViewportFromMoveEnd({
      event: null,
      isRestoringViewport: false,
      viewport,
      ...projection
    })

    expect(projection.onRasterZoomChange).toHaveBeenCalledWith(1.6)
    expect(projection.onRasterInteractionEnd).toHaveBeenCalledWith(1.6)
    expect(projection.projectCanvasViewport).toHaveBeenCalledWith(viewport)
    expect(projection.onViewportChange).not.toHaveBeenCalled()
  })
})

function createViewportProjection() {
  return {
    onViewportChange: vi.fn(),
    onRasterInteractionEnd: vi.fn(),
    onRasterZoomChange: vi.fn(),
    projectCanvasViewport: vi.fn()
  }
}
