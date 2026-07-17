import {
  createExpectedAppError,
  createUnexpectedAppError
} from '../../../../shared-kernel/application/errors/AppError'
import type {
  BlockGraphSnapshot,
  BlockPositionSnapshot,
  TerminalBlockSnapshot,
  TerminalGroupSnapshot
} from '../aggregates/BlockGraphTypes'
import { normalizeTerminalGroupBounds } from './TerminalGroupRules'
import { resolveStableTerminalLayoutUnitIds } from './TerminalLayoutUnitOrder'

const terminalLayoutGap = 64

export interface TerminalLayoutRegion {
  readonly position: BlockPositionSnapshot
  readonly size: { readonly width: number; readonly height: number }
}

export interface ArrangeTerminalLayoutInput {
  readonly anchorRegion: TerminalLayoutRegion
  readonly blockIds: readonly string[]
  readonly reservedRegions: readonly TerminalLayoutRegion[]
}

interface TerminalBlockLayout {
  readonly blockId: string
  readonly position: BlockPositionSnapshot
}

export interface TerminalLayoutPlan {
  readonly arrangedBlockIds: readonly string[]
  readonly arrangedTerminalGroupIds: readonly string[]
  readonly blockLayouts: readonly TerminalBlockLayout[]
  readonly graphChanged: boolean
}

export type TerminalLayoutResult = Omit<TerminalLayoutPlan, 'blockLayouts'>

interface PositionedRegion {
  readonly bottom: number
  readonly left: number
  readonly right: number
  readonly top: number
}

interface OffsetInterval {
  readonly end: number
  readonly start: number
}

interface TerminalLayoutUnit {
  readonly blockIds: readonly string[]
  readonly group?: TerminalGroupSnapshot
  readonly id: string
}

export function createTerminalLayoutPlan(
  graph: BlockGraphSnapshot,
  input: ArrangeTerminalLayoutInput
): TerminalLayoutPlan {
  const scopedBlocks = resolveScopedBlocks(graph, input.blockIds)
  const scopedBlockIds = new Set(scopedBlocks.map((block) => block.id))
  const scopedGroups = resolveScopedGroups(graph.terminalGroups, scopedBlockIds)
  const stableBlocksByLayer = groupBlocksByDependencyLayer(
    scopedBlocks,
    graph.connections ?? [],
    scopedBlockIds
  )
  const layoutUnits = createLayoutUnits(scopedBlocks, scopedGroups)
  const orderedLayoutUnits = resolveStableLayoutUnitOrder(stableBlocksByLayer, layoutUnits)
  const unitRankByBlockId = createLayoutUnitRankByBlockId(orderedLayoutUnits)
  const blocksByLayer = stableBlocksByLayer.map((layer) =>
    [...layer].sort(
      (left, right) =>
        requireUnitRank(unitRankByBlockId, left.id) -
          requireUnitRank(unitRankByBlockId, right.id) || compareStableBlockOrder(left, right)
    )
  )
  const baseLayouts = placeBlocksByLayer(blocksByLayer, input.anchorRegion)
  const blockLayouts = placeLayoutUnits(
    graph,
    baseLayouts,
    orderedLayoutUnits,
    createObstacleRegions(graph, input, scopedBlockIds, scopedGroups)
  )
  const currentBlocksById = new Map(graph.blocks.map((block) => [block.id, block]))

  return {
    arrangedBlockIds: blockLayouts.map((layout) => layout.blockId),
    arrangedTerminalGroupIds: scopedGroups.map((group) => group.id).sort(),
    blockLayouts,
    graphChanged: blockLayouts.some((layout) => {
      const currentPosition = currentBlocksById.get(layout.blockId)?.position

      return currentPosition?.x !== layout.position.x || currentPosition?.y !== layout.position.y
    })
  }
}

export function applyTerminalLayoutPlan(
  blocks: readonly TerminalBlockSnapshot[],
  plan: TerminalLayoutPlan
): TerminalBlockSnapshot[] {
  const layoutsByBlockId = new Map(
    plan.blockLayouts.map((layout) => [layout.blockId, layout.position])
  )

  return blocks.map((block) => {
    const position = layoutsByBlockId.get(block.id)

    return position ? { ...block, position } : block
  })
}

