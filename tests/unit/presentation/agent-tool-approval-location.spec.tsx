import { act, renderHook } from '@testing-library/react'
import type { Edge, ReactFlowInstance } from '@xyflow/react'

import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { AgentToolApprovalPresentationRequest } from '../../../src/presentation/app-shell/agentToolApprovalTypes'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types'
import { useAgentToolApprovals } from '../../../src/presentation/app-shell/useAgentToolApprovals'
import { createRuntimeApi } from '../../fixtures/presentation/appShellFixtures'

describe('Agent connection approval location', () => {
  afterEach(() => {
    Object.defineProperty(window, 'cleancode', { configurable: true, value: undefined })
  })

  it('fits the Agent and both visible connection endpoints without changing selection', () => {
    const visibleNodes = new Map([
      ['agent:agent-1', createFlowNode('agent:agent-1')],
      ['group-source', createFlowNode('group-source')],
      ['group-target', createFlowNode('group-target')]
    ])
    const getNode = vi.fn((nodeId: string) => visibleNodes.get(nodeId))
    const fitView = vi.fn(async () => undefined)
    const reactFlowInstance = { fitView, getNode } as unknown as ReactFlowInstance<
      WorkbenchFlowNode,
      Edge
    >
    const { result } = renderHook(() =>
      useAgentToolApprovals({
        graph,
        projectDirectory: '/repo/app',
        reactFlowInstanceRef: { current: reactFlowInstance },
        setCurrentGraph: vi.fn(),
        workspaceId: 'main'
      })
    )

    act(() => result.current.locate(connectionApproval))

    expect(getNode.mock.calls.map(([nodeId]) => nodeId)).toEqual([
      'agent:agent-1',
      'group-source',
      'group-target'
    ])
    expect(fitView).toHaveBeenCalledWith({
      duration: 220,
      ease: expect.any(Function),
      interpolate: 'smooth',
      nodes: [
        visibleNodes.get('agent:agent-1'),
        visibleNodes.get('group-source'),
        visibleNodes.get('group-target')
      ],
      padding: 0.24
    })
  })

  it('retains the approval card when an approved tool returns a structured failure', async () => {
    let approvalListener: ((request: AgentToolApprovalPresentationRequest) => void) | null = null
    const approveAgentTool = vi.fn(async () => ({
      error: {
        code: 'TERMINAL_CONNECTION_NOT_FOUND',
        isExpected: true,
        message: 'Terminal connection no longer exists.'
      },
      status: 'failed' as const
    }))
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        approveAgentTool,
        onAgentToolApprovalRequested: vi.fn((listener) => {
          approvalListener = listener
          return vi.fn()
        })
      })
    })
    const { result } = renderHook(() =>
      useAgentToolApprovals({
        graph,
        projectDirectory: '/repo/app',
        reactFlowInstanceRef: { current: null },
        setCurrentGraph: vi.fn(),
        workspaceId: 'main'
      })
    )

    act(() => approvalListener?.(connectionApproval))
    await act(async () => result.current.approve(connectionApproval))

    expect(approveAgentTool).toHaveBeenCalledWith({ approvalId: 'approval-connection-1' })
    expect(result.current.approvals).toEqual([
      {
        errorMessage: '操作未完成：Terminal connection no longer exists.',
        phase: 'failed',
        request: connectionApproval
      }
    ])
  })
})

function createFlowNode(id: string): WorkbenchFlowNode {
  return { data: {}, id, position: { x: 0, y: 0 }, type: 'terminal' } as WorkbenchFlowNode
}

const connectionApproval: AgentToolApprovalPresentationRequest = {
  agentId: 'agent-1',
  approvalId: 'approval-connection-1',
  projectDirectory: '/repo/app',
  sessionId: 'session-1',
  summary: '断开终端依赖 connection-a-b',
  target: { connectionId: 'connection-a-b', kind: 'terminal_connection' },
  toolName: 'disconnect_terminal_blocks',
  workspaceId: 'main'
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
  terminalGroups: [
    {
      id: 'group-source',
      isCollapsed: true,
      memberBlockIds: ['terminal-a', 'terminal-helper-a'],
      name: 'Source services',
      position: { x: 0, y: 0 },
      size: { height: 300, width: 800 },
      type: 'terminal-group'
    },
    {
      id: 'group-target',
      isCollapsed: true,
      memberBlockIds: ['terminal-b', 'terminal-helper-b'],
      name: 'Target services',
      position: { x: 900, y: 0 },
      size: { height: 300, width: 800 },
      type: 'terminal-group'
    }
  ],
  viewport: { x: 0, y: 0, zoom: 1 },
  workspaceId: 'main'
}
