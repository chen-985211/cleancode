import { createTerminalRenderingWorkloadCoordinator } from '../../../src/presentation/app-shell/context-adapters/run/terminalRenderingWorkloadCoordinator'

describe('terminal rendering workload coordinator', () => {
  it('publishes canvas motion to raster and output owners while sidebar motion only affects output', () => {
    const raster = {
      beginInteraction: vi.fn(),
      endInteraction: vi.fn(),
      requestRasterAlignment: vi.fn(),
      updateCanvasZoom: vi.fn()
    }
    const workload = { beginInteraction: vi.fn(), endInteraction: vi.fn() }
    const coordinator = createTerminalRenderingWorkloadCoordinator(raster, workload)

    coordinator.beginInteraction()
    coordinator.updateCanvasZoom(1.5)
    coordinator.endInteraction(1.5)
    coordinator.requestRasterAlignment()
    coordinator.setSidebarMotionActive(true)
    coordinator.setSidebarMotionActive(false)

    expect(raster.beginInteraction).toHaveBeenCalledOnce()
    expect(raster.updateCanvasZoom).toHaveBeenCalledWith(1.5)
    expect(raster.endInteraction).toHaveBeenCalledWith(1.5)
    expect(raster.requestRasterAlignment).toHaveBeenCalledOnce()
    expect(workload.beginInteraction).toHaveBeenNthCalledWith(1, 'canvas')
    expect(workload.beginInteraction).toHaveBeenNthCalledWith(2, 'sidebar')
    expect(workload.endInteraction).toHaveBeenNthCalledWith(1, 'canvas')
    expect(workload.endInteraction).toHaveBeenNthCalledWith(2, 'sidebar')
  })
})