export function toTerminalLayoutResult(plan: TerminalLayoutPlan): TerminalLayoutResult {
  return {
    arrangedBlockIds: plan.arrangedBlockIds,
    arrangedTerminalGroupIds: plan.arrangedTerminalGroupIds,
    graphChanged: plan.graphChanged
  }
}

function resolveScopedBlocks(
  graph: BlockGraphSnapshot,
  requestedBlockIds: readonly string[]
): TerminalBlockSnapshot[] {
  const blockIds = Array.from(new Set(requestedBlockIds))

  if (blockIds.length === 0) {
    throw createExpectedAppError(
      'TERMINAL_LAYOUT_SCOPE_EMPTY',
      'Terminal layout scope cannot be empty.'
    )
  }

  const blocksById = new Map(graph.blocks.map((block) => [block.id, block]))

  return blockIds.map((blockId) => {
    const block = blocksById.get(blockId)

    if (!block) {
      throw createExpectedAppError('TERMINAL_BLOCK_NOT_FOUND', 'Terminal block was not found.')
    }

    return block
  })
}

function resolveScopedGroups(
  groups: readonly TerminalGroupSnapshot[],
  scopedBlockIds: ReadonlySet<string>
): TerminalGroupSnapshot[] {
  return groups.filter((group) => {
    const selectedMemberCount = group.memberBlockIds.filter((blockId) =>
      scopedBlockIds.has(blockId)
    ).length

    if (selectedMemberCount > 0 && selectedMemberCount < group.memberBlockIds.length) {
      throw createExpectedAppError(
        'TERMINAL_LAYOUT_PARTIAL_GROUP',
        'Terminal layout scope must contain every member of an included group.'
      )
    }

    return selectedMemberCount === group.memberBlockIds.length
  })
}

function groupBlocksByDependencyLayer(
  blocks: readonly TerminalBlockSnapshot[],
  connections: readonly {
    readonly sourceBlockId: string
    readonly targetBlockId: string
  }[],
  scopedBlockIds: ReadonlySet<string>
): TerminalBlockSnapshot[][] {
  const incomingByBlockId = new Map(blocks.map((block) => [block.id, [] as string[]]))

  for (const connection of connections) {
    if (
      scopedBlockIds.has(connection.sourceBlockId) &&
      scopedBlockIds.has(connection.targetBlockId)
    ) {
      incomingByBlockId.get(connection.targetBlockId)?.push(connection.sourceBlockId)
    }
  }

  const layerByBlockId = new Map<string, number>()
  const resolveLayer = (blockId: string, visiting: ReadonlySet<string>): number => {
    const knownLayer = layerByBlockId.get(blockId)
    if (knownLayer !== undefined) return knownLayer
    if (visiting.has(blockId)) return 0

    const nextVisiting = new Set(visiting).add(blockId)
    const incoming = incomingByBlockId.get(blockId) ?? []
    const layer = incoming.reduce(
      (maximum, sourceBlockId) => Math.max(maximum, resolveLayer(sourceBlockId, nextVisiting) + 1),
      0
    )
    layerByBlockId.set(blockId, layer)

    return layer
  }

  const layers: TerminalBlockSnapshot[][] = []

  for (const block of blocks) {
    const layer = resolveLayer(block.id, new Set())
    ;(layers[layer] ??= []).push(block)
  }

  return layers.map((layer) => [...layer].sort(compareStableBlockOrder))
}

function compareStableBlockOrder(
  left: TerminalBlockSnapshot,
  right: TerminalBlockSnapshot
): number {
  return (
    left.position.y - right.position.y ||
    left.position.x - right.position.x ||
    left.id.localeCompare(right.id)
  )
}

function placeBlocksByLayer(
  blocksByLayer: readonly (readonly TerminalBlockSnapshot[])[],
  anchorRegion: TerminalLayoutRegion
): TerminalBlockLayout[] {
  const layouts: TerminalBlockLayout[] = []
  let layerX = anchorRegion.position.x
  const originY = anchorRegion.position.y + anchorRegion.size.height + terminalLayoutGap

  for (const blocks of blocksByLayer) {
    let blockY = originY

    for (const block of blocks) {
      layouts.push({ blockId: block.id, position: { x: layerX, y: blockY } })
      blockY += block.size.height + terminalLayoutGap
    }

    const layerWidth = Math.max(...blocks.map((block) => block.size.width))
    layerX += layerWidth + terminalLayoutGap
  }

  return layouts
}

