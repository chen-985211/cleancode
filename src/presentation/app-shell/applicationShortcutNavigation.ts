import type { Viewport } from '@xyflow/react'

import type { WorkbenchSnapshot } from './types'

export type CanvasPanDirection = 'down' | 'left' | 'right' | 'up'
export type WorkspaceNavigationDirection = 'next' | 'previous'

export function resolvePannedCanvasViewport(
  viewport: Viewport,
  direction: CanvasPanDirection,
  distance: number
): Viewport {
  const offsets: Readonly<Record<CanvasPanDirection, { readonly x: number; readonly y: number }>> =
    {
      down: { x: 0, y: -distance },
      left: { x: distance, y: 0 },
      right: { x: -distance, y: 0 },
      up: { x: 0, y: distance }
    }
  const offset = offsets[direction]

  return {
    x: viewport.x + offset.x,
    y: viewport.y + offset.y,
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
