import type { BlockTemplateSnapshot } from '../../contexts/block-graph/application/dto/BlockTemplateSnapshot'
import {
  projectBlockTemplateRects,
  resolveBlockTemplateBounds
} from '../../contexts/block-graph/presentation/view-models/blockTemplateGeometry'
import {
  workbenchNodePlacementGap,
  type WorkbenchCanvasRect,
  type WorkbenchNodePosition
} from './workbenchNodeCreationPolicy'

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
  const footprintBounds = resolveBlockTemplateBounds(template, { x: 0, y: 0 })
  const desiredOrigin = {
    x: desiredCenter.x - (footprintBounds.x + footprintBounds.width / 2),
    y: desiredCenter.y - (footprintBounds.y + footprintBounds.height / 2)
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
