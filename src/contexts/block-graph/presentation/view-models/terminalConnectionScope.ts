import type { BlockGraphSnapshot } from '../../application/dto/BlockGraphSnapshot'
import {
  isTerminalConnectionWithinGroupBoundary,
  resolveTerminalGroupId
} from '../../domain/services/TerminalConnectionBoundary'

export function isTerminalConnectionAllowedInCanvasScope(
  graph: BlockGraphSnapshot | null,
  sourceBlockId: string | null,
  targetBlockId: string | null,
  editingTerminalGroupId: string | null
): boolean {
  if (!graph || !sourceBlockId || !targetBlockId || sourceBlockId === targetBlockId) return false
  if (
    !graph.blocks.some((block) => block.id === sourceBlockId) ||
    !graph.blocks.some((block) => block.id === targetBlockId)
  ) {
    return false
  }

  return (
    isTerminalConnectionWithinGroupBoundary(graph.terminalGroups, sourceBlockId, targetBlockId) &&
    (editingTerminalGroupId === null ||
      resolveTerminalGroupId(graph.terminalGroups, sourceBlockId) === editingTerminalGroupId)
  )
}

export function isTerminalConnectionEditableInCanvasScope(
  graph: BlockGraphSnapshot | null,
  sourceBlockId: string,
  targetBlockId: string,
  editingTerminalGroupId: string | null
): boolean {
  if (!editingTerminalGroupId) return true
  return (
    graph !== null &&
    resolveTerminalGroupId(graph.terminalGroups, sourceBlockId) === editingTerminalGroupId &&
    resolveTerminalGroupId(graph.terminalGroups, targetBlockId) === editingTerminalGroupId
  )
}
