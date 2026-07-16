import { fireEvent, render, screen } from '@testing-library/react'

import type { AgentToolApprovalRequest } from '../../../src/contexts/agent/application/dto/AgentSessionProtocol'
import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { AgentToolApprovalCard } from '../../../src/presentation/app-shell/AgentToolApprovalCard'
import { resolveAgentApprovalPresentation } from '../../../src/presentation/app-shell/agentApprovalPresentation'

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

    expect(screen.getByRole('heading', { name: '删除终端？' })).toBeInTheDocument()
    expect(screen.getByText('Backend API')).toBeInTheDocument()
    expect(screen.getByText('FastAPI 开发服务器')).toBeInTheDocument()
    expect(screen.getByText('位于组合「启动项目」')).toBeInTheDocument()
    expect(screen.getByText(/从画布删除此终端及相关连线/)).toBeInTheDocument()
    expect(screen.getByText('另有 2 个请求等待处理')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '在画布中查看 Backend API' }))
    fireEvent.click(screen.getByRole('button', { name: '保留终端' }))
    fireEvent.click(screen.getByRole('button', { name: '删除终端' }))
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
    expect(screen.getByRole('button', { name: '删除终端' })).toBeDisabled()

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
    expect(screen.getByRole('button', { name: '删除中…' })).toBeDisabled()
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

    expect(screen.getByRole('heading', { name: '解散组合？' })).toBeInTheDocument()
    expect(screen.getByText('2 个终端：Backend API、Admin Web')).toBeInTheDocument()
    expect(screen.getByText('只解散组合，保留其中终端及现有连线。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '解散组合' })).toBeInTheDocument()
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
      isCollapsed: false,
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
