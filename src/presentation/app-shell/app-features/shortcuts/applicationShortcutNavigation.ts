import type { Viewport } from '@xyflow/react'

import type { TerminalGroupFlowNode } from '../../types/terminalGroupFlowNode'
import type { WorkbenchFlowNode } from '../../types/workbenchFlowNode'
import type { WorkbenchSnapshot } from '../../types/workbenchSnapshot'
import { resolveWorkbenchNodeSize } from '../../workbench/viewport/workbenchNodeFocusViewport'
import { isWorkbenchNodePresentationHidden } from '../../projections/workbenchNodeVisibility'

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

interface DirectionalNodeCandidate {
  readonly index: number
  readonly node: WorkbenchFlowNode
  readonly rect: CanvasRect
}

export function resolveDirectionalWorkbenchNode(
  nodes: readonly WorkbenchFlowNode[],
  selectedNodeId: string | null,
  viewport: Viewport,
  canvasSize: CanvasSize,
  direction: CanvasNavigationDirection,
  previousSelectedNodeId: string | null = null,
  previousDirection: CanvasNavigationDirection | null = null
): WorkbenchFlowNode | null {
  const selectedNode = nodes.find(
    (node) => node.id === selectedNodeId && !isWorkbenchNodePresentationHidden(node)
  )
  const origin = selectedNode
    ? toCanvasRect(selectedNode)
    : pointToCanvasRect(resolveViewportCenter(viewport, canvasSize))
  const containingExpandedGroup = resolveExpandedGroupContainingNode(nodes, selectedNodeId)
  const expandedMemberIds = resolveExpandedMemberIds(nodes)

  if (containingExpandedGroup) {
    const memberIds = new Set(containingExpandedGroup.data.group.memberBlockIds)
    return (
      resolveDirectionalCandidate(
        nodes,
        selectedNodeId,
        origin,
        direction,
        (node) => memberIds.has(node.id),
        false
      ) ?? containingExpandedGroup
    )
  }

  if (selectedNode?.type === 'terminalGroup' && !selectedNode.data.group.isCollapsed) {
    const memberIds = new Set(selectedNode.data.group.memberBlockIds)
    const isLeavingMemberScope = previousSelectedNodeId
      ? memberIds.has(previousSelectedNodeId) && previousDirection === direction
      : false

    if (!isLeavingMemberScope) {
      const memberTarget = resolveGroupEntryCandidate(nodes, memberIds, direction)
      if (memberTarget) {
        return memberTarget
      }
    }

    return resolveDirectionalCandidate(
      nodes,
      selectedNodeId,
      origin,
      direction,
      (node) => !expandedMemberIds.has(node.id)
    )
  }

  return resolveDirectionalCandidate(
    nodes,
    selectedNodeId,
    origin,
    direction,
    (node) => !expandedMemberIds.has(node.id)
  )
}

function resolveDirectionalCandidate(
  nodes: readonly WorkbenchFlowNode[],
  selectedNodeId: string | null,
  origin: CanvasRect,
  direction: CanvasNavigationDirection,
  isCandidate: (node: WorkbenchFlowNode) => boolean = () => true,
  allowCrossBandFallback = true
): WorkbenchFlowNode | null {
  const candidates = nodes
    .map((node, index) => ({ index, node, rect: toCanvasRect(node) }))
    .filter(
      ({ node, rect }) =>
        node.id !== selectedNodeId &&
        !isWorkbenchNodePresentationHidden(node) &&
        isCandidate(node) &&
        isInDirection(origin, rect, direction)
    )

  if (candidates.length === 0) {
    return null
  }

  if (direction === 'left' || direction === 'right') {
    const sameRowCandidates = candidates.filter(({ rect }) => shareNavigationRow(origin, rect))
    const scopedCandidates =
      sameRowCandidates.length > 0 ? sameRowCandidates : allowCrossBandFallback ? candidates : []

    return (
      scopedCandidates.sort((left, right) =>
        compareHorizontalCandidates(left, right, origin, direction)
      )[0]?.node ?? null
    )
  }

  const otherRowCandidates = candidates.filter(({ rect }) => !shareNavigationRow(origin, rect))
  if (otherRowCandidates.length === 0) {
    if (!allowCrossBandFallback) {
      return null
    }
    return (
      candidates.sort((left, right) => compareVerticalCandidates(left, right, origin, direction))[0]
        ?.node ?? null
    )
  }

  const adjacentRowSeed = [...otherRowCandidates].sort((left, right) =>
    compareDirectionalRowEdges(left, right, direction)
  )[0]
  const adjacentRowCandidates = otherRowCandidates.filter(({ rect }) =>
    shareNavigationRow(adjacentRowSeed.rect, rect)
  )

  return (
    adjacentRowCandidates.sort((left, right) =>
      compareVerticalCandidates(left, right, origin, direction)
    )[0]?.node ?? null
  )
}

