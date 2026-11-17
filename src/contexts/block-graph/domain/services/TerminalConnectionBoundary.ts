import { createBlockGraphDomainError } from '../errors/BlockGraphDomainError'

import type {
  TerminalConnectionSnapshot,
  TerminalGroupSnapshot
} from '../aggregates/BlockGraphTypes'

export function resolveTerminalGroupId(
  groups: readonly TerminalGroupSnapshot[],
  blockId: string
): string | null {
  return groups.find((group) => group.memberBlockIds.includes(blockId))?.id ?? null
}

export function isTerminalConnectionWithinGroupBoundary(
  groups: readonly TerminalGroupSnapshot[],
  sourceBlockId: string,
  targetBlockId: string
): boolean {
  return (
    resolveTerminalGroupId(groups, sourceBlockId) === resolveTerminalGroupId(groups, targetBlockId)
  )
}

export function assertTerminalConnectionsWithinGroupBoundary(
  connections: readonly TerminalConnectionSnapshot[],
  groups: readonly TerminalGroupSnapshot[]
): void {
  if (
    connections.some(
      (connection) =>
        !isTerminalConnectionWithinGroupBoundary(
          groups,
          connection.sourceBlockId,
          connection.targetBlockId
        )
    )
  ) {
    throw createBlockGraphDomainError(
      'TERMINAL_CONNECTION_SCOPE_MISMATCH',
      'Connections cannot cross terminal group boundaries. Move the complete workflow together.'
    )
  }
}
