import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type {
  TerminalConnectionSnapshot,
  TerminalGroupSnapshot
} from '../aggregates/BlockGraphTypes'

export function assertTerminalConnectionWithinOneScope(
  sourceBlockId: string,
  targetBlockId: string,
  terminalGroups: readonly TerminalGroupSnapshot[]
): void {
  if (
    resolveTerminalGroupId(sourceBlockId, terminalGroups) !==
    resolveTerminalGroupId(targetBlockId, terminalGroups)
  ) {
    throw createExpectedAppError(
      'TERMINAL_CONNECTION_SCOPE_MISMATCH',
      'Terminal connections must stay within one container scope.'
    )
  }
}

export function migrateCrossScopeWorkflowComponentsToRoot(
  terminalGroups: readonly TerminalGroupSnapshot[],
  connections: readonly TerminalConnectionSnapshot[]
): {
  readonly migratedTerminalIds: readonly string[]
  readonly terminalGroups: readonly TerminalGroupSnapshot[]
} {
  const adjacentIds = new Map<string, Set<string>>()
  for (const connection of connections) {
    addNeighbor(adjacentIds, connection.sourceBlockId, connection.targetBlockId)
    addNeighbor(adjacentIds, connection.targetBlockId, connection.sourceBlockId)
  }

  const migratedTerminalIds = new Set<string>()
  const visitedIds = new Set<string>()
  for (const terminalId of adjacentIds.keys()) {
    if (visitedIds.has(terminalId)) continue
    const componentIds = collectComponent(terminalId, adjacentIds, visitedIds)
    const scopeIds = new Set(
      componentIds.map((id) => resolveTerminalGroupId(id, terminalGroups) ?? 'root')
    )
    if (scopeIds.size > 1) {
      for (const id of componentIds) migratedTerminalIds.add(id)
    }
  }

  if (migratedTerminalIds.size === 0) {
    return { migratedTerminalIds: [], terminalGroups }
  }

  return {
    migratedTerminalIds: [...migratedTerminalIds],
    terminalGroups: terminalGroups.map((group) => ({
      ...group,
      memberBlockIds: group.memberBlockIds.filter((id) => !migratedTerminalIds.has(id))
    }))
  }
}

function resolveTerminalGroupId(
  blockId: string,
  terminalGroups: readonly TerminalGroupSnapshot[]
): string | null {
  return terminalGroups.find((group) => group.memberBlockIds.includes(blockId))?.id ?? null
}

function addNeighbor(adjacency: Map<string, Set<string>>, source: string, target: string): void {
  const neighbors = adjacency.get(source) ?? new Set<string>()
  neighbors.add(target)
  adjacency.set(source, neighbors)
}

function collectComponent(
  startId: string,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  visitedIds: Set<string>
): string[] {
  const componentIds: string[] = []
  const pendingIds = [startId]
  while (pendingIds.length > 0) {
    const currentId = pendingIds.shift()
    if (!currentId || visitedIds.has(currentId)) continue
    visitedIds.add(currentId)
    componentIds.push(currentId)
    pendingIds.push(...(adjacency.get(currentId) ?? []))
  }
  return componentIds
}
