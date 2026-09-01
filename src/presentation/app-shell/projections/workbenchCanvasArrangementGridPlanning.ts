import type { BlockGraphSnapshot } from '../../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { createBalancedTerminalBlockLayouts } from '../../../contexts/block-graph/domain/services/TerminalLayoutPolicy'
import {
  createGridCanvasLayout,
  type CanvasArrangementLayout,
  type CanvasArrangementLayoutItem
} from '../../../contexts/canvas-arrangement/domain/services/CanvasArrangementLayoutPolicy'
import type { CanvasArrangementSelectionItem } from '../../../contexts/canvas-arrangement/presentation/view-models/canvasArrangementSelection'

interface Position {
  readonly x: number
  readonly y: number
}

interface PlannedGridItem {
  readonly item: CanvasArrangementSelectionItem
  readonly layoutItem: CanvasArrangementLayoutItem
  readonly nodeOffsets: ReadonlyMap<string, Position>
}

export interface CanvasArrangementGridPlan {
  readonly layouts: readonly CanvasArrangementLayout[]
  readonly nodePositionsById: ReadonlyMap<string, Position>
}

export function createCanvasArrangementGridPlan(
  items: readonly CanvasArrangementSelectionItem[],
  graph: BlockGraphSnapshot
): CanvasArrangementGridPlan {
  const plannedItems = items.map((item) => createPlannedGridItem(item, graph))
  const centeredLayoutItems = centerPlannedItemsAtOriginalSelection(plannedItems, items)
  const layoutPlan = createGridCanvasLayout(centeredLayoutItems)
  const targetByKey = new Map(layoutPlan.layouts.map((layout) => [layout.key, layout.position]))
  const nodePositionsById = new Map<string, Position>()

  for (const plannedItem of plannedItems) {
    const target = targetByKey.get(plannedItem.item.key)
    if (!target) continue
    plannedItem.nodeOffsets.forEach((offset, nodeId) => {
      nodePositionsById.set(nodeId, {
        x: target.x + offset.x,
        y: target.y + offset.y
      })
    })
  }

  return { layouts: layoutPlan.layouts, nodePositionsById }
}

function createPlannedGridItem(
  item: CanvasArrangementSelectionItem,
  graph: BlockGraphSnapshot
): PlannedGridItem {
  if (item.reference.kind !== 'workflow') {
    return { item, layoutItem: item, nodeOffsets: new Map() }
  }

  const blocksById = new Map(graph.blocks.map((block) => [block.id, block] as const))
  const blocks = item.reference.terminalIds
    .map((terminalId) => blocksById.get(terminalId))
    .filter((block): block is NonNullable<typeof block> => Boolean(block))
  if (blocks.length !== item.reference.terminalIds.length) {
    return { item, layoutItem: item, nodeOffsets: new Map() }
  }

  const layouts = createBalancedTerminalBlockLayouts(blocks, graph.connections ?? [])
  const sizesById = new Map(blocks.map((block) => [block.id, block.size] as const))
  const left = Math.min(...layouts.map((layout) => layout.position.x))
  const top = Math.min(...layouts.map((layout) => layout.position.y))
  const right = Math.max(
    ...layouts.map((layout) => layout.position.x + sizesById.get(layout.blockId)!.width)
  )
  const bottom = Math.max(
    ...layouts.map((layout) => layout.position.y + sizesById.get(layout.blockId)!.height)
  )
  const nodeOffsets = new Map(
    layouts.map((layout) => [
      layout.blockId,
      { x: layout.position.x - left, y: layout.position.y - top }
    ])
  )

  return {
    item,
    layoutItem: {
      key: item.key,
      position: item.position,
      size: { height: bottom - top, width: right - left }
    },
    nodeOffsets
  }
}

function centerPlannedItemsAtOriginalSelection(
  plannedItems: readonly PlannedGridItem[],
  originalItems: readonly CanvasArrangementSelectionItem[]
): CanvasArrangementLayoutItem[] {
  const originalCenter = selectionCenter(originalItems)
  const plannedCenter = selectionCenter(plannedItems.map(({ layoutItem }) => layoutItem))
  const delta = {
    x: originalCenter.x - plannedCenter.x,
    y: originalCenter.y - plannedCenter.y
  }

  return plannedItems.map(({ layoutItem }) => ({
    ...layoutItem,
    position: {
      x: layoutItem.position.x + delta.x,
      y: layoutItem.position.y + delta.y
    }
  }))
}

function selectionCenter(items: readonly CanvasArrangementLayoutItem[]): Position {
  const left = Math.min(...items.map((item) => item.position.x))
  const top = Math.min(...items.map((item) => item.position.y))
  const right = Math.max(...items.map((item) => item.position.x + item.size.width))
  const bottom = Math.max(...items.map((item) => item.position.y + item.size.height))
  return { x: (left + right) / 2, y: (top + bottom) / 2 }
}
