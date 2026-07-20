import type { Viewport } from '@xyflow/react'

import type { WorkbenchSnapshot } from './types'

export type CanvasPanDirection = 'down' | 'left' | 'right' | 'up'
export type WorkspaceNavigationDirection = 'next' | 'previous'

export function resolveContinuousCanvasPanViewport(
  viewport: Viewport,
  directions: readonly CanvasPanDirection[],
  pixelsPerSecond: number,
  elapsedMs: number
): Viewport {
  const horizontal = Number(directions.includes('left')) - Number(directions.includes('right'))
  const vertical = Number(directions.includes('up')) - Number(directions.includes('down'))
  const magnitude = Math.hypot(horizontal, vertical)
  if (magnitude === 0) {
    return viewport
  }

  const distance = (pixelsPerSecond * elapsedMs) / 1_000
  return {
    x: viewport.x + (horizontal / magnitude) * distance,
    y: viewport.y + (vertical / magnitude) * distance,
    zoom: viewport.zoom
  }
}

export function resolveAdjacentWorkspaceTarget(
  workbenches: readonly WorkbenchSnapshot[],
  currentWorkbench: WorkbenchSnapshot | null,
  direction: WorkspaceNavigationDirection
): { readonly workbench: WorkbenchSnapshot; readonly workspaceName: string } | null {
  const targets = workbenches.flatMap((workbench) =>
    workbench.project.workspaces.map((workspace) => ({
      workbench,
      workspaceName: workspace.name
    }))
  )
  if (targets.length === 0) {
    return null
  }

  const currentWorkspaceName = currentWorkbench?.project.workspaces.find(
    (workspace) => workspace.isCurrent
  )?.name
  const currentIndex = targets.findIndex(
    (target) =>
      target.workbench.project.id === currentWorkbench?.project.id &&
      target.workspaceName === currentWorkspaceName
  )
  const offset = direction === 'next' ? 1 : -1
  const nextIndex =
    currentIndex === -1
      ? direction === 'next'
        ? 0
        : targets.length - 1
      : (currentIndex + offset + targets.length) % targets.length

  return targets[nextIndex] ?? null
}
