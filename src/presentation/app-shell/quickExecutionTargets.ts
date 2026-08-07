import type {
  BlockGraphSnapshot,
  QuickExecutionTargetSnapshot,
  TerminalBlockSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { TerminalWorkflowPlanScope } from '../../contexts/run/application/ports/TerminalWorkflowPlanPort'
import {
  resolveCanvasObjectContextTarget,
  type CanvasTerminalObjectContextTarget
} from './canvasObjectContextTarget'

export interface QuickExecutionCandidate {
  readonly key: string
  readonly name: string
  readonly target: QuickExecutionTargetSnapshot
  readonly type: QuickExecutionTargetSnapshot['type']
}

export interface QuickExecutionBindingProjection extends QuickExecutionCandidate {
  readonly isAvailable: boolean
}

export function listQuickExecutionCandidates(graph: BlockGraphSnapshot): QuickExecutionCandidate[] {
  const candidates: QuickExecutionCandidate[] = []
  const seenKeys = new Set<string>()

  for (const block of graph.blocks) {
    const contextTarget = resolveCanvasObjectContextTarget(graph, {
      nodeId: block.id,
      nodeType: 'terminal'
    })
    if (!contextTarget || contextTarget.kind === 'agent') continue

    const target = toQuickExecutionTarget(contextTarget)
    const projection = resolveQuickExecutionBinding(graph, target)
    if (!projection.isAvailable || seenKeys.has(projection.key)) continue

    seenKeys.add(projection.key)
    candidates.push(toCandidate(projection))
  }

  for (const group of graph.terminalGroups) {
    const target = {
      type: 'combination' as const,
      terminalGroupId: group.id
    }
    const projection = resolveQuickExecutionBinding(graph, target)
    if (!projection.isAvailable || seenKeys.has(projection.key)) continue

    seenKeys.add(projection.key)
    candidates.push(toCandidate(projection))
  }

  return candidates
}

function toCandidate(projection: QuickExecutionBindingProjection): QuickExecutionCandidate {
  return {
    key: projection.key,
    name: projection.name,
    target: projection.target,
    type: projection.type
  }
}

export function resolveQuickExecutionBinding(
  graph: BlockGraphSnapshot,
  target: QuickExecutionTargetSnapshot
): QuickExecutionBindingProjection {
  if (target.type === 'combination') {
    const group = graph.terminalGroups.find((candidate) => candidate.id === target.terminalGroupId)
    return {
      isAvailable: Boolean(group && group.memberBlockIds.length > 0),
      key: quickExecutionTargetKey(target),
      name: group?.name ?? target.terminalGroupId,
      target,
      type: target.type
    }
  }

  if (target.type === 'terminal') {
    const block = graph.blocks.find((candidate) => candidate.id === target.terminalBlockId)
    const resolved = block
      ? resolveCanvasObjectContextTarget(graph, {
          nodeId: block.id,
          nodeType: 'terminal'
        })
      : null

    return {
      isAvailable: resolved?.kind === 'terminal',
      key: quickExecutionTargetKey(target),
      name: block?.name ?? target.terminalBlockId,
      target,
      type: target.type
    }
  }

  const blocksById = new Map(graph.blocks.map((block) => [block.id, block]))
  const firstExistingBlockId = target.terminalBlockIds.find((blockId) => blocksById.has(blockId))
  const resolved = firstExistingBlockId
    ? resolveCanvasObjectContextTarget(graph, {
        nodeId: firstExistingBlockId,
        nodeType: 'terminal'
      })
    : null
  const targetIds = new Set(target.terminalBlockIds)
  const isAvailable =
    resolved?.kind === 'workflow' &&
    resolved.terminalBlockIds.length === targetIds.size &&
    resolved.terminalBlockIds.every((blockId) => targetIds.has(blockId))
  const projectedBlocks = target.terminalBlockIds
    .map((blockId) => blocksById.get(blockId))
    .filter((block): block is TerminalBlockSnapshot => Boolean(block))

  return {
    isAvailable,
    key: quickExecutionTargetKey(target),
    name:
      projectedBlocks.length > 0
        ? projectedBlocks.map((block) => block.name).join(' → ')
        : target.terminalBlockIds.join(' → '),
    target,
    type: target.type
  }
}

export function toQuickExecutionTarget(
  target: CanvasTerminalObjectContextTarget
): QuickExecutionTargetSnapshot {
  if (target.kind === 'combination') {
    return { type: 'combination', terminalGroupId: target.groupId }
  }
  if (target.kind === 'workflow') {
    return { type: 'workflow', terminalBlockIds: [...target.terminalBlockIds] }
  }
  return { type: 'terminal', terminalBlockId: target.terminalBlockIds[0]! }
}

export function quickExecutionTargetKey(target: QuickExecutionTargetSnapshot): string {
  if (target.type === 'terminal') return `terminal:${target.terminalBlockId}`
  if (target.type === 'combination') return `combination:${target.terminalGroupId}`
  return `workflow:${target.terminalBlockIds.join('\0')}`
}

export async function executeQuickExecutionTarget({
  graph,
  target,
  quickLaunchTerminal,
  requestTerminalLaunchCommand,
  startScope,
  startTerminalCombination
}: {
  readonly graph: BlockGraphSnapshot
  readonly target: QuickExecutionTargetSnapshot
  readonly quickLaunchTerminal: (block: TerminalBlockSnapshot) => Promise<unknown> | unknown
  readonly requestTerminalLaunchCommand: (blockId: string) => void
  readonly startScope: (scope: TerminalWorkflowPlanScope) => Promise<unknown> | unknown
  readonly startTerminalCombination: (terminalGroupId: string) => Promise<unknown> | unknown
}): Promise<boolean> {
  if (!resolveQuickExecutionBinding(graph, target).isAvailable) return false

  if (target.type === 'combination') {
    await startTerminalCombination(target.terminalGroupId)
    return true
  }

  if (target.type === 'workflow') {
    await startScope({ type: 'block-set', blockIds: target.terminalBlockIds })
    return true
  }

  const block = graph.blocks.find((candidate) => candidate.id === target.terminalBlockId)
  if (!block) return false
  if (!block.launchCommand.trim()) {
    requestTerminalLaunchCommand(block.id)
    return true
  }

  await quickLaunchTerminal(block)
  return true
}
