import type { AgentToolApprovalRequest } from '../../../src/contexts/agent/application/dto/AgentSessionProtocol'
import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import {
  createAgentApprovalIntentEdges,
  resolveAgentApprovalPresentation
} from '../../../src/presentation/app-shell/agentApprovalPresentation'

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
        data: expect.objectContaining({ label: 'AI 想删除' }),
        deletable: false,
        focusable: false,
        id: 'approval:approval-1',
        selectable: false,
        source: 'agent:agent-1',
        target: 'group-app',
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
    workspaceName: 'main'
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
  workspaceName: 'main'
}
