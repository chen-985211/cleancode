import type { WorkbenchSnapshot } from './types'

export function isTerminalConnectionAllowedInCanvasScope(
  graph: WorkbenchSnapshot['graph'] | null,
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

  const sourceScope = resolveTerminalScope(graph, sourceBlockId)
  const targetScope = resolveTerminalScope(graph, targetBlockId)
  if (sourceScope !== targetScope) return false

  return editingTerminalGroupId === null || sourceScope === editingTerminalGroupId
}

export function isTerminalConnectionEditableInCanvasScope(
  graph: WorkbenchSnapshot['graph'] | null,
  sourceBlockId: string,
  targetBlockId: string,
  editingTerminalGroupId: string | null
): boolean {
  if (!editingTerminalGroupId) return true
  return (
    resolveTerminalScope(graph, sourceBlockId) === editingTerminalGroupId &&
    resolveTerminalScope(graph, targetBlockId) === editingTerminalGroupId
  )
}

function resolveTerminalScope(
  graph: WorkbenchSnapshot['graph'] | null,
  blockId: string
): string | null {
  return graph?.terminalGroups.find((group) => group.memberBlockIds.includes(blockId))?.id ?? null
}
