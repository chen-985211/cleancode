import { useCallback, useSyncExternalStore } from 'react'

import type { CanvasViewportSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import {
  resolveWorkbenchCanvasDetailLevel,
  type WorkbenchCanvasDetailLevel
} from './projections/workbenchObjectMotion'

export interface WorkbenchCanvasViewportStore {
  readonly getViewport: () => CanvasViewportSnapshot
  readonly setViewport: (viewport: CanvasViewportSnapshot) => void
  readonly subscribe: (listener: () => void) => () => void
}

export function createWorkbenchCanvasViewportStore(
  initialViewport: CanvasViewportSnapshot
): WorkbenchCanvasViewportStore {
  let viewport = initialViewport
  const listeners = new Set<() => void>()

  return {
    getViewport: () => viewport,
    setViewport: (nextViewport) => {
      if (isSameViewport(viewport, nextViewport)) return

      viewport = nextViewport
      listeners.forEach((listener) => listener())
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

export function useWorkbenchCanvasViewport(
  store: WorkbenchCanvasViewportStore
): CanvasViewportSnapshot {
  return useSyncExternalStore(store.subscribe, store.getViewport, store.getViewport)
}

export function useWorkbenchCanvasZoomPercent(store: WorkbenchCanvasViewportStore): number {
  const getZoomPercent = useCallback(() => Math.round(store.getViewport().zoom * 100), [store])

  return useSyncExternalStore(store.subscribe, getZoomPercent, getZoomPercent)
}

export function useWorkbenchCanvasDetailLevel(
  store: WorkbenchCanvasViewportStore,
  reduceVisualNoise: boolean
): WorkbenchCanvasDetailLevel {
  const getDetailLevel = useCallback(
    () => resolveWorkbenchCanvasDetailLevel(store.getViewport().zoom, reduceVisualNoise),
    [reduceVisualNoise, store]
  )

  return useSyncExternalStore(store.subscribe, getDetailLevel, getDetailLevel)
}

function isSameViewport(
  currentViewport: CanvasViewportSnapshot,
  nextViewport: CanvasViewportSnapshot
): boolean {
  return (
    currentViewport.x === nextViewport.x &&
    currentViewport.y === nextViewport.y &&
    currentViewport.zoom === nextViewport.zoom
  )
}
