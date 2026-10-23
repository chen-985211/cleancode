import { createUnexpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import { terminalBlockVisibleSize, type TerminalBlockSnapshot } from '../aggregates/BlockGraphTypes'
import {
  terminalLayoutGap,
  sumWithGap,
  type TerminalBlockLayout,
  type TerminalExecutionUnitLayout
} from './TerminalExecutionUnitPacking'

export function groupBlocksByDependencyLayer(
  blocks: readonly TerminalBlockSnapshot[],
  connections: readonly {
    readonly sourceBlockId: string
    readonly targetBlockId: string
  }[],
  scopedBlockIds: ReadonlySet<string>,
  preserveInputOrder = false
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

  return preserveInputOrder
    ? layers
    : layers.map((layer) => [...layer].sort(compareStableBlockOrder))
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

// Disclosure keeps each execution unit on its own row. Unlike canvas arrangement,
// row anchors and dependency layers never recenter when one terminal changes size.
export function createTerminalFlowRowLayouts(
  blocks: readonly TerminalBlockSnapshot[],
  connections: readonly { readonly sourceBlockId: string; readonly targetBlockId: string }[]
): readonly TerminalBlockLayout[] {
  const units = resolveWeaklyConnectedTerminalUnits(
    blocks,
    connections,
    new Set(blocks.map((block) => block.id))
  )
  let rowY = 0
  return units.flatMap((members) => {
    const memberIds = new Set(members.map((block) => block.id))
    const unit = createTerminalExecutionUnitLayout(
      blocks.filter((block) => memberIds.has(block.id)),
      connections,
      'top'
    )
    const layouts = unit.blockLayouts.map((layout) => ({
      ...layout,
      position: { x: layout.position.x, y: rowY + layout.position.y }
    }))
    rowY += unit.height + terminalLayoutGap
    return layouts
  })
}

export function resolveWeaklyConnectedTerminalUnits(
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

export function createTerminalExecutionUnitLayout(
  blocks: readonly TerminalBlockSnapshot[],
  connections: readonly {
    readonly sourceBlockId: string
    readonly targetBlockId: string
  }[],
  alignment: 'center' | 'top' = 'center'
): TerminalExecutionUnitLayout {
  const blockIds = new Set(blocks.map((block) => block.id))
  const blocksByLayer = groupBlocksByDependencyLayer(
    blocks,
    connections,
    blockIds,
    alignment === 'top'
  )
  const layerWidths = blocksByLayer.map((layer) =>
    Math.max(...layer.map((block) => terminalBlockVisibleSize(block).width))
  )
  const layerHeights = blocksByLayer.map((layer) =>
    sumWithGap(
      layer.map((block) => terminalBlockVisibleSize(block).height),
      terminalLayoutGap
    )
  )
  const height = Math.max(...layerHeights)
  const blockLayouts: TerminalBlockLayout[] = []
  let layerX = 0

  for (const [layerIndex, layer] of blocksByLayer.entries()) {
    let blockY = alignment === 'top' ? 0 : Math.round((height - layerHeights[layerIndex]!) / 2)

    for (const block of layer) {
      blockLayouts.push({ blockId: block.id, position: { x: layerX, y: blockY } })
      blockY += terminalBlockVisibleSize(block).height + terminalLayoutGap
    }
    layerX += layerWidths[layerIndex]! + terminalLayoutGap
  }

  return {
    blockLayouts,
    height,
    width: sumWithGap(layerWidths, terminalLayoutGap)
  }
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
