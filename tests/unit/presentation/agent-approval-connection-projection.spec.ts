import type { Edge } from '@xyflow/react'

import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { projectAgentConnectionApprovalsOntoWorkflowEdges } from '../../../src/presentation/app-shell/projections/agentApprovalConnectionProjection'
import type {
  AgentToolApprovalPresentationRequest,
  AgentToolApprovalViewState
} from '../../../src/presentation/app-shell/workbench/nodes/agent/agentToolApprovalTypes'

describe('Agent connection approval edge projection', () => {
  it('highlights the real workflow edge without replacing its persistent identity', () => {
    const workflowEdge: Edge = {
      className: 'terminal-workflow-edge terminal-workflow-edge--active',
      deletable: true,
      id: 'connection-a-b',
      source: 'terminal-a',
      target: 'terminal-b'
    }

    expect(
      projectAgentConnectionApprovalsOntoWorkflowEdges(
        [workflowEdge],
        [createApproval('connection-a-b')],
        graph
      )
    ).toEqual([
      expect.objectContaining({
        className: expect.stringContaining('terminal-workflow-edge--approval-target'),
        deletable: true,
        id: 'connection-a-b',
        source: 'terminal-a',
        target: 'terminal-b'
      })
    ])
  })

  it('creates a non-interactive proxy edge between different collapsed groups', () => {
    const collapsedGraph = {
      ...graph,
      terminalGroups: [
        createGroup('group-source', ['terminal-a', 'terminal-helper-a']),
        createGroup('group-target', ['terminal-b', 'terminal-helper-b'])
      ]
    } satisfies BlockGraphSnapshot

    expect(
      projectAgentConnectionApprovalsOntoWorkflowEdges(
        [],
        [createApproval('connection-a-b')],
        collapsedGraph
      )
    ).toEqual([
      expect.objectContaining({
        className: expect.stringContaining('terminal-workflow-edge--approval-proxy'),
        deletable: false,
        focusable: false,
        id: 'approval:connection:approval-connection-1',
        reconnectable: false,
        selectable: false,
        source: 'group-source',
        sourceHandle: 'agent-approval-connection-source',
        target: 'group-target',
        targetHandle: 'agent-approval-connection-target'
      })
    ])
  })

  it('does not create a misleading self-loop when both endpoints share one collapsed group', () => {
    const collapsedGraph = {
      ...graph,
      terminalGroups: [createGroup('group-shared', ['terminal-a', 'terminal-b'])]
    } satisfies BlockGraphSnapshot

    expect(
      projectAgentConnectionApprovalsOntoWorkflowEdges(
        [],
        [createApproval('connection-a-b')],
        collapsedGraph
      )
    ).toEqual([])
  })

  it('keeps a failed approval visibly distinct on the real connection', () => {
    const [edge] = projectAgentConnectionApprovalsOntoWorkflowEdges(
      [{ id: 'connection-a-b', source: 'terminal-a', target: 'terminal-b' }],
      [createApproval('connection-a-b', 'failed')],
      graph
    )

    expect(edge.className).toContain('terminal-workflow-edge--approval-failed')
  })
})

function createApproval(
  connectionId: string,
  phase: AgentToolApprovalViewState['phase'] = 'awaiting'
): AgentToolApprovalViewState {
  const request: AgentToolApprovalPresentationRequest = {
    agentId: 'agent-1',
    approvalId: 'approval-connection-1',
    projectDirectory: '/repo/app',
    sessionId: 'session-1',
    summary: `断开终端依赖 ${connectionId}`,
    target: { connectionId, kind: 'terminal_connection' },
    toolName: 'disconnect_terminal_blocks',
    workspaceId: 'main'
  }

  return { phase, request }
}

function createGroup(id: string, memberBlockIds: readonly string[]) {
  return {
    id,
    isCollapsed: true,
    memberBlockIds,
    name: id,
    position: { x: 0, y: 0 },
    size: { height: 300, width: 800 },
    type: 'terminal-group' as const
  }
}

const graph: BlockGraphSnapshot = {
  blocks: ['a', 'b', 'helper-a', 'helper-b'].map((suffix, index) => ({
    description: '',
    id: `terminal-${suffix}`,
    launchCommand: `run-${suffix}`,
    name: `Terminal ${suffix}`,
    position: { x: index * 440, y: 0 },
    size: { height: 260, width: 420 },
    type: 'terminal' as const
  })),
  connections: [
    {
      id: 'connection-a-b',
      sourceBlockId: 'terminal-a',
      targetBlockId: 'terminal-b'
    }
  ],
  id: 'graph-1',
  projectId: 'project-1',
  terminalGroups: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  workspaceId: 'main'
}
