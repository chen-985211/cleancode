import type { BlockTemplateSnapshot } from '../../contexts/block-graph/application/dto/BlockTemplateSnapshot'
import {
  workbenchNodePlacementGap,
  type WorkbenchCanvasRect,
  type WorkbenchNodePosition
} from './workbenchNodeCreationPolicy'

const terminalGroupPadding = { x: 32, y: 76 }
const minimumTerminalGroupSize = { width: 520, height: 320 }

export function resolveBlockTemplatePlacement({
  desiredCenter,
  occupiedRects,
  template
}: {
  readonly desiredCenter: WorkbenchNodePosition
  readonly occupiedRects: readonly WorkbenchCanvasRect[]
  readonly template: BlockTemplateSnapshot
}): WorkbenchNodePosition {
  const relativeFootprint = projectBlockTemplateRects(template, { x: 0, y: 0 })
  const footprintBounds = boundsOf(relativeFootprint)
  const desiredOrigin = {
    x: desiredCenter.x - (footprintBounds.left + footprintBounds.right) / 2,
    y: desiredCenter.y - (footprintBounds.top + footprintBounds.bottom) / 2
  }

  if (isOriginAvailable(relativeFootprint, desiredOrigin, occupiedRects)) {
    return desiredOrigin
  }

  const xCandidates = new Set([desiredOrigin.x])
  const yCandidates = new Set([desiredOrigin.y])

  for (const templateRect of relativeFootprint) {
    for (const occupied of occupiedRects) {
      xCandidates.add(
        occupied.position.x -
          workbenchNodePlacementGap -
          templateRect.position.x -
          templateRect.size.width
      )
      xCandidates.add(
        occupied.position.x +
          occupied.size.width +
          workbenchNodePlacementGap -
          templateRect.position.x
      )
      yCandidates.add(
        occupied.position.y -
          workbenchNodePlacementGap -
          templateRect.position.y -
          templateRect.size.height
      )
      yCandidates.add(
        occupied.position.y +
          occupied.size.height +
          workbenchNodePlacementGap -
          templateRect.position.y
      )
    }
  }

  const candidates = [...xCandidates].flatMap((x) => [...yCandidates].map((y) => ({ x, y })))

  return (
    candidates
      .filter((origin) => isOriginAvailable(relativeFootprint, origin, occupiedRects))
      .sort((left, right) => compareOrigins(left, right, desiredOrigin))[0] ?? desiredOrigin
  )
}

export function projectBlockTemplateRects(
  template: BlockTemplateSnapshot,
  origin: WorkbenchNodePosition
): WorkbenchCanvasRect[] {
  if (template.type === 'combination') {
    const nodeBounds = boundsOf(
      template.nodes.map((node) => ({
        id: node.templateNodeId,
        position: node.position,
        size: node.size
      }))
    )

    return [
      {
        id: template.id,
        position: {
          x: origin.x + nodeBounds.left - terminalGroupPadding.x,
          y: origin.y + nodeBounds.top - terminalGroupPadding.y
        },
        size: {
          width: Math.max(
            minimumTerminalGroupSize.width,
            nodeBounds.right - nodeBounds.left + terminalGroupPadding.x * 2
          ),
          height: Math.max(
            minimumTerminalGroupSize.height,
            nodeBounds.bottom - nodeBounds.top + terminalGroupPadding.y * 2
          )
        }
      }
    ]
  }

  return template.nodes.map((node) => ({
    id: node.templateNodeId,
    position: {
      x: origin.x + node.position.x,
      y: origin.y + node.position.y
    },
    size: node.size
  }))
}

export function resolveBlockTemplateBounds(
  template: BlockTemplateSnapshot,
  origin: WorkbenchNodePosition
): {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
} {
  const bounds = boundsOf(projectBlockTemplateRects(template, origin))
  return {
    x: bounds.left,
    y: bounds.top,
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top
  }
}

function isOriginAvailable(
  relativeRects: readonly WorkbenchCanvasRect[],
  origin: WorkbenchNodePosition,
  occupiedRects: readonly WorkbenchCanvasRect[]
): boolean {
  return relativeRects.every((relativeRect) =>
    occupiedRects.every((occupiedRect) =>
      haveRequiredGap(
        {
          ...relativeRect,
          position: {
            x: relativeRect.position.x + origin.x,
            y: relativeRect.position.y + origin.y
          }
        },
        occupiedRect
      )
    )
  )
}

function haveRequiredGap(left: WorkbenchCanvasRect, right: WorkbenchCanvasRect): boolean {
  return (
    left.position.x + left.size.width + workbenchNodePlacementGap <= right.position.x ||
    right.position.x + right.size.width + workbenchNodePlacementGap <= left.position.x ||
    left.position.y + left.size.height + workbenchNodePlacementGap <= right.position.y ||
    right.position.y + right.size.height + workbenchNodePlacementGap <= left.position.y
  )
}

function compareOrigins(
  left: WorkbenchNodePosition,
  right: WorkbenchNodePosition,
  desired: WorkbenchNodePosition
): number {
  const leftX = left.x - desired.x
  const leftY = left.y - desired.y
  const rightX = right.x - desired.x
  const rightY = right.y - desired.y

  return (
    leftX * leftX + leftY * leftY - (rightX * rightX + rightY * rightY) ||
    Math.abs(leftY) - Math.abs(rightY) ||
    directionRank(leftX) - directionRank(rightX) ||
    directionRank(leftY) - directionRank(rightY) ||
    left.y - right.y ||
    left.x - right.x
  )
}

function directionRank(offset: number): number {
  return offset >= 0 ? 0 : 1
}

function boundsOf(rects: readonly WorkbenchCanvasRect[]) {
  return rects.reduce(
    (bounds, rect) => ({
      left: Math.min(bounds.left, rect.position.x),
      top: Math.min(bounds.top, rect.position.y),
      right: Math.max(bounds.right, rect.position.x + rect.size.width),
      bottom: Math.max(bounds.bottom, rect.position.y + rect.size.height)
    }),
    {
      left: Number.POSITIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY
    }
  )
}
