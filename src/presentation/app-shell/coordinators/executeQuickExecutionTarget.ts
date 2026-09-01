import type {
  BlockGraphSnapshot,
  QuickExecutionTargetSnapshot,
  TerminalBlockSnapshot
} from '../../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { resolveQuickExecutionBinding } from '../../../contexts/block-graph/presentation/view-models/quickExecutionProjection'
import type { TerminalWorkflowPlanScope } from '../../../contexts/run/application/ports/TerminalWorkflowPlanPort'

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