function resolveGroupEntryCandidate(
  nodes: readonly WorkbenchFlowNode[],
  memberIds: ReadonlySet<string>,
  direction: CanvasNavigationDirection
): WorkbenchFlowNode | null {
  const candidates = nodes
    .map((node, index) => ({ index, node, rect: toCanvasRect(node) }))
    .filter(({ node }) => memberIds.has(node.id) && !isWorkbenchNodePresentationHidden(node))

  if (candidates.length === 0) {
    return null
  }

  const edgeSeed = [...candidates].sort((left, right) =>
    compareGroupEntryEdges(left, right, direction)
  )[0]
  const verticalEntry = direction === 'down' || direction === 'up'
  const edgeCandidates = candidates.filter(({ rect }) =>
    verticalEntry
      ? shareNavigationRow(edgeSeed.rect, rect)
      : shareNavigationColumn(edgeSeed.rect, rect)
  )

  return (
    edgeCandidates.sort((left, right) =>
      verticalEntry
        ? compareReadingOrderInRow(left, right)
        : compareReadingOrderInColumn(left, right)
    )[0]?.node ?? null
  )
}

function resolveExpandedGroupContainingNode(
  nodes: readonly WorkbenchFlowNode[],
  nodeId: string | null
): TerminalGroupFlowNode | null {
  if (!nodeId) return null

  return (
    nodes.find(
      (node): node is TerminalGroupFlowNode =>
        node.type === 'terminalGroup' &&
        !node.data.group.isCollapsed &&
        node.data.group.memberBlockIds.includes(nodeId)
    ) ?? null
  )
}

