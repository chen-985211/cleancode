import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type {
  BlockGraphSnapshot,
  TerminalBlockSnapshot,
  TerminalGroupSnapshot
} from '../aggregates/BlockGraphTypes'
import {
  resolveTerminalCanvasPlacement,
  terminalCanvasRegionsOverlapWithGap,
  type TerminalCanvasPlacementRegion
} from './TerminalCanvasPlacementPolicy'
import { defaultTerminalGroupSize } from './TerminalGroupRules'
import { terminalLayoutGap } from './TerminalExecutionUnitPacking'
import type { TerminalLayoutRegion } from './TerminalLayoutPolicy'

interface AssertTerminalGroupMembershipMoveFitsCanvasInput {
  readonly after: BlockGraphSnapshot
  readonly before: BlockGraphSnapshot
  readonly canvasRegions: readonly TerminalLayoutRegion[]
  readonly targetTerminalGroupId: string | null
}

export function resolveEmptyTerminalGroupCanvasPosition(
  graph: BlockGraphSnapshot,
  canvasRegions: readonly TerminalLayoutRegion[]
): { readonly x: number; readonly y: number } {
  const target = toPositionedRegion({
    position: { x: 0, y: 0 },
    size: defaultTerminalGroupSize
  })
  const placement = resolveTerminalCanvasPlacement(
    target,
    createTopLevelObstacleRegions(graph, canvasRegions),
    terminalLayoutGap
  )

  return { x: placement.x, y: placement.y }
}

export function assertTerminalGroupMembershipMoveFitsCanvas({
  after,
  before,
  canvasRegions,
  targetTerminalGroupId
}: AssertTerminalGroupMembershipMoveFitsCanvasInput): void {
  const membershipBefore = indexTerminalGroupMembership(before.terminalGroups)
  const membershipAfter = indexTerminalGroupMembership(after.terminalGroups)
  const movedBlockIds = new Set(
    after.blocks
      .filter(
        (block) =>
          (membershipBefore.get(block.id) ?? null) !== (membershipAfter.get(block.id) ?? null)
      )
      .map((block) => block.id)
  )
  if (movedBlockIds.size === 0) return

  const movingRegions = targetTerminalGroupId
    ? after.terminalGroups
        .filter((group) => group.id === targetTerminalGroupId)
        .map(toPositionedRegion)
    : after.blocks.filter((block) => movedBlockIds.has(block.id)).map(toPositionedRegion)
  const obstacleRegions = createMembershipMoveObstacleRegions(
    after,
    canvasRegions,
    movedBlockIds,
    targetTerminalGroupId
  )
  const hasConflict = movingRegions.some((movingRegion) =>
    obstacleRegions.some((obstacleRegion) =>
      terminalCanvasRegionsOverlapWithGap(movingRegion, obstacleRegion, terminalLayoutGap)
    )
  )

  if (hasConflict) {
    throw createExpectedAppError(
      'TERMINAL_GROUP_LAYOUT_CONFLICT',
      'The terminal workflow would overlap another canvas object at the requested group anchor.',
      { targetTerminalGroupId }
    )
  }
}

function createMembershipMoveObstacleRegions(
  graph: BlockGraphSnapshot,
  canvasRegions: readonly TerminalLayoutRegion[],
  movedBlockIds: ReadonlySet<string>,
  targetTerminalGroupId: string | null
): TerminalCanvasPlacementRegion[] {
  const obstacleGroups = graph.terminalGroups.filter((group) => group.id !== targetTerminalGroupId)
  const groupedObstacleBlockIds = new Set(
    obstacleGroups.flatMap((group) => [...group.memberBlockIds])
  )
  const targetMemberBlockIds = new Set(
    graph.terminalGroups.find((group) => group.id === targetTerminalGroupId)?.memberBlockIds ?? []
  )

  return [
    ...canvasRegions.map(toPositionedRegion),
    ...graph.blocks
      .filter(
        (block) =>
          !movedBlockIds.has(block.id) &&
          !groupedObstacleBlockIds.has(block.id) &&
          !targetMemberBlockIds.has(block.id)
      )
      .map(toPositionedRegion),
    ...obstacleGroups.map(toPositionedRegion)
  ]
}

function createTopLevelObstacleRegions(
  graph: BlockGraphSnapshot,
  canvasRegions: readonly TerminalLayoutRegion[]
): TerminalCanvasPlacementRegion[] {
  const groupedBlockIds = new Set(
    graph.terminalGroups.flatMap((group) => [...group.memberBlockIds])
  )

  return [
    ...canvasRegions.map(toPositionedRegion),
    ...graph.blocks.filter((block) => !groupedBlockIds.has(block.id)).map(toPositionedRegion),
    ...graph.terminalGroups.map(toPositionedRegion)
  ]
}

function indexTerminalGroupMembership(
  groups: readonly TerminalGroupSnapshot[]
): ReadonlyMap<string, string> {
  return new Map(
    groups.flatMap((group) => group.memberBlockIds.map((blockId) => [blockId, group.id] as const))
  )
}

function toPositionedRegion(
  item: TerminalLayoutRegion | TerminalBlockSnapshot | TerminalGroupSnapshot
): TerminalCanvasPlacementRegion {
  return {
    bottom: item.position.y + item.size.height,
    left: item.position.x,
    right: item.position.x + item.size.width,
    top: item.position.y
  }
}
