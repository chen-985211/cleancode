import type { Edge, ReactFlowInstance } from '@xyflow/react'

import type { QuickExecutionTargetSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkbenchFlowNode } from './types'
import { transitionWorkbenchViewport } from './workbenchViewportMotion'

export function focusQuickExecutionTargetInCanvas({
  instance,
  target
}: {
  readonly instance: ReactFlowInstance<WorkbenchFlowNode, Edge> | null
  readonly target: QuickExecutionTargetSnapshot
}): boolean {
  if (!instance) return false

  const nodeIds =
    target.type === 'terminal'
      ? [target.terminalBlockId]
      : target.type === 'combination'
        ? [target.terminalGroupId]
        : target.terminalBlockIds
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
