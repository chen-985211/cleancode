import { TerminalSurfaceRegistry } from '../../../../contexts/run/presentation/terminal-surface/terminalSurfaceRegistry'
import { TerminalWorkloadScheduler } from '../../../../contexts/run/presentation/terminal-surface/terminalWorkloadScheduler'
import { TerminalZoomRasterCoordinator } from '../../../../contexts/run/presentation/terminal-surface/terminalZoomRasterCoordinator'

export function createTerminalRenderingServices(maximumRasterScale: number) {
  const terminalZoomRasterCoordinator = new TerminalZoomRasterCoordinator({ maximumRasterScale })
  const terminalWorkloadScheduler = new TerminalWorkloadScheduler()
  return {
    terminalZoomRasterCoordinator,
    terminalWorkloadScheduler,
    terminalRenderingWorkloadCoordinator: createTerminalRenderingWorkloadCoordinator(
      terminalZoomRasterCoordinator,
      terminalWorkloadScheduler
    ),
    terminalSurfaceRegistry: new TerminalSurfaceRegistry(
      undefined,
      undefined,
      terminalZoomRasterCoordinator,
      terminalWorkloadScheduler
    )
  }
}

export interface TerminalRenderingWorkloadCoordinator {
  beginInteraction(): void
  endInteraction(canvasZoom?: number): void
  setSidebarMotionActive(isActive: boolean): void
  updateCanvasZoom(canvasZoom: number): void
  requestRasterAlignment(): void
}

export function createTerminalRenderingWorkloadCoordinator(
  rasterCoordinator: Pick<
    TerminalZoomRasterCoordinator,
    'beginInteraction' | 'endInteraction' | 'updateCanvasZoom' | 'requestRasterAlignment'
  >,
  workloadScheduler: Pick<TerminalWorkloadScheduler, 'beginInteraction' | 'endInteraction'>
): TerminalRenderingWorkloadCoordinator {
  return {
    requestRasterAlignment: () => rasterCoordinator.requestRasterAlignment(),
    beginInteraction: () => {
      rasterCoordinator.beginInteraction()
      workloadScheduler.beginInteraction('canvas')
    },
    endInteraction: (canvasZoom) => {
      rasterCoordinator.endInteraction(canvasZoom)
      workloadScheduler.endInteraction('canvas')
    },
    setSidebarMotionActive: (isActive) => {
      if (isActive) workloadScheduler.beginInteraction('sidebar')
      else workloadScheduler.endInteraction('sidebar')
    },
    updateCanvasZoom: (canvasZoom) => rasterCoordinator.updateCanvasZoom(canvasZoom)
  }
}
