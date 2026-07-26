import type { AgentToolApprovalRequest } from '../../../src/contexts/agent/application/dto/AgentSessionProtocol'
import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import {
  createAgentApprovalIntentEdges,
  createAgentApprovalNodeIntents,
  resolveAgentApprovalPresentation
} from '../../../src/presentation/app-shell/agentApprovalPresentation'
import type { AgentToolApprovalPresentationRequest } from '../../../src/presentation/app-shell/agentToolApprovalTypes'

describe('Agent approval presentation', () => {
  it('uses a collapsed containing group as the visible proxy for a terminal target', () => {
    const approval = createApproval({ blockId: 'terminal-api', kind: 'terminal_block' })

    expect(resolveAgentApprovalPresentation(approval, graph)).toMatchObject({
      agentNodeId: 'agent:agent-1',
      block: { id: 'terminal-api', name: 'Backend API' },
      containingGroup: { id: 'group-app', name: '启动项目' },
      isGroupProxy: true,
      status: 'resolved',
      targetKind: 'terminal',
      visibleTargetNodeId: 'group-app'
    })
  })

  it('describes a group target with the terminals that will be preserved', () => {
    const approval = createApproval({ kind: 'terminal_group', terminalGroupId: 'group-app' })

    expect(resolveAgentApprovalPresentation(approval, graph)).toMatchObject({
      group: { id: 'group-app', name: '启动项目' },
      memberBlocks: [
        { id: 'terminal-api', name: 'Backend API' },
        { id: 'terminal-web', name: 'Admin Web' }
      ],
      status: 'resolved',
      targetKind: 'group',
      visibleTargetNodeId: 'group-app'
    })
  })

  it('creates a temporary, non-interactive edge that never looks like a workflow edge', () => {
    const approval = createApproval({ blockId: 'terminal-api', kind: 'terminal_block' })

    expect(
      createAgentApprovalIntentEdges([{ phase: 'awaiting', request: approval }], graph)
    ).toEqual([
      expect.objectContaining({
        className: expect.stringContaining('agent-approval-intent-edge'),
        data: expect.objectContaining({ label: '删除' }),
        deletable: false,
        focusable: false,
        id: 'approval:approval-1',
        selectable: false,
        source: 'agent:agent-1',
        sourceHandle: 'agent-approval-source',
        target: 'group-app',
        targetHandle: 'agent-approval-target',
        type: 'approvalIntent'
      })
    ])
  })

  it('keeps a missing target explicit instead of pointing at an unrelated node', () => {
    const approval = createApproval({ blockId: 'missing-terminal', kind: 'terminal_block' })

    expect(resolveAgentApprovalPresentation(approval, graph)).toMatchObject({
      status: 'missing',
      targetId: 'missing-terminal',
      targetKind: 'terminal'
    })
    expect(
      createAgentApprovalIntentEdges([{ phase: 'awaiting', request: approval }], graph)
    ).toEqual([])
  })

  it('resolves a terminal connection and uses its collapsed group as a visible proxy', () => {
    const approval = createConnectionApproval('connection-api-web')
    const viewState = { phase: 'awaiting' as const, request: approval }

    expect(resolveAgentApprovalPresentation(viewState, graph)).toMatchObject({
      connection: {
        id: 'connection-api-web',
        sourceBlockId: 'terminal-api',
        targetBlockId: 'terminal-web'
      },
      sourceBlock: { id: 'terminal-api', name: 'Backend API' },
      sourceIsGroupProxy: true,
      status: 'resolved',
      targetBlock: { id: 'terminal-web', name: 'Admin Web' },
      targetIsGroupProxy: true,
      targetKind: 'connection',
      visibleSourceNodeId: 'group-app',
      visibleTargetNodeId: 'group-app'
    })
    expect(createAgentApprovalNodeIntents([viewState], graph).get('group-app')).toBe(
      'contains-disconnect'
    )
    expect(createAgentApprovalIntentEdges([viewState], graph)).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({ label: '断开' }),
        source: 'agent:agent-1',
        target: 'group-app'
      })
    ])
  })

  it('treats a missing terminal connection as an unavailable approval target', () => {
    const approval = createConnectionApproval('missing-connection')

    expect(resolveAgentApprovalPresentation(approval, graph)).toMatchObject({
      status: 'missing',
      targetId: 'missing-connection',
      targetKind: 'connection'
    })
  })
})

function createApproval(target: AgentToolApprovalRequest['target']): AgentToolApprovalRequest {
  return {
    agentId: 'agent-1',
    approvalId: 'approval-1',
    projectDirectory: '/repo/app',
    sessionId: 'session-1',
    summary: '删除画布对象',
    target,
    toolName: target.kind === 'terminal_block' ? 'delete_block' : 'delete_terminal_group',
    workspaceId: 'main'
  }
}

function createConnectionApproval(connectionId: string): AgentToolApprovalPresentationRequest {
  return {
    agentId: 'agent-1',
    approvalId: 'approval-connection-1',
    projectDirectory: '/repo/app',
    sessionId: 'session-1',
    summary: `断开终端依赖 ${connectionId}`,
    target: { connectionId, kind: 'terminal_connection' },
    toolName: 'disconnect_terminal_blocks',
    workspaceId: 'main'
  }
}

const graph: BlockGraphSnapshot = {
  blocks: [
    {
      description: 'FastAPI 开发服务器',
      id: 'terminal-api',
      launchCommand: 'pnpm dev:api',
      name: 'Backend API',
      position: { x: 100, y: 100 },
      size: { height: 260, width: 420 },
      type: 'terminal'
    },
    {
      description: '管理后台',
      id: 'terminal-web',
      launchCommand: 'pnpm dev:web',
      name: 'Admin Web',
      position: { x: 560, y: 100 },
      size: { height: 260, width: 420 },
      type: 'terminal'
    }
  ],
  id: 'graph-1',
  projectId: 'project-1',
  connections: [
    {
      id: 'connection-api-web',
      sourceBlockId: 'terminal-api',
      targetBlockId: 'terminal-web'
    }
  ],
  terminalGroups: [
    {
      id: 'group-app',
      isCollapsed: true,
      memberBlockIds: ['terminal-api', 'terminal-web'],
      name: '启动项目',
      position: { x: 80, y: 80 },
      size: { height: 320, width: 920 },
      type: 'terminal-group'
    }
  ],
  viewport: { x: 0, y: 0, zoom: 1 },
  workspaceId: 'main'
}
