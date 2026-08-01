import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import { analyzeCanvasExecutionSelection } from '../../../../shared-kernel/domain/policies/CanvasExecutionSemantics'
import type {
  TerminalBlockSnapshot,
  TerminalConnectionSnapshot,
  TerminalGroupSnapshot,
  TerminalRemovalTargetSnapshot
} from '../aggregates/BlockGraphTypes'

export function resolveTerminalRemovalBlockIds(
  target: TerminalRemovalTargetSnapshot,
  blocks: readonly TerminalBlockSnapshot[],
  connections: readonly TerminalConnectionSnapshot[],
  terminalGroups: readonly TerminalGroupSnapshot[]
): string[] {
  if (target.type === 'terminal') {
    if (!blocks.some((block) => block.id === target.terminalBlockId)) {
      throw createExpectedAppError('TERMINAL_BLOCK_NOT_FOUND', 'Terminal block was not found.')
    }
    return [target.terminalBlockId]
  }

  if (target.type === 'combination') {
    const group = terminalGroups.find((candidate) => candidate.id === target.terminalGroupId)
    if (!group || !referencesExactIds(target.terminalBlockIds, group.memberBlockIds)) {
      removalScopeStale()
    }
    return [...group.memberBlockIds]
  }

  const analysis = analyzeCanvasExecutionSelection({
    terminals: blocks.map((block) => ({ terminalId: block.id })),
    dependencies: connections.map((connection) => ({
      sourceTerminalId: connection.sourceBlockId,
      targetTerminalId: connection.targetBlockId
    })),
    selectedTerminalIds: target.terminalBlockIds
  })
  if (
    analysis.unknownTerminalIds.length > 0 ||
    analysis.classification !== 'workflow' ||
    !referencesExactIds(target.terminalBlockIds, analysis.expandedTerminalIds)
  ) {
    removalScopeStale()
  }

  return [...analysis.expandedTerminalIds]
}

function referencesExactIds(
  observedIds: readonly string[],
  currentIds: readonly string[]
): boolean {
  const observed = new Set(observedIds)
  return (
    observed.size === observedIds.length &&
    observed.size === currentIds.length &&
    currentIds.every((id) => observed.has(id))
  )
}

function removalScopeStale(): never {
  throw createExpectedAppError(
    'TERMINAL_REMOVAL_SCOPE_STALE',
    'Terminal removal scope changed before it could be deleted.'
  )
}
