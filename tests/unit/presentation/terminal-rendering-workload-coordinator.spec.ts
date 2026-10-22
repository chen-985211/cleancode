import {
  createTerminalRenderingWorkloadCoordinator,
  createTerminalRenderingServices
} from '../../../src/presentation/app-shell/context-adapters/run/terminalRenderingWorkloadCoordinator'

describe('terminal rendering workload coordinator', () => {
  it('wires the canvas limit and completed motion into the shared raster owner', () => {
    vi.useFakeTimers()
    const services = createTerminalRenderingServices(1.6)
    let scale = 1
    try {
      services.terminalZoomRasterCoordinator.register({
        id: 'terminal',
        getRasterPriority: () => 'focused',
        getRasterScale: () => scale,
        getRasterCost: (next) => next * next * 100,
        setRasterScale: (next) => {
          scale = next
        }
      })
      services.terminalRenderingWorkloadCoordinator.beginInteraction()
      services.terminalRenderingWorkloadCoordinator.updateCanvasZoom(1.6)
      vi.runOnlyPendingTimers()
      expect(scale).toBe(1)
      services.terminalRenderingWorkloadCoordinator.endInteraction(1.6)
      vi.runOnlyPendingTimers()
      expect(scale).toBe(1.6)
    } finally {
      services.terminalSurfaceRegistry.disposeAll()
      services.terminalZoomRasterCoordinator.dispose()
      services.terminalWorkloadScheduler.dispose()
      vi.useRealTimers()
    }
  })

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
    coordinator.setObjectMotionActive(true)
    coordinator.setObjectMotionActive(false)

    expect(raster.beginInteraction).toHaveBeenCalledTimes(2)
    expect(raster.updateCanvasZoom).toHaveBeenCalledWith(1.5)
    expect(raster.endInteraction).toHaveBeenCalledWith(1.5)
    expect(raster.requestRasterAlignment).toHaveBeenCalledOnce()
    expect(workload.beginInteraction).toHaveBeenNthCalledWith(1, 'canvas')
    expect(workload.beginInteraction).toHaveBeenNthCalledWith(2, 'sidebar')
    expect(workload.endInteraction).toHaveBeenNthCalledWith(1, 'canvas')
    expect(workload.endInteraction).toHaveBeenNthCalledWith(2, 'sidebar')
    expect(workload.beginInteraction).toHaveBeenNthCalledWith(3, 'object-motion')
    expect(workload.endInteraction).toHaveBeenNthCalledWith(3, 'object-motion')
  })

  it('keeps raster work suspended until both disclosure and canvas interaction finish', () => {
    const raster = {
      beginInteraction: vi.fn(),
      endInteraction: vi.fn(),
      requestRasterAlignment: vi.fn(),
      updateCanvasZoom: vi.fn()
    }
    const workload = { beginInteraction: vi.fn(), endInteraction: vi.fn() }
    const coordinator = createTerminalRenderingWorkloadCoordinator(raster, workload)
    coordinator.setObjectMotionActive(true)
    coordinator.beginInteraction()
    coordinator.setObjectMotionActive(false)
    expect(raster.beginInteraction).toHaveBeenCalledOnce()
    expect(raster.endInteraction).not.toHaveBeenCalled()
    coordinator.endInteraction(1.6)
    expect(raster.endInteraction).toHaveBeenCalledWith(1.6)

    coordinator.beginInteraction()
    coordinator.setObjectMotionActive(true)
    coordinator.endInteraction(0.8)
    expect(raster.endInteraction).toHaveBeenCalledTimes(1)
    expect(raster.updateCanvasZoom).toHaveBeenLastCalledWith(0.8)
    coordinator.setObjectMotionActive(false)
    expect(raster.endInteraction).toHaveBeenCalledTimes(2)
  })
})
