import { MarkerType, type Edge } from '@xyflow/react'

import type { BlockGraphSnapshot } from '../../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkflowRunNodeStatus } from '../../../contexts/run/application/dto/WorkflowRunSnapshot'

export function createTerminalWorkflowEdges(
  graph: BlockGraphSnapshot | null,
  nodeStatuses: Readonly<Record<string, WorkflowRunNodeStatus>>
): Edge[] {
  const collapsedGroupByMemberId = new Map(
    (graph?.terminalGroups ?? [])
      .filter((group) => group.isCollapsed)
      .flatMap((group) => group.memberBlockIds.map((id) => [id, group.id] as const))
  )
  const expandedMemberIds = new Set(
    (graph?.terminalGroups ?? [])
      .filter((group) => !group.isCollapsed)
      .flatMap((group) => group.memberBlockIds)
  )

  return (graph?.connections ?? [])
    .filter((connection) => {
      const sourceGroup = collapsedGroupByMemberId.get(connection.sourceBlockId)
      const targetGroup = collapsedGroupByMemberId.get(connection.targetBlockId)
      return !sourceGroup || sourceGroup !== targetGroup
    })
    .map((connection) => {
      const status = nodeStatuses[connection.targetBlockId]

      return {
        id: connection.id,
        source: collapsedGroupByMemberId.get(connection.sourceBlockId) ?? connection.sourceBlockId,
        target: collapsedGroupByMemberId.get(connection.targetBlockId) ?? connection.targetBlockId,
        sourceHandle: collapsedGroupByMemberId.has(connection.sourceBlockId)
          ? 'workflow-output'
          : undefined,
        targetHandle: collapsedGroupByMemberId.has(connection.targetBlockId)
          ? 'workflow-input'
          : undefined,
        type: 'terminalDependency',
        className: ['terminal-workflow-edge', resolveEdgeStatusClassName(status)]
          .filter(Boolean)
          .join(' '),
        animated: status === 'running',
        markerEnd: { type: MarkerType.ArrowClosed, color: 'context-stroke' },
        deletable: true,
        zIndex:
          expandedMemberIds.has(connection.sourceBlockId) ||
          expandedMemberIds.has(connection.targetBlockId)
            ? 3
            : undefined
      }
    })
}

function resolveEdgeStatusClassName(status: WorkflowRunNodeStatus | undefined): string {
  if (status === 'running' || status === 'ready') {
    return 'terminal-workflow-edge--active'
  }
  if (status === 'succeeded') {
    return 'terminal-workflow-edge--succeeded'
  }
  if (status === 'failed' || status === 'blocked') {
    return 'terminal-workflow-edge--failed'
  }

  return ''
}
