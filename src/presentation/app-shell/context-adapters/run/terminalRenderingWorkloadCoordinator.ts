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
  setObjectMotionActive(isActive: boolean): void
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
  const rasterInteractions = new Set<string>()
  const begin = (owner: string) => {
    if (!rasterInteractions.size) rasterCoordinator.beginInteraction()
    rasterInteractions.add(owner)
    workloadScheduler.beginInteraction(owner)
  }
  const end = (owner: string, canvasZoom?: number) => {
    rasterInteractions.delete(owner)
    workloadScheduler.endInteraction(owner)
    if (!rasterInteractions.size) rasterCoordinator.endInteraction(canvasZoom)
    else if (canvasZoom !== undefined) rasterCoordinator.updateCanvasZoom(canvasZoom)
  }
  return {
    requestRasterAlignment: () => rasterCoordinator.requestRasterAlignment(),
    beginInteraction: () => begin('canvas'),
    endInteraction: (canvasZoom) => end('canvas', canvasZoom),
    setSidebarMotionActive: (isActive) => {
      if (isActive) workloadScheduler.beginInteraction('sidebar')
      else workloadScheduler.endInteraction('sidebar')
    },
    setObjectMotionActive: (isActive) => {
      if (isActive) begin('object-motion')
      else end('object-motion')
    },
    updateCanvasZoom: (canvasZoom) => rasterCoordinator.updateCanvasZoom(canvasZoom)
  }
}