function placeLayoutUnits(
  graph: BlockGraphSnapshot,
  baseLayouts: readonly TerminalBlockLayout[],
  units: readonly TerminalLayoutUnit[],
  externalObstacles: readonly PositionedRegion[]
): TerminalBlockLayout[] {
  const baseLayoutsByBlockId = new Map(
    baseLayouts.map((layout) => [layout.blockId, layout] as const)
  )
  const occupiedRegions = [...externalObstacles]
  const precedingUnitRegions: PositionedRegion[] = []
  const positionedLayoutsByBlockId = new Map<string, TerminalBlockLayout>()

  for (const unit of units) {
    const baseUnitLayouts = unit.blockIds.map((blockId) =>
      requireLayout(baseLayoutsByBlockId, blockId)
    )
    const baseUnitRegion = createLayoutUnitRegion(graph, unit, baseUnitLayouts)
    const verticalOffset = resolveObstacleOffset(
      [baseUnitRegion],
      occupiedRegions,
      resolvePrecedingUnitOffset(baseUnitRegion, precedingUnitRegions)
    )
    const positionedLayouts = baseUnitLayouts.map((layout) => ({
      ...layout,
      position: {
        x: layout.position.x,
        y: layout.position.y + verticalOffset
      }
    }))

    for (const layout of positionedLayouts) {
      positionedLayoutsByBlockId.set(layout.blockId, layout)
    }
    const positionedUnitRegion = createLayoutUnitRegion(graph, unit, positionedLayouts)
    occupiedRegions.push(positionedUnitRegion)
    precedingUnitRegions.push(positionedUnitRegion)
  }

  return baseLayouts.map((layout) => requireLayout(positionedLayoutsByBlockId, layout.blockId))
}

function createLayoutUnits(
  scopedBlocks: readonly TerminalBlockSnapshot[],
  scopedGroups: readonly TerminalGroupSnapshot[]
): TerminalLayoutUnit[] {
  const groupedBlockIds = new Set(scopedGroups.flatMap((group) => [...group.memberBlockIds]))

  return [
    ...scopedGroups.map((group) => ({
      blockIds: [...group.memberBlockIds],
      group,
      id: `group:${group.id}`
    })),
    ...scopedBlocks
      .filter((block) => !groupedBlockIds.has(block.id))
      .map((block) => ({ blockIds: [block.id], id: `block:${block.id}` }))
  ]
}

function resolveStableLayoutUnitOrder(
  blocksByLayer: readonly (readonly TerminalBlockSnapshot[])[],
  units: readonly TerminalLayoutUnit[]
): TerminalLayoutUnit[] {
  const unitById = new Map(units.map((unit) => [unit.id, unit] as const))
  const unitIdByBlockId = new Map(
    units.flatMap((unit) => unit.blockIds.map((blockId) => [blockId, unit.id] as const))
  )
  const orderedUnitIds = resolveStableTerminalLayoutUnitIds(
    [...unitById.keys()],
    blocksByLayer.map((layer) =>
      layer.map((block) => requireLayoutUnitId(unitIdByBlockId, block.id))
    )
  )

  return orderedUnitIds.map((unitId) => requireLayoutUnit(unitById, unitId))
}

function createLayoutUnitRankByBlockId(
  orderedUnits: readonly TerminalLayoutUnit[]
): ReadonlyMap<string, number> {
  return new Map(
    orderedUnits.flatMap((unit, rank) => unit.blockIds.map((blockId) => [blockId, rank] as const))
  )
}

function requireLayoutUnitId(
  unitIdByBlockId: ReadonlyMap<string, string>,
  blockId: string
): string {
  const unitId = unitIdByBlockId.get(blockId)

  if (!unitId) {
    throw createExpectedAppError('TERMINAL_BLOCK_NOT_FOUND', 'Terminal block was not found.')
  }

  return unitId
}

function requireLayoutUnit(
  unitsById: ReadonlyMap<string, TerminalLayoutUnit>,
  unitId: string
): TerminalLayoutUnit {
  const unit = unitsById.get(unitId)

  if (!unit) {
    throw createUnexpectedAppError('Terminal layout unit ordering is inconsistent.', { unitId })
  }

  return unit
}

