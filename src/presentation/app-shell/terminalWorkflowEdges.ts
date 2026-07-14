import { MarkerType, type Edge } from '@xyflow/react'

import type { BlockGraphSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkflowRunNodeStatus } from '../../contexts/run/application/dto/WorkflowRunSnapshot'

export function createTerminalWorkflowEdges(
  graph: BlockGraphSnapshot | null,
  nodeStatuses: Readonly<Record<string, WorkflowRunNodeStatus>>
): Edge[] {
  const collapsedMemberIds = new Set(
    (graph?.terminalGroups ?? [])
      .filter((group) => group.isCollapsed)
      .flatMap((group) => group.memberBlockIds)
  )

  return (graph?.connections ?? [])
    .filter(
      (connection) =>
        !collapsedMemberIds.has(connection.sourceBlockId) &&
        !collapsedMemberIds.has(connection.targetBlockId)
    )
    .map((connection) => {
      const status = nodeStatuses[connection.targetBlockId]
      const color = resolveEdgeColor(status)

      return {
        id: connection.id,
        source: connection.sourceBlockId,
        target: connection.targetBlockId,
        type: 'smoothstep',
        className: ['terminal-workflow-edge', resolveEdgeStatusClassName(status)]
          .filter(Boolean)
          .join(' '),
        style: { stroke: color },
        animated: status === 'running',
        markerEnd: { type: MarkerType.ArrowClosed, color },
        deletable: true
      }
    })
}

function resolveEdgeColor(status: WorkflowRunNodeStatus | undefined): string {
  if (status === 'running' || status === 'ready') {
    return 'var(--cc-primary)'
  }
  if (status === 'succeeded') {
    return 'var(--cc-success)'
  }
  if (status === 'failed' || status === 'blocked') {
    return 'var(--cc-danger)'
  }

  return 'var(--cc-muted)'
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
