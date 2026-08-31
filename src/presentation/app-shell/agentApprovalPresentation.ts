import { MarkerType, type Edge } from '@xyflow/react'

import type {
  BlockGraphSnapshot,
  TerminalBlockSnapshot,
  TerminalGroupSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { agentApprovalSourceHandleId, agentApprovalTargetHandleId } from './agentApprovalHandles'
import { toAgentFlowNodeId } from './agentConsoleFlowNode'
import type {
  AgentApprovalNodeIntent,
  AgentToolApprovalPresentationRequest,
  AgentToolApprovalViewState
} from './agentToolApprovalTypes'
import { translate, type Translate } from '../i18n/messages'

interface AgentApprovalPresentationBase {
  readonly agentNodeId: string
  readonly approval: AgentToolApprovalViewState
  readonly targetId: string
  readonly targetKind: 'connection' | 'group' | 'terminal'
}

export type AgentApprovalPresentation =
  | (AgentApprovalPresentationBase & {
      readonly status: 'missing'
    })
  | (AgentApprovalPresentationBase & {
      readonly connection: NonNullable<BlockGraphSnapshot['connections']>[number]
      readonly sourceBlock: TerminalBlockSnapshot
      readonly sourceContainingGroup: TerminalGroupSnapshot | null
      readonly sourceIsGroupProxy: boolean
      readonly status: 'resolved'
      readonly targetBlock: TerminalBlockSnapshot
      readonly targetContainingGroup: TerminalGroupSnapshot | null
      readonly targetIsGroupProxy: boolean
      readonly targetKind: 'connection'
      readonly visibleSourceNodeId: string
      readonly visibleTargetNodeId: string
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
  readonly label: string
  readonly phase: AgentToolApprovalViewState['phase']
}

export function resolveAgentApprovalPresentation(
  approval: AgentToolApprovalViewState | AgentToolApprovalPresentationRequest,
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

  if (request.target.kind === 'terminal_group') {
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

  return resolveTerminalConnectionApproval(
    viewState,
    graph,
    agentNodeId,
    request.target.connectionId
  )
}

export function createAgentApprovalIntentEdges(
  approvals: readonly AgentToolApprovalViewState[],
  graph: BlockGraphSnapshot | null,
  t: Translate = defaultTranslate
): Edge<AgentApprovalIntentEdgeData>[] {
  return approvals.flatMap((approval) => {
    const presentation = resolveAgentApprovalPresentation(approval, graph)

    if (presentation.status === 'missing') return []

    return [
      {
        animated: approval.phase === 'approving',
        className: `agent-approval-intent-edge agent-approval-intent-edge--${approval.phase}`,
        data: {
          label: resolveApprovalIntentLabel(presentation.targetKind, t),
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
    if (presentation.targetKind === 'connection') {
      if (presentation.sourceIsGroupProxy) {
        intents.set(presentation.visibleSourceNodeId, 'contains-disconnect')
      }
      if (presentation.targetIsGroupProxy) {
        intents.set(presentation.visibleTargetNodeId, 'contains-disconnect')
      }
      continue
    }
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
  approval: AgentToolApprovalViewState | AgentToolApprovalPresentationRequest
): AgentToolApprovalViewState {
  return 'request' in approval ? approval : { phase: 'awaiting', request: approval }
}

function resolveTerminalConnectionApproval(
  approval: AgentToolApprovalViewState,
  graph: BlockGraphSnapshot | null,
  agentNodeId: string,
  targetId: string
): AgentApprovalPresentation {
  const connection = (graph?.connections ?? []).find((candidate) => candidate.id === targetId)
  const sourceBlock = graph?.blocks.find((block) => block.id === connection?.sourceBlockId)
  const targetBlock = graph?.blocks.find((block) => block.id === connection?.targetBlockId)

  if (!connection || !sourceBlock || !targetBlock) {
    return {
      agentNodeId,
      approval,
      status: 'missing',
      targetId,
      targetKind: 'connection'
    }
  }

  const sourceContainingGroup = findContainingGroup(graph, sourceBlock.id)
  const targetContainingGroup = findContainingGroup(graph, targetBlock.id)
  const sourceIsGroupProxy = sourceContainingGroup?.isCollapsed === true
  const targetIsGroupProxy = targetContainingGroup?.isCollapsed === true

  return {
    agentNodeId,
    approval,
    connection,
    sourceBlock,
    sourceContainingGroup,
    sourceIsGroupProxy,
    status: 'resolved',
    targetBlock,
    targetContainingGroup,
    targetId,
    targetIsGroupProxy,
    targetKind: 'connection',
    visibleSourceNodeId:
      sourceIsGroupProxy && sourceContainingGroup ? sourceContainingGroup.id : sourceBlock.id,
    visibleTargetNodeId:
      targetIsGroupProxy && targetContainingGroup ? targetContainingGroup.id : targetBlock.id
  }
}

function findContainingGroup(
  graph: BlockGraphSnapshot | null,
  blockId: string
): TerminalGroupSnapshot | null {
  return graph?.terminalGroups.find((group) => group.memberBlockIds.includes(blockId)) ?? null
}

function resolveApprovalIntentLabel(
  targetKind: AgentApprovalPresentation['targetKind'],
  t: Translate
): AgentApprovalIntentEdgeData['label'] {
  if (targetKind === 'terminal') return t('approval.edgeDelete')
  if (targetKind === 'connection') return t('approval.edgeDisconnect')
  return t('approval.edgeDissolve')
}

const defaultTranslate: Translate = (key, variables) => translate('zh-CN', key, variables)