function resolveExpandedMemberIds(nodes: readonly WorkbenchFlowNode[]): ReadonlySet<string> {
  return new Set(
    nodes.flatMap((node) =>
      node.type === 'terminalGroup' && !node.data.group.isCollapsed
        ? node.data.group.memberBlockIds
        : []
    )
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

function compareHorizontalCandidates(
  left: DirectionalNodeCandidate,
  right: DirectionalNodeCandidate,
  origin: CanvasRect,
  direction: CanvasNavigationDirection
): number {
  return compareCandidateScores(
    [
      horizontalDirectionalGap(origin, left.rect, direction),
      rangeGap(origin.top, origin.bottom, left.rect.top, left.rect.bottom),
      Math.abs(left.rect.centerX - origin.centerX),
      Math.abs(left.rect.centerY - origin.centerY),
      left.rect.top,
      left.rect.left,
      left.index
    ],
    [
      horizontalDirectionalGap(origin, right.rect, direction),
      rangeGap(origin.top, origin.bottom, right.rect.top, right.rect.bottom),
      Math.abs(right.rect.centerX - origin.centerX),
      Math.abs(right.rect.centerY - origin.centerY),
      right.rect.top,
      right.rect.left,
      right.index
    ]
  )
}

function compareVerticalCandidates(
  left: DirectionalNodeCandidate,
  right: DirectionalNodeCandidate,
  origin: CanvasRect,
  direction: CanvasNavigationDirection
): number {
  return compareCandidateScores(
    [
      rangeGap(origin.left, origin.right, left.rect.left, left.rect.right),
      Math.abs(left.rect.centerX - origin.centerX),
      verticalDirectionalGap(origin, left.rect, direction),
      left.rect.left,
      left.rect.top,
      left.index
    ],
    [
      rangeGap(origin.left, origin.right, right.rect.left, right.rect.right),
      Math.abs(right.rect.centerX - origin.centerX),
      verticalDirectionalGap(origin, right.rect, direction),
      right.rect.left,
      right.rect.top,
      right.index
    ]
  )
}

function compareDirectionalRowEdges(
  left: DirectionalNodeCandidate,
  right: DirectionalNodeCandidate,
  direction: CanvasNavigationDirection
): number {
  const directionMultiplier = direction === 'up' ? -1 : 1
  const leftEdge = direction === 'up' ? left.rect.bottom : left.rect.top
  const rightEdge = direction === 'up' ? right.rect.bottom : right.rect.top
  const edgeDifference = (leftEdge - rightEdge) * directionMultiplier
  return edgeDifference || compareReadingOrderInRow(left, right)
}

function compareGroupEntryEdges(
  left: DirectionalNodeCandidate,
  right: DirectionalNodeCandidate,
  direction: CanvasNavigationDirection
): number {
  const leftEdge = resolveGroupEntryEdge(left.rect, direction)
  const rightEdge = resolveGroupEntryEdge(right.rect, direction)
  const edgeDifference = leftEdge - rightEdge
  if (edgeDifference !== 0) {
    return edgeDifference
  }

  return direction === 'down' || direction === 'up'
    ? compareReadingOrderInRow(left, right)
    : compareReadingOrderInColumn(left, right)
}

function resolveGroupEntryEdge(rect: CanvasRect, direction: CanvasNavigationDirection): number {
  if (direction === 'down') return rect.top
  if (direction === 'up') return -rect.bottom
  if (direction === 'right') return rect.left
  return -rect.right
}

function compareReadingOrderInRow(
  left: DirectionalNodeCandidate,
  right: DirectionalNodeCandidate
): number {
  return (
    left.rect.left - right.rect.left || left.rect.top - right.rect.top || left.index - right.index
  )
}

function compareReadingOrderInColumn(
  left: DirectionalNodeCandidate,
  right: DirectionalNodeCandidate
): number {
  return (
    left.rect.top - right.rect.top || left.rect.left - right.rect.left || left.index - right.index
  )
}

function compareCandidateScores(
  leftScore: readonly number[],
  rightScore: readonly number[]
): number {
  for (let index = 0; index < leftScore.length; index += 1) {
    const difference = leftScore[index] - rightScore[index]
    if (difference !== 0) return difference
  }

  return 0
}

function horizontalDirectionalGap(
  origin: CanvasRect,
  candidate: CanvasRect,
  direction: CanvasNavigationDirection
): number {
  return direction === 'left'
    ? Math.max(0, origin.left - candidate.right)
    : Math.max(0, candidate.left - origin.right)
}

function verticalDirectionalGap(
  origin: CanvasRect,
  candidate: CanvasRect,
  direction: CanvasNavigationDirection
): number {
  return direction === 'up'
    ? Math.max(0, origin.top - candidate.bottom)
    : Math.max(0, candidate.top - origin.bottom)
}

function shareNavigationRow(first: CanvasRect, second: CanvasRect): boolean {
  return first.top < second.bottom && second.top < first.bottom
}

function shareNavigationColumn(first: CanvasRect, second: CanvasRect): boolean {
  return first.left < second.right && second.left < first.right
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
): { readonly workbench: WorkbenchSnapshot; readonly workspaceId: string } | null {
  const targets = workbenches.flatMap((workbench) =>
    workbench.project.workspaces.map((workspace) => ({
      workbench,
      workspaceId: workspace.workspaceId
    }))
  )
  if (targets.length === 0) {
    return null
  }

  const currentWorkspaceId = currentWorkbench?.project.workspaces.find(
    (workspace) => workspace.isCurrent
  )?.workspaceId
  const currentIndex = targets.findIndex(
    (target) =>
      target.workbench.project.id === currentWorkbench?.project.id &&
      target.workspaceId === currentWorkspaceId
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
