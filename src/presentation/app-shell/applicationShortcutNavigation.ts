import type { Viewport } from '@xyflow/react'

import type { WorkbenchFlowNode, WorkbenchSnapshot } from './types'
import { resolveWorkbenchNodeSize } from './workbenchNodeFocusViewport'

export type WorkspaceNavigationDirection = 'next' | 'previous'

export type CanvasNavigationDirection = 'down' | 'left' | 'right' | 'up'

export interface CanvasSize {
  readonly width: number
  readonly height: number
}

interface CanvasRect {
  readonly bottom: number
  readonly centerX: number
  readonly centerY: number
  readonly left: number
  readonly right: number
  readonly top: number
}

export function resolveDirectionalWorkbenchNode(
  nodes: readonly WorkbenchFlowNode[],
  selectedNodeId: string | null,
  viewport: Viewport,
  canvasSize: CanvasSize,
  direction: CanvasNavigationDirection
): WorkbenchFlowNode | null {
  const selectedNode = nodes.find((node) => node.id === selectedNodeId)
  const origin = selectedNode
    ? toCanvasRect(selectedNode)
    : pointToCanvasRect(resolveViewportCenter(viewport, canvasSize))

  return (
    nodes
      .map((node, index) => ({ index, node, rect: toCanvasRect(node) }))
      .filter(
        ({ node, rect }) => node.id !== selectedNodeId && isInDirection(origin, rect, direction)
      )
      .sort((left, right) => compareDirectionalCandidates(left, right, origin, direction))[0]
      ?.node ?? null
  )
}

export function resolveWorkbenchNodeCenter(node: WorkbenchFlowNode): {
  readonly x: number
  readonly y: number
} {
  const rect = toCanvasRect(node)
  return { x: rect.centerX, y: rect.centerY }
}

function resolveViewportCenter(viewport: Viewport, canvasSize: CanvasSize) {
  return viewportPointToCanvasPoint(
    {
      x: resolveCanvasDimension(canvasSize.width, 960) / 2,
      y: resolveCanvasDimension(canvasSize.height, 640) / 2
    },
    viewport
  )
}

function viewportPointToCanvasPoint(
  point: { readonly x: number; readonly y: number },
  viewport: Viewport
) {
  const zoom = Math.max(viewport.zoom, 0.01)
  return {
    x: (point.x - viewport.x) / zoom,
    y: (point.y - viewport.y) / zoom
  }
}

function pointToCanvasRect(point: { readonly x: number; readonly y: number }): CanvasRect {
  return {
    bottom: point.y,
    centerX: point.x,
    centerY: point.y,
    left: point.x,
    right: point.x,
    top: point.y
  }
}

function toCanvasRect(node: WorkbenchFlowNode): CanvasRect {
  const { width, height } = resolveWorkbenchNodeSize(node)
  const left = node.position.x
  const top = node.position.y

  return {
    bottom: top + height,
    centerX: left + width / 2,
    centerY: top + height / 2,
    left,
    right: left + width,
    top
  }
}

function isInDirection(
  origin: CanvasRect,
  candidate: CanvasRect,
  direction: CanvasNavigationDirection
): boolean {
  if (direction === 'left') return candidate.centerX < origin.centerX
  if (direction === 'right') return candidate.centerX > origin.centerX
  if (direction === 'up') return candidate.centerY < origin.centerY
  return candidate.centerY > origin.centerY
}

function compareDirectionalCandidates(
  left: { readonly index: number; readonly rect: CanvasRect },
  right: { readonly index: number; readonly rect: CanvasRect },
  origin: CanvasRect,
  direction: CanvasNavigationDirection
): number {
  const leftScore = directionalCandidateScore(origin, left.rect, direction)
  const rightScore = directionalCandidateScore(origin, right.rect, direction)

  for (let index = 0; index < leftScore.length; index += 1) {
    const difference = leftScore[index] - rightScore[index]
    if (difference !== 0) return difference
  }

  return left.index - right.index
}

function directionalCandidateScore(
  origin: CanvasRect,
  candidate: CanvasRect,
  direction: CanvasNavigationDirection
): readonly number[] {
  const horizontal = direction === 'left' || direction === 'right'
  const aligned = horizontal
    ? rangesOverlap(origin.top, origin.bottom, candidate.top, candidate.bottom)
    : rangesOverlap(origin.left, origin.right, candidate.left, candidate.right)
  const primaryGap =
    direction === 'left'
      ? Math.max(0, origin.left - candidate.right)
      : direction === 'right'
        ? Math.max(0, candidate.left - origin.right)
        : direction === 'up'
          ? Math.max(0, origin.top - candidate.bottom)
          : Math.max(0, candidate.top - origin.bottom)
  const orthogonalGap = horizontal
    ? rangeGap(origin.top, origin.bottom, candidate.top, candidate.bottom)
    : rangeGap(origin.left, origin.right, candidate.left, candidate.right)
  const centerDistance = Math.hypot(
    candidate.centerX - origin.centerX,
    candidate.centerY - origin.centerY
  )

  return [aligned ? 0 : 1, primaryGap, orthogonalGap, centerDistance]
}

function rangesOverlap(
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number
): boolean {
  return firstStart <= secondEnd && secondStart <= firstEnd
}

function rangeGap(
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number
): number {
  if (rangesOverlap(firstStart, firstEnd, secondStart, secondEnd)) return 0
  return secondStart > firstEnd ? secondStart - firstEnd : firstStart - secondEnd
}

function resolveCanvasDimension(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback
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
