import { MarkerType, type Edge } from '@xyflow/react'

import type { AgentToolApprovalRequest } from '../../contexts/agent/application/dto/AgentSessionProtocol'
import type {
  BlockGraphSnapshot,
  TerminalBlockSnapshot,
  TerminalGroupSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { agentApprovalSourceHandleId, agentApprovalTargetHandleId } from './agentApprovalHandles'
import { toAgentFlowNodeId } from './agentConsoleFlowNode'
import type { AgentApprovalNodeIntent, AgentToolApprovalViewState } from './agentToolApprovalTypes'

interface AgentApprovalPresentationBase {
  readonly agentNodeId: string
  readonly approval: AgentToolApprovalViewState
  readonly targetId: string
  readonly targetKind: 'group' | 'terminal'
}

export type AgentApprovalPresentation =
  | (AgentApprovalPresentationBase & {
      readonly status: 'missing'
    })
  | (AgentApprovalPresentationBase & {
      readonly block: TerminalBlockSnapshot
      readonly containingGroup: TerminalGroupSnapshot | null
      readonly isGroupProxy: boolean
      readonly status: 'resolved'
      readonly targetKind: 'terminal'
      readonly visibleTargetNodeId: string
    })
  | (AgentApprovalPresentationBase & {
      readonly group: TerminalGroupSnapshot
      readonly memberBlocks: readonly TerminalBlockSnapshot[]
      readonly status: 'resolved'
      readonly targetKind: 'group'
      readonly visibleTargetNodeId: string
    })

export interface AgentApprovalIntentEdgeData extends Record<string, unknown> {
  readonly label: '删除' | '解散'
  readonly phase: AgentToolApprovalViewState['phase']
}

export function resolveAgentApprovalPresentation(
  approval: AgentToolApprovalViewState | AgentToolApprovalRequest,
  graph: BlockGraphSnapshot | null
): AgentApprovalPresentation {
  const viewState = toApprovalViewState(approval)
  const request = viewState.request
  const agentNodeId = toAgentFlowNodeId(request.agentId)

  if (request.target.kind === 'terminal_block') {
    const targetId = request.target.blockId
    const block = graph?.blocks.find((candidate) => candidate.id === targetId)

    if (!block) {
      return {
        agentNodeId,
        approval: viewState,
        status: 'missing',
        targetId,
        targetKind: 'terminal'
      }
    }

    const containingGroup =
      graph?.terminalGroups.find((group) => group.memberBlockIds.includes(block.id)) ?? null
    const isGroupProxy = containingGroup?.isCollapsed === true

    return {
      agentNodeId,
      approval: viewState,
      block,
      containingGroup,
      isGroupProxy,
      status: 'resolved',
      targetId,
      targetKind: 'terminal',
      visibleTargetNodeId: isGroupProxy && containingGroup ? containingGroup.id : block.id
    }
  }

  const targetId = request.target.terminalGroupId
  const group = graph?.terminalGroups.find((candidate) => candidate.id === targetId)

  if (!group) {
    return { agentNodeId, approval: viewState, status: 'missing', targetId, targetKind: 'group' }
  }

  const memberIds = new Set(group.memberBlockIds)

  return {
    agentNodeId,
    approval: viewState,
    group,
    memberBlocks: (graph?.blocks ?? []).filter((block) => memberIds.has(block.id)),
    status: 'resolved',
    targetId,
    targetKind: 'group',
    visibleTargetNodeId: group.id
  }
}

export function createAgentApprovalIntentEdges(
  approvals: readonly AgentToolApprovalViewState[],
  graph: BlockGraphSnapshot | null
): Edge<AgentApprovalIntentEdgeData>[] {
  return approvals.flatMap((approval) => {
    const presentation = resolveAgentApprovalPresentation(approval, graph)

    if (presentation.status === 'missing') return []

    return [
      {
        animated: approval.phase === 'approving',
        className: `agent-approval-intent-edge agent-approval-intent-edge--${approval.phase}`,
        data: {
          label: presentation.targetKind === 'terminal' ? '删除' : '解散',
          phase: approval.phase
        },
        deletable: false,
        focusable: false,
        id: `approval:${approval.request.approvalId}`,
        markerEnd: {
          color: 'var(--cc-warning)',
          type: MarkerType.ArrowClosed
        },
        reconnectable: false,
        selectable: false,
        source: presentation.agentNodeId,
        sourceHandle: agentApprovalSourceHandleId,
        style: { stroke: 'var(--cc-warning)' },
        target: presentation.visibleTargetNodeId,
        targetHandle: agentApprovalTargetHandleId,
        type: 'approvalIntent'
      }
    ]
  })
}

export function createAgentApprovalNodeIntents(
  approvals: readonly AgentToolApprovalViewState[],
  graph: BlockGraphSnapshot | null
): ReadonlyMap<string, AgentApprovalNodeIntent> {
  const intents = new Map<string, AgentApprovalNodeIntent>()

  for (const approval of approvals) {
    const presentation = resolveAgentApprovalPresentation(approval, graph)

    if (presentation.status === 'missing') continue
    if (presentation.targetKind === 'group') {
      intents.set(presentation.visibleTargetNodeId, 'dissolve')
      continue
    }

    intents.set(
      presentation.visibleTargetNodeId,
      presentation.isGroupProxy ? 'contains-delete' : 'delete'
    )
  }

  return intents
}

function toApprovalViewState(
  approval: AgentToolApprovalViewState | AgentToolApprovalRequest
): AgentToolApprovalViewState {
  return 'request' in approval ? approval : { phase: 'awaiting', request: approval }
}
