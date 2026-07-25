import { fireEvent, render, screen } from '@testing-library/react'

import {
  AgentProviderBlockingState,
  AgentProviderStatusControl
} from '../../../src/presentation/app-shell/AgentProviderStatusView'

describe('Agent Provider runtime status', () => {
  it('keeps the header quiet when no persistent Agent issue exists', () => {
    const { container } = render(
      <AgentProviderStatusControl
        agentName="Agent 1"
        issues={[]}
        providerName="Codex"
        state={installedState}
      />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('aggregates persistent issues behind one compact header control', () => {
    render(
      <AgentProviderStatusControl
        agentName="Agent 1"
        issues={['binding_save_failed', 'session_ended']}
        providerName="OpenCode"
        state={installedState}
      />
    )

    expect(screen.queryByText('对话仍可继续，但未能保存恢复信息')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Agent 1 有 2 个状态需要处理' }))

    const panel = screen.getByRole('dialog', { name: 'Agent 1 状态' })
    expect(panel).toHaveFocus()
    expect(panel).toHaveTextContent('对话仍可继续，但未能保存恢复信息')
    expect(panel).toHaveTextContent('OpenCode 会话已结束')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Agent 1 有 2 个状态需要处理' })).toHaveFocus()
  })

  it('keeps session recovery actions in the Agent status panel', () => {
    const onRestart = vi.fn()
    const onNewConversation = vi.fn()
    render(
      <AgentProviderStatusControl
        agentName="Agent 1"
        issues={['session_ended']}
        onNewConversation={onNewConversation}
        onRestart={onRestart}
        providerName="Codex"
        state={installedState}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Agent 1 有 1 个状态需要处理' }))
    fireEvent.click(screen.getByRole('button', { name: '重新启动 Agent' }))
    expect(onRestart).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Agent 1 有 1 个状态需要处理' }))
    fireEvent.click(screen.getByRole('button', { name: '新对话' }))
    expect(onNewConversation).toHaveBeenCalledOnce()
  })

  it('describes an interrupted session without claiming it failed to start', () => {
    const onRestart = vi.fn()
    render(
      <AgentProviderStatusControl
        agentName="Agent 1"
        issues={['session_interrupted']}
        onNewConversation={vi.fn()}
        onRestart={onRestart}
        providerName="Codex"
        state={installedState}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Agent 1 有 1 个状态需要处理' }))
    const panel = screen.getByRole('dialog', { name: 'Agent 1 状态' })
    expect(panel).toHaveTextContent('Codex 会话已中断')
    expect(panel).not.toHaveTextContent('启动失败')

    fireEvent.click(screen.getByRole('button', { name: '重新启动 Agent' }))
    expect(onRestart).toHaveBeenCalledOnce()
  })

  it('still reports a terminal that never started as a start failure', () => {
    render(
      <AgentProviderStatusControl
        agentName="Agent 1"
        issues={['terminal_failed']}
        providerName="Codex"
        state={installedState}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Agent 1 有 1 个状态需要处理' }))
    expect(screen.getByRole('dialog', { name: 'Agent 1 状态' })).toHaveTextContent(
      'Codex 会话启动失败'
    )
  })

  it('uses an actionable terminal empty state when the Provider cannot start', () => {
    render(
      <AgentProviderBlockingState
        blocking="provider_upgrade_required"
        onRetryAttachment={vi.fn()}
        onRetryInspection={vi.fn()}
        providerName="Claude Code"
        state={{
          availability: {
            installCommand: 'install claude',
            minimumVersion: '2.1.119',
            providerId: 'claude-code',
            status: 'upgrade_required',
            version: '2.1.118'
          },
          status: 'ready'
        }}
      />
    )

    const state = screen.getByRole('status')
    expect(state).toHaveTextContent('请将 Claude Code CLI 更新到 2.1.119 或更高版本')
    expect(screen.getByRole('button', { name: '重新检查 Claude Code CLI' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '安装帮助' })).toBeInTheDocument()
  })
})

const installedState = {
  availability: {
    providerId: 'example',
    status: 'installed' as const,
    version: '1.0.0'
  },
  status: 'ready' as const
}
