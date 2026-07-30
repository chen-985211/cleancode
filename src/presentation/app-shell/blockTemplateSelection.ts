import type { BlockGraphSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { ShortcutPlatform } from './applicationShortcuts'
import { createCollapsedTerminalGroupSize } from './terminalFlowNodes'

export interface BlockTemplateSelectionRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

interface BlockTemplateSelectionModifier {
  readonly ctrlKey: boolean
  readonly metaKey: boolean
}

export function isBlockTemplateSelectionModifier(
  modifier: BlockTemplateSelectionModifier,
  platform: ShortcutPlatform
): boolean {
  return platform === 'mac' ? modifier.metaKey : modifier.ctrlKey
}

export function resolveBlockTemplateSelectionBlockIds({
  graph,
  selection
}: {
  readonly graph: BlockGraphSnapshot
  readonly selection: BlockTemplateSelectionRect
}): string[] {
  const normalizedSelection = normalizeRect(selection)
  const selectedBlockIds = new Set(
    graph.blocks
      .filter((block) =>
        containsRect(normalizedSelection, {
          x: block.position.x,
          y: block.position.y,
          width: block.size.width,
          height: block.size.height
        })
      )
      .map((block) => block.id)
  )

  for (const group of graph.terminalGroups) {
    const groupSize = group.isCollapsed
      ? createCollapsedTerminalGroupSize(group.memberBlockIds.length)
      : group.size
    if (
      group.isCollapsed &&
      containsRect(normalizedSelection, {
        x: group.position.x,
        y: group.position.y,
        width: groupSize.width,
        height: groupSize.height
      })
    ) {
      for (const blockId of group.memberBlockIds) {
        selectedBlockIds.add(blockId)
      }
    }
  }

  return graph.blocks.map((block) => block.id).filter((blockId) => selectedBlockIds.has(blockId))
}

export function normalizeBlockTemplateSelectionRect(
  start: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number }
): BlockTemplateSelectionRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  }
}

function normalizeRect(rect: BlockTemplateSelectionRect): BlockTemplateSelectionRect {
  return {
    x: Math.min(rect.x, rect.x + rect.width),
    y: Math.min(rect.y, rect.y + rect.height),
    width: Math.abs(rect.width),
    height: Math.abs(rect.height)
  }
}

function containsRect(outer: BlockTemplateSelectionRect, inner: BlockTemplateSelectionRect) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}
