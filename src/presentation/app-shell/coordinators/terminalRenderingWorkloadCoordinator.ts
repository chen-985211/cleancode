import type { TerminalWorkloadScheduler } from '../../../contexts/run/presentation/terminal-surface/terminalWorkloadScheduler'
import type { TerminalZoomRasterCoordinator } from '../../../contexts/run/presentation/terminal-surface/terminalZoomRasterCoordinator'

export interface TerminalRenderingWorkloadCoordinator {
  beginInteraction(): void
  endInteraction(canvasZoom?: number): void
  setSidebarMotionActive(isActive: boolean): void
  updateCanvasZoom(canvasZoom: number): void
}

export function createTerminalRenderingWorkloadCoordinator(
  rasterCoordinator: Pick<
    TerminalZoomRasterCoordinator,
    'beginInteraction' | 'endInteraction' | 'updateCanvasZoom'
  >,
  workloadScheduler: Pick<TerminalWorkloadScheduler, 'beginInteraction' | 'endInteraction'>
): TerminalRenderingWorkloadCoordinator {
  return {
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
