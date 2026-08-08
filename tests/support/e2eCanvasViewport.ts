import type { Page } from 'playwright'

import { pollUntilState } from './e2ePolling'

interface CanvasViewportProjection {
  readonly x: number
  readonly y: number
  readonly zoom: number
}

export interface CanvasViewportCommit {
  readonly currentViewport: CanvasViewportProjection
  readonly persistedViewport: CanvasViewportProjection
}

export async function waitForCanvasViewportZoomCommit(
  page: Page,
  options: {
    readonly direction: 'decrease' | 'increase'
    readonly previousZoom: number
    readonly projectDirectory: string
  }
): Promise<CanvasViewportCommit> {
  const maximumProjectionError = 0.001
  const completion = await pollUntilState({
    description: `canvas zoom ${options.direction} to commit its completed viewport`,
    observe: () =>
      page.evaluate(async (projectDirectory) => {
        const viewport = document.querySelector<HTMLElement>('.react-flow__viewport')
        const api = window.cleancode
        if (!viewport || !api) return null

        const workbenches = await api.listWorkbenches()
        const workbench = workbenches.find(
          (candidate) => candidate.project.directory === projectDirectory
        )
        if (!workbench) return null

        const transform = new DOMMatrixReadOnly(getComputedStyle(viewport).transform)
        return {
          currentViewport: { x: transform.e, y: transform.f, zoom: transform.a },
          persistedViewport: workbench.graph.viewport
        }
      }, options.projectDirectory),
    accept: (observation) => {
      if (!observation) return false
      const { currentViewport, persistedViewport } = observation
      const values = [
        currentViewport.x,
        currentViewport.y,
        currentViewport.zoom,
        persistedViewport.x,
        persistedViewport.y,
        persistedViewport.zoom
      ]
      const zoomChanged =
        options.direction === 'increase'
          ? persistedViewport.zoom > options.previousZoom + 0.001
          : persistedViewport.zoom < options.previousZoom - 0.001

      return (
        values.every(Number.isFinite) &&
        currentViewport.zoom > 0 &&
        persistedViewport.zoom > 0 &&
        zoomChanged &&
        Math.abs(currentViewport.x - persistedViewport.x) <= maximumProjectionError &&
        Math.abs(currentViewport.y - persistedViewport.y) <= maximumProjectionError &&
        Math.abs(currentViewport.zoom - persistedViewport.zoom) <= maximumProjectionError
      )
    },
    retryObservationErrors: true,
    timeoutMs: 5_000
  })

  if (!completion) throw new Error('The completed canvas viewport was unavailable.')
  return completion
}
