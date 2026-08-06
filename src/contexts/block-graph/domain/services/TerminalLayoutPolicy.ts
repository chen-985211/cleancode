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
import { resolveTerminalCanvasPlacement } from './TerminalCanvasPlacementPolicy'
import { resolveStableTerminalLayoutUnitIds } from './TerminalLayoutUnitOrder'
import {
  selectBalancedTerminalExecutionUnitPacking,
  sumWithGap,
  terminalLayoutGap,
  type TerminalBlockLayout,
  type TerminalExecutionUnitLayout
} from './TerminalExecutionUnitPacking'

export interface TerminalLayoutRegion {
  readonly position: BlockPositionSnapshot
  readonly size: { readonly width: number; readonly height: number }
}

export interface ArrangeTerminalLayoutInput {
  readonly blockIds: readonly string[]
  readonly canvasRegions: readonly TerminalLayoutRegion[]
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
  const layoutUnits = createLayoutUnits(
    scopedBlocks,
    scopedGroups,
    graph.connections ?? [],
    scopedBlockIds
  )
  const orderedLayoutUnits = resolveStableLayoutUnitOrder(layoutUnits)
  const unitRankByBlockId = createLayoutUnitRankByBlockId(orderedLayoutUnits)
  const blocksByLayer = stableBlocksByLayer.map((layer) =>
    [...layer].sort(
      (left, right) =>
        requireUnitRank(unitRankByBlockId, left.id) -
          requireUnitRank(unitRankByBlockId, right.id) || compareStableBlockOrder(left, right)
    )
  )
  const baseLayouts = placeTerminalExecutionUnits(
    scopedBlocks,
    graph.connections ?? [],
    scopedBlockIds
  )
  const internallySpacedLayouts = spaceLayoutUnits(graph, baseLayouts, orderedLayoutUnits)
  const layoutRegion = mergePositionedRegions(
    orderedLayoutUnits.map((unit) => createLayoutUnitRegion(graph, unit, internallySpacedLayouts))
  )
  const placement = resolveTerminalCanvasPlacement(
    layoutRegion,
    createObstacleRegions(graph, input, scopedBlockIds, scopedGroups),
    terminalLayoutGap
  )
  const positionedLayouts = internallySpacedLayouts.map((layout) => ({
    ...layout,
    position: {
      x: layout.position.x + placement.x,
      y: layout.position.y + placement.y
    }
  }))
  const positionedLayoutsByBlockId = new Map(
    positionedLayouts.map((layout) => [layout.blockId, layout] as const)
  )
  const blockLayouts = blocksByLayer
    .flat()
    .map((block) => requireLayout(positionedLayoutsByBlockId, block.id))
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

export function applyTerminalGroupLayoutPlan(
  groups: readonly TerminalGroupSnapshot[],
  previousBlocks: readonly TerminalBlockSnapshot[],
  nextBlocks: readonly TerminalBlockSnapshot[],
  plan: TerminalLayoutPlan
): TerminalGroupSnapshot[] {
  const arrangedGroupIds = new Set(plan.arrangedTerminalGroupIds)
  const previousBlocksById = new Map(previousBlocks.map((block) => [block.id, block]))
  const nextBlocksById = new Map(nextBlocks.map((block) => [block.id, block]))

  return groups.map((group) => {
    if (!arrangedGroupIds.has(group.id) || group.memberBlockIds.length === 0) return group
    const anchorId = group.memberBlockIds[0]!
    const previousAnchor = previousBlocksById.get(anchorId)
    const nextAnchor = nextBlocksById.get(anchorId)
    if (!previousAnchor || !nextAnchor) return group

    return normalizeTerminalGroupBounds(
      {
        ...group,
        position: {
          x: group.position.x + nextAnchor.position.x - previousAnchor.position.x,
          y: group.position.y + nextAnchor.position.y - previousAnchor.position.y
        }
      },
      nextBlocks
    )
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
    if (group.memberBlockIds.length === 0) return false
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

function placeTerminalExecutionUnits(
  blocks: readonly TerminalBlockSnapshot[],
  connections: readonly {
    readonly sourceBlockId: string
    readonly targetBlockId: string
  }[],
  scopedBlockIds: ReadonlySet<string>
): TerminalBlockLayout[] {
  const executionUnits = resolveWeaklyConnectedTerminalUnits(
    blocks,
    connections,
    scopedBlockIds
  ).map((unitBlocks) => createTerminalExecutionUnitLayout(unitBlocks, connections))
  const packedUnits = selectBalancedTerminalExecutionUnitPacking(executionUnits)

  return [...packedUnits.blockLayouts]
}

function resolveWeaklyConnectedTerminalUnits(
  blocks: readonly TerminalBlockSnapshot[],
  connections: readonly {
    readonly sourceBlockId: string
    readonly targetBlockId: string
  }[],
  scopedBlockIds: ReadonlySet<string>
): TerminalBlockSnapshot[][] {
  const blocksById = new Map(blocks.map((block) => [block.id, block] as const))
  const adjacentBlockIds = new Map(blocks.map((block) => [block.id, new Set<string>()] as const))

  for (const connection of connections) {
    if (
      !scopedBlockIds.has(connection.sourceBlockId) ||
      !scopedBlockIds.has(connection.targetBlockId)
    ) {
      continue
    }
    adjacentBlockIds.get(connection.sourceBlockId)?.add(connection.targetBlockId)
    adjacentBlockIds.get(connection.targetBlockId)?.add(connection.sourceBlockId)
  }

  const visitedBlockIds = new Set<string>()
  const units: TerminalBlockSnapshot[][] = []

  const inputOrderByBlockId = new Map(blocks.map((block, index) => [block.id, index] as const))

  for (const seed of blocks) {
    if (visitedBlockIds.has(seed.id)) continue
    const pendingBlockIds = [seed.id]
    const unitBlocks: TerminalBlockSnapshot[] = []
    visitedBlockIds.add(seed.id)

    while (pendingBlockIds.length > 0) {
      const blockId = pendingBlockIds.shift()!
      const block = blocksById.get(blockId)
      if (block) unitBlocks.push(block)

      for (const adjacentBlockId of [...(adjacentBlockIds.get(blockId) ?? [])].sort(
        (left, right) =>
          requireBlockOrder(inputOrderByBlockId, left) -
            requireBlockOrder(inputOrderByBlockId, right) || left.localeCompare(right)
      )) {
        if (visitedBlockIds.has(adjacentBlockId)) continue
        visitedBlockIds.add(adjacentBlockId)
        pendingBlockIds.push(adjacentBlockId)
      }
    }
    units.push(unitBlocks.sort(compareStableBlockOrder))
  }

  return units
}

function createTerminalExecutionUnitLayout(
  blocks: readonly TerminalBlockSnapshot[],
  connections: readonly {
    readonly sourceBlockId: string
    readonly targetBlockId: string
  }[]
): TerminalExecutionUnitLayout {
  const blockIds = new Set(blocks.map((block) => block.id))
  const blocksByLayer = groupBlocksByDependencyLayer(blocks, connections, blockIds)
  const layerWidths = blocksByLayer.map((layer) =>
    Math.max(...layer.map((block) => block.size.width))
  )
  const layerHeights = blocksByLayer.map((layer) =>
    sumWithGap(
      layer.map((block) => block.size.height),
      terminalLayoutGap
    )
  )
  const height = Math.max(...layerHeights)
  const blockLayouts: TerminalBlockLayout[] = []
  let layerX = 0

  for (const [layerIndex, layer] of blocksByLayer.entries()) {
    let blockY = Math.round((height - layerHeights[layerIndex]!) / 2)

    for (const block of layer) {
      blockLayouts.push({ blockId: block.id, position: { x: layerX, y: blockY } })
      blockY += block.size.height + terminalLayoutGap
    }
    layerX += layerWidths[layerIndex]! + terminalLayoutGap
  }

  return {
    blockLayouts,
    height,
    width: sumWithGap(layerWidths, terminalLayoutGap)
  }
}

function spaceLayoutUnits(
  graph: BlockGraphSnapshot,
  baseLayouts: readonly TerminalBlockLayout[],
  units: readonly TerminalLayoutUnit[]
): TerminalBlockLayout[] {
  const baseLayoutsByBlockId = new Map(
    baseLayouts.map((layout) => [layout.blockId, layout] as const)
  )
  const occupiedRegions: PositionedRegion[] = []
  const positionedLayoutsByBlockId = new Map<string, TerminalBlockLayout>()

  for (const unit of units) {
    const baseUnitLayouts = unit.blockIds.map((blockId) =>
      requireLayout(baseLayoutsByBlockId, blockId)
    )
    const baseUnitRegion = createLayoutUnitRegion(graph, unit, baseUnitLayouts)
    const verticalOffset = resolveObstacleOffset([baseUnitRegion], occupiedRegions)
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
  }

  return baseLayouts.map((layout) => requireLayout(positionedLayoutsByBlockId, layout.blockId))
}

function createLayoutUnits(
  scopedBlocks: readonly TerminalBlockSnapshot[],
  scopedGroups: readonly TerminalGroupSnapshot[],
  connections: readonly {
    readonly sourceBlockId: string
    readonly targetBlockId: string
  }[],
  scopedBlockIds: ReadonlySet<string>
): TerminalLayoutUnit[] {
  const groupedBlockIds = new Set(scopedGroups.flatMap((group) => [...group.memberBlockIds]))
  const ungroupedBlocks = scopedBlocks.filter((block) => !groupedBlockIds.has(block.id))
  const ungroupedBlockIds = new Set(ungroupedBlocks.map((block) => block.id))

  return [
    ...scopedGroups.map((group) => ({
      blockIds: [...group.memberBlockIds],
      group,
      id: `group:${group.id}`
    })),
    ...resolveWeaklyConnectedTerminalUnits(
      ungroupedBlocks,
      connections,
      new Set([...scopedBlockIds].filter((blockId) => ungroupedBlockIds.has(blockId)))
    ).map((blocks) => {
      const blockIds = blocks.map((block) => block.id)

      return {
        blockIds,
        id: `blocks:${[...blockIds].sort().join(',')}`
      }
    })
  ]
}

function createLayoutUnitRankByBlockId(
  orderedUnits: readonly TerminalLayoutUnit[]
): ReadonlyMap<string, number> {
  return new Map(
    orderedUnits.flatMap((unit, rank) => unit.blockIds.map((blockId) => [blockId, rank] as const))
  )
}

function resolveStableLayoutUnitOrder(units: readonly TerminalLayoutUnit[]): TerminalLayoutUnit[] {
  const unitsById = new Map(units.map((unit) => [unit.id, unit] as const))
  const stableUnitIds = [...unitsById.keys()]
  const orderedUnitIds = resolveStableTerminalLayoutUnitIds(stableUnitIds, [stableUnitIds])

  return orderedUnitIds.map((unitId) => requireLayoutUnit(unitsById, unitId))
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

function requireBlockOrder(orderByBlockId: ReadonlyMap<string, number>, blockId: string): number {
  const order = orderByBlockId.get(blockId)

  if (order === undefined) {
    throw createUnexpectedAppError('Terminal execution unit ordering is inconsistent.', {
      blockId
    })
  }

  return order
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

  if (!unit.group) return mergePositionedRegions(blocks.map(toPositionedRegion))

  const anchorId = unit.group.memberBlockIds[0]
  const previousAnchor = graph.blocks.find((block) => block.id === anchorId)
  const nextAnchor = blocks.find((block) => block.id === anchorId)
  const positionedGroup =
    previousAnchor && nextAnchor
      ? {
          ...unit.group,
          position: {
            x: unit.group.position.x + nextAnchor.position.x - previousAnchor.position.x,
            y: unit.group.position.y + nextAnchor.position.y - previousAnchor.position.y
          }
        }
      : unit.group

  return toPositionedRegion(normalizeTerminalGroupBounds(positionedGroup, blocks))
}

function mergePositionedRegions(regions: readonly PositionedRegion[]): PositionedRegion {
  return regions.reduce(
    (bounds, region) => ({
      bottom: Math.max(bounds.bottom, region.bottom),
      left: Math.min(bounds.left, region.left),
      right: Math.max(bounds.right, region.right),
      top: Math.min(bounds.top, region.top)
    }),
    {
      bottom: Number.NEGATIVE_INFINITY,
      left: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      top: Number.POSITIVE_INFINITY
    }
  )
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
  const obstacleGroups = graph.terminalGroups.filter((group) => !scopedGroupIds.has(group.id))
  const groupedObstacleBlockIds = new Set(
    obstacleGroups.flatMap((group) => [...group.memberBlockIds])
  )

  return [
    ...input.canvasRegions.map(toPositionedRegion),
    ...graph.blocks
      .filter((block) => !scopedBlockIds.has(block.id) && !groupedObstacleBlockIds.has(block.id))
      .map(toPositionedRegion),
    ...obstacleGroups.map(toPositionedRegion)
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
