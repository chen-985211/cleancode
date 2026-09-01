import type { Edge, ReactFlowInstance } from '@xyflow/react'

import type {
  QuickExecutionTargetSnapshot,
  TerminalGroupSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkbenchFlowNode } from './types/workbenchFlowNode'
import { transitionWorkbenchViewport } from './workbenchViewportMotion'

export function focusQuickExecutionTargetInCanvas({
  instance,
  target,
  terminalGroups
}: {
  readonly instance: ReactFlowInstance<WorkbenchFlowNode, Edge> | null
  readonly target: QuickExecutionTargetSnapshot
  readonly terminalGroups: readonly TerminalGroupSnapshot[]
}): boolean {
  if (!instance) return false

  const nodeIds = resolveVisibleQuickExecutionNodeIds(target, terminalGroups)
  const nodes = nodeIds.map((nodeId) => instance.getNode(nodeId))

  if (nodes.some((node) => !node)) return false

  void transitionWorkbenchViewport(instance, {
    intent: { type: 'spatial' },
    maxZoom: 1,
    nodes: nodes as WorkbenchFlowNode[],
    padding: 0.24,
    type: 'fit-view'
  })
  return true
}

function resolveVisibleQuickExecutionNodeIds(
  target: QuickExecutionTargetSnapshot,
  terminalGroups: readonly TerminalGroupSnapshot[]
): readonly string[] {
  if (target.type === 'combination') return [target.terminalGroupId]

  const collapsedGroupIdByMemberId = new Map<string, string>()
  for (const group of terminalGroups) {
    if (!group.isCollapsed) continue
    for (const memberBlockId of group.memberBlockIds) {
      collapsedGroupIdByMemberId.set(memberBlockId, group.id)
    }
  }

  const terminalBlockIds =
    target.type === 'terminal' ? [target.terminalBlockId] : target.terminalBlockIds

  return [
    ...new Set(
      terminalBlockIds.map(
        (terminalBlockId) => collapsedGroupIdByMemberId.get(terminalBlockId) ?? terminalBlockId
      )
    )
  ]
}