function requireUnitRank(unitRankByBlockId: ReadonlyMap<string, number>, blockId: string): number {
  const rank = unitRankByBlockId.get(blockId)

  if (rank === undefined) {
    throw createExpectedAppError('TERMINAL_BLOCK_NOT_FOUND', 'Terminal block was not found.')
  }

  return rank
}

function createLayoutUnitRegion(
  graph: BlockGraphSnapshot,
  unit: TerminalLayoutUnit,
  layouts: readonly TerminalBlockLayout[]
): PositionedRegion {
  const positionsByBlockId = new Map(
    layouts.map((layout) => [layout.blockId, layout.position] as const)
  )
  const blocks = unit.blockIds.map((blockId) => {
    const block = graph.blocks.find((candidate) => candidate.id === blockId)

    if (!block) {
      throw createExpectedAppError('TERMINAL_BLOCK_NOT_FOUND', 'Terminal block was not found.')
    }

    return { ...block, position: positionsByBlockId.get(blockId) ?? block.position }
  })

  return unit.group
    ? toPositionedRegion(normalizeTerminalGroupBounds(unit.group, blocks))
    : toPositionedRegion(blocks[0])
}

function requireLayout(
  layoutsByBlockId: ReadonlyMap<string, TerminalBlockLayout>,
  blockId: string
): TerminalBlockLayout {
  const layout = layoutsByBlockId.get(blockId)

  if (!layout) {
    throw createExpectedAppError('TERMINAL_BLOCK_NOT_FOUND', 'Terminal block was not found.')
  }

  return layout
}

function createObstacleRegions(
  graph: BlockGraphSnapshot,
  input: ArrangeTerminalLayoutInput,
  scopedBlockIds: ReadonlySet<string>,
  scopedGroups: readonly TerminalGroupSnapshot[]
): PositionedRegion[] {
  const scopedGroupIds = new Set(scopedGroups.map((group) => group.id))

  return [
    toPositionedRegion(input.anchorRegion),
    ...input.reservedRegions.map(toPositionedRegion),
    ...graph.blocks.filter((block) => !scopedBlockIds.has(block.id)).map(toPositionedRegion),
    ...graph.terminalGroups.filter((group) => !scopedGroupIds.has(group.id)).map(toPositionedRegion)
  ]
}

function resolveObstacleOffset(
  movingRegions: readonly PositionedRegion[],
  obstacleRegions: readonly PositionedRegion[],
  minimumOffset = 0
): number {
  const forbiddenOffsets: OffsetInterval[] = []

  for (const movingRegion of movingRegions) {
    for (const obstacleRegion of obstacleRegions) {
      if (!horizontallyOverlapsWithGap(movingRegion, obstacleRegion)) continue

      forbiddenOffsets.push({
        start: obstacleRegion.top - terminalLayoutGap - movingRegion.bottom,
        end: obstacleRegion.bottom + terminalLayoutGap - movingRegion.top
      })
    }
  }

  forbiddenOffsets.sort((left, right) => left.start - right.start || left.end - right.end)

  let offset = minimumOffset

  for (const interval of forbiddenOffsets) {
    if (offset <= interval.start) break
    if (offset < interval.end) offset = interval.end
  }

  return offset
}

function resolvePrecedingUnitOffset(
  movingRegion: PositionedRegion,
  precedingUnitRegions: readonly PositionedRegion[]
): number {
  return precedingUnitRegions.reduce(
    (minimumOffset, precedingRegion) =>
      horizontallyOverlapsWithGap(movingRegion, precedingRegion)
        ? Math.max(minimumOffset, precedingRegion.bottom + terminalLayoutGap - movingRegion.top)
        : minimumOffset,
    0
  )
}

function horizontallyOverlapsWithGap(left: PositionedRegion, right: PositionedRegion): boolean {
  return left.left < right.right + terminalLayoutGap && left.right > right.left - terminalLayoutGap
}

function toPositionedRegion(region: TerminalLayoutRegion): PositionedRegion {
  return {
    bottom: region.position.y + region.size.height,
    left: region.position.x,
    right: region.position.x + region.size.width,
    top: region.position.y
  }
}
