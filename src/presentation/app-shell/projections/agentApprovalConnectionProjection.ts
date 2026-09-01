import { MarkerType, type Edge } from '@xyflow/react'

import type { BlockGraphSnapshot } from '../../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import {
  resolveAgentApprovalPresentation,
  type AgentApprovalPresentation
} from './agentApprovalPresentation'
import {
  agentApprovalConnectionSourceHandleId,
  agentApprovalConnectionTargetHandleId
} from '../agentApprovalHandles'
import type { AgentToolApprovalViewState } from '../agentToolApprovalTypes'

type ResolvedConnectionApproval = Extract<
  AgentApprovalPresentation,
  { readonly status: 'resolved'; readonly targetKind: 'connection' }
>

export function projectAgentConnectionApprovalsOntoWorkflowEdges(
  workflowEdges: readonly Edge[],
  approvals: readonly AgentToolApprovalViewState[],
  graph: BlockGraphSnapshot | null
): Edge[] {
  const connectionApprovals = resolveConnectionApprovals(approvals, graph)
  const approvalByConnectionId = new Map(
    connectionApprovals.map((presentation) => [presentation.connection.id, presentation])
  )
  const projectedConnectionIds = new Set<string>()
  const projectedWorkflowEdges = workflowEdges.map((edge) => {
    const presentation = approvalByConnectionId.get(edge.id)

    if (!presentation) return edge
    projectedConnectionIds.add(edge.id)

    return {
      ...edge,
      className: appendClassNames(
        edge.className,
        'terminal-workflow-edge--approval-target',
        `terminal-workflow-edge--approval-${presentation.approval.phase}`
      )
    }
  })

  const proxyEdges = connectionApprovals.flatMap((presentation) => {
    if (
      projectedConnectionIds.has(presentation.connection.id) ||
      presentation.visibleSourceNodeId === presentation.visibleTargetNodeId
    ) {
      return []
    }

    const phase = presentation.approval.phase

    return [
      {
        animated: phase === 'approving',
        className: [
          'terminal-workflow-edge',
          'terminal-workflow-edge--approval-target',
          'terminal-workflow-edge--approval-proxy',
          `terminal-workflow-edge--approval-${phase}`
        ].join(' '),
        data: {
          approvalProjection: true,
          connectionId: presentation.connection.id
        },
        deletable: false,
        focusable: false,
        id: `approval:connection:${presentation.approval.request.approvalId}`,
        markerEnd: {
          color: 'var(--cc-warning)',
          type: MarkerType.ArrowClosed
        },
        reconnectable: false,
        selectable: false,
        source: presentation.visibleSourceNodeId,
        sourceHandle: presentation.sourceIsGroupProxy
          ? agentApprovalConnectionSourceHandleId
          : undefined,
        style: { stroke: 'var(--cc-warning)' },
        target: presentation.visibleTargetNodeId,
        targetHandle: presentation.targetIsGroupProxy
          ? agentApprovalConnectionTargetHandleId
          : undefined,
        type: 'smoothstep'
      } satisfies Edge
    ]
  })

  return [...projectedWorkflowEdges, ...proxyEdges]
}

function resolveConnectionApprovals(
  approvals: readonly AgentToolApprovalViewState[],
  graph: BlockGraphSnapshot | null
): ResolvedConnectionApproval[] {
  const presentationsByConnectionId = new Map<string, ResolvedConnectionApproval>()

  for (const approval of approvals) {
    const presentation = resolveAgentApprovalPresentation(approval, graph)

    if (presentation.status !== 'resolved' || presentation.targetKind !== 'connection') continue
    if (!presentationsByConnectionId.has(presentation.connection.id)) {
      presentationsByConnectionId.set(presentation.connection.id, presentation)
    }
  }

  return [...presentationsByConnectionId.values()]
}

function appendClassNames(...classNames: Array<string | undefined>): string {
  return classNames.filter(Boolean).join(' ')
}
