import { fireEvent, render, screen, within } from '@testing-library/react'

import type { AgentToolApprovalRequest } from '../../../src/contexts/agent/application/dto/AgentSessionProtocol'
import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { AgentToolApprovalCard } from '../../../src/presentation/app-shell/AgentToolApprovalCard'
import { resolveAgentApprovalPresentation } from '../../../src/presentation/app-shell/projections/agentApprovalPresentation'
import type { AgentToolApprovalPresentationRequest } from '../../../src/presentation/app-shell/agentToolApprovalTypes'

describe('Agent tool approval card', () => {
  it('names the terminal, its group, and the real deletion impact', () => {
    const onApprove = vi.fn()
    const onLocate = vi.fn()
    const onReject = vi.fn()
    const presentation = resolveAgentApprovalPresentation(
      createApproval({ blockId: 'terminal-api', kind: 'terminal_block' }),
      graph
    )

    render(
      <AgentToolApprovalCard
        presentation={presentation}
        queueCount={2}
        onApprove={onApprove}
        onDismiss={vi.fn()}
        onLocate={onLocate}
        onReject={onReject}
      />
    )

    expect(screen.getByText('需要你的确认')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '删除终端' })).toBeInTheDocument()
    expect(screen.getByText('Backend API')).toBeInTheDocument()
    expect(screen.getByText('FastAPI 开发服务器')).toBeInTheDocument()
    expect(screen.getByText('位于组合「启动项目」')).toBeInTheDocument()
    expect(screen.getByText('ID terminal-api')).toBeInTheDocument()
    expect(screen.getByText(/从画布删除此终端及相关连线/)).toBeInTheDocument()
    expect(screen.getByText('1 / 3')).toHaveAccessibleName('当前第 1 个，共 3 个审批请求')

    const target = screen.getByRole('group', { name: '审批目标 Backend API' })
    fireEvent.click(within(target).getByRole('button', { name: '在画布中查看 Backend API' }))
    fireEvent.click(screen.getByRole('button', { name: '保留终端' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    expect(onLocate).toHaveBeenCalledOnce()
    expect(onReject).toHaveBeenCalledOnce()
    expect(onApprove).toHaveBeenCalledOnce()
  })

  it('shows deterministic progress and missing-target states', () => {
    const request = createApproval({ blockId: 'missing-terminal', kind: 'terminal_block' })
    const { rerender } = render(
      <AgentToolApprovalCard
        presentation={resolveAgentApprovalPresentation({ phase: 'awaiting', request }, graph)}
        queueCount={0}
        onApprove={vi.fn()}
        onDismiss={vi.fn()}
        onLocate={vi.fn()}
        onReject={vi.fn()}
      />
    )

    expect(screen.getByText('目标已不在当前画布中')).toBeInTheDocument()
    expect(screen.getByText('目标不可用')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认删除' })).toBeDisabled()

    rerender(
      <AgentToolApprovalCard
        presentation={resolveAgentApprovalPresentation(
          {
            phase: 'approving',
            request: createApproval({ blockId: 'terminal-api', kind: 'terminal_block' })
          },
          graph
        )}
        queueCount={0}
        onApprove={vi.fn()}
        onDismiss={vi.fn()}
        onLocate={vi.fn()}
        onReject={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: '正在删除…' })).toBeDisabled()
  })

  it('explains that dissolving a group preserves its terminals and connections', () => {
    const presentation = resolveAgentApprovalPresentation(
      createApproval({ kind: 'terminal_group', terminalGroupId: 'group-app' }),
      graph
    )

    render(
      <AgentToolApprovalCard
        presentation={presentation}
        queueCount={0}
        onApprove={vi.fn()}
        onDismiss={vi.fn()}
        onLocate={vi.fn()}
        onReject={vi.fn()}
      />
    )

    expect(screen.getByText('需要你的确认')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '解散终端组合' })).toBeInTheDocument()
    expect(screen.getByText('2 个终端：Backend API、Admin Web')).toBeInTheDocument()
    expect(screen.getByText('只解散组合，保留其中终端及现有连线。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认解散' })).toBeInTheDocument()
  })

  it('names both terminal connection endpoints and the exact disconnection impact', () => {
    const onApprove = vi.fn()
    const onLocate = vi.fn()
    const onReject = vi.fn()
    const connectionId = '019f6eb0-c44b-7220-b47c-0da440bb95ec'
    const presentation = resolveAgentApprovalPresentation(createConnectionApproval(connectionId), {
      ...graph,
      connections: [
        {
          id: connectionId,
          sourceBlockId: 'terminal-api',
          targetBlockId: 'terminal-web'
        }
      ]
    })

    render(
      <AgentToolApprovalCard
        presentation={presentation}
        queueCount={0}
        onApprove={onApprove}
        onDismiss={vi.fn()}
        onLocate={onLocate}
        onReject={onReject}
      />
    )

    expect(screen.getByRole('heading', { name: '断开终端依赖' })).toBeInTheDocument()
    expect(screen.getByText('上游终端')).toBeInTheDocument()
    expect(screen.getByText('Backend API')).toBeInTheDocument()
    expect(screen.getByText('ID terminal-api')).toBeInTheDocument()
    expect(screen.getByText('下游终端')).toBeInTheDocument()
    expect(screen.getByText('Admin Web')).toBeInTheDocument()
    expect(screen.getByText('ID terminal-web')).toBeInTheDocument()
    expect(screen.getByText(`连接 ID ${connectionId}`)).toBeInTheDocument()
    expect(
      screen.getByText('只断开这条依赖，保留两端终端、启动命令、执行配置和组合。')
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '在画布中查看 Backend API 到 Admin Web' }))
    fireEvent.click(screen.getByRole('button', { name: '保留依赖' }))
    fireEvent.click(screen.getByRole('button', { name: '确认断开' }))
    expect(onLocate).toHaveBeenCalledOnce()
    expect(onReject).toHaveBeenCalledOnce()
    expect(onApprove).toHaveBeenCalledOnce()
  })

  it('keeps connection actions explicit when the dependency no longer exists', () => {
    const presentation = resolveAgentApprovalPresentation(
      createConnectionApproval('missing-connection'),
      graph
    )

    render(
      <AgentToolApprovalCard
        presentation={presentation}
        queueCount={0}
        onApprove={vi.fn()}
        onDismiss={vi.fn()}
        onLocate={vi.fn()}
        onReject={vi.fn()}
      />
    )

    expect(screen.getByRole('heading', { name: '断开终端依赖' })).toBeInTheDocument()
    expect(screen.getByText('ID missing-connection')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保留依赖' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '确认断开' })).toBeDisabled()
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
      isCollapsed: false,
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
