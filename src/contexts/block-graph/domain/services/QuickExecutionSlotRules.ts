import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import { analyzeCanvasExecutionSelection } from '../../../../shared-kernel/domain/policies/CanvasExecutionSemantics'
import type {
  QuickExecutionSlotNumber,
  QuickExecutionSlotSnapshot,
  QuickExecutionTargetSnapshot,
  TerminalBlockSnapshot,
  TerminalConnectionSnapshot,
  TerminalGroupSnapshot
} from '../aggregates/BlockGraphTypes'

const quickExecutionSlotNumbers = Object.freeze([1, 2, 3, 4, 5] as const)

export function createEmptyQuickExecutionSlots(): QuickExecutionSlotSnapshot[] {
  return quickExecutionSlotNumbers.map((number) => ({ number, target: null }))
}

export function restoreQuickExecutionSlots(
  slots: readonly QuickExecutionSlotSnapshot[] | undefined
): QuickExecutionSlotSnapshot[] {
  if (!slots) return createEmptyQuickExecutionSlots()
  if (
    slots.length !== quickExecutionSlotNumbers.length ||
    slots.some((slot, index) => slot.number !== quickExecutionSlotNumbers[index])
  ) {
    throw createExpectedAppError(
      'QUICK_EXECUTION_SLOT_INVALID',
      'Quick execution slots must contain the fixed slots 1 through 5.'
    )
  }

  return slots.map((slot) => ({
    number: slot.number,
    target: cloneQuickExecutionTarget(slot.target)
  }))
}

export function normalizeQuickExecutionTarget(
  target: QuickExecutionTargetSnapshot,
  blocks: readonly TerminalBlockSnapshot[],
  connections: readonly TerminalConnectionSnapshot[],
  terminalGroups: readonly TerminalGroupSnapshot[]
): QuickExecutionTargetSnapshot {
  if (target.type === 'combination') {
    if (!terminalGroups.some((group) => group.id === target.terminalGroupId)) {
      throw createExpectedAppError(
        'QUICK_EXECUTION_TARGET_NOT_FOUND',
        'Quick execution combination was not found.'
      )
    }
    return { type: 'combination', terminalGroupId: target.terminalGroupId }
  }

  const selectedTerminalIds =
    target.type === 'terminal' ? [target.terminalBlockId] : target.terminalBlockIds
  const analysis = analyzeCanvasExecutionSelection({
    terminals: blocks.map((block) => ({ terminalId: block.id })),
    dependencies: connections.map((connection) => ({
      sourceTerminalId: connection.sourceBlockId,
      targetTerminalId: connection.targetBlockId
    })),
    selectedTerminalIds
  })

  if (analysis.unknownTerminalIds.length > 0) {
    throw createExpectedAppError(
      'QUICK_EXECUTION_TARGET_NOT_FOUND',
      'Quick execution terminal was not found.'
    )
  }

  if (target.type === 'terminal') {
    if (
      analysis.classification !== 'terminal' ||
      analysis.expandedTerminalIds.length !== 1 ||
      analysis.expandedTerminalIds[0] !== target.terminalBlockId
    ) {
      throw createExpectedAppError(
        'QUICK_EXECUTION_TARGET_INVALID',
        'Quick execution terminal must reference one independent terminal.'
      )
    }
    return { type: 'terminal', terminalBlockId: target.terminalBlockId }
  }

  const requestedTerminalIds = new Set(target.terminalBlockIds)
  const referencesCompleteWorkflow =
    analysis.classification === 'workflow' &&
    requestedTerminalIds.size === analysis.expandedTerminalIds.length &&
    analysis.expandedTerminalIds.every((terminalId) => requestedTerminalIds.has(terminalId))

  if (!referencesCompleteWorkflow) {
    throw createExpectedAppError(
      'QUICK_EXECUTION_TARGET_INVALID',
      'Quick execution workflow must reference one complete workflow.'
    )
  }

  return {
    type: 'workflow',
    terminalBlockIds: [...analysis.expandedTerminalIds]
  }
}

export function requireQuickExecutionSlotNumber(number: number): QuickExecutionSlotNumber {
  if (!quickExecutionSlotNumbers.includes(number as QuickExecutionSlotNumber)) {
    throw createExpectedAppError(
      'QUICK_EXECUTION_SLOT_INVALID',
      'Quick execution slot number must be between 1 and 5.'
    )
  }
  return number as QuickExecutionSlotNumber
}

function cloneQuickExecutionTarget(
  target: QuickExecutionTargetSnapshot | null
): QuickExecutionTargetSnapshot | null {
  if (!target) return null
  if (target.type === 'workflow') {
    return { type: 'workflow', terminalBlockIds: [...target.terminalBlockIds] }
  }
  return { ...target }
}
