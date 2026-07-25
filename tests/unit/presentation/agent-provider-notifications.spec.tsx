import { render, screen } from '@testing-library/react'

import { NotificationProvider } from '../../../src/presentation/app-shell/NotificationProvider'
import type { AgentFeedbackEvent } from '../../../src/presentation/app-shell/agentProviderFeedback'
import { useAgentProviderNotifications } from '../../../src/presentation/app-shell/useAgentProviderNotifications'

describe('Agent Provider notifications', () => {
  it('notifies a newly observed issue once and resets the baseline when scope changes', () => {
    const { rerender } = render(
      <NotificationProvider>
        <NotificationHarness events={[]} scopeKey="workspace-a/agent-1" />
      </NotificationProvider>
    )

    rerender(
      <NotificationProvider>
        <NotificationHarness events={['mcp_unavailable']} scopeKey="workspace-a/agent-1" />
      </NotificationProvider>
    )
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('CleanCode MCP 当前不可用')

    rerender(
      <NotificationProvider>
        <NotificationHarness events={['mcp_unavailable']} scopeKey="workspace-a/agent-1" />
      </NotificationProvider>
    )
    expect(screen.getAllByRole('status')).toHaveLength(1)

    rerender(
      <NotificationProvider>
        <NotificationHarness events={['mcp_unavailable']} scopeKey="workspace-b/agent-1" />
      </NotificationProvider>
    )
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('treats the first snapshot as a quiet baseline', () => {
    render(
      <NotificationProvider>
        <NotificationHarness events={['binding_save_failed']} scopeKey="workspace-a/agent-1" />
      </NotificationProvider>
    )

    expect(screen.queryByText('对话仍可继续，但未能保存恢复信息')).not.toBeInTheDocument()
  })

  it('labels the two notifiable events without borrowing start failure wording', () => {
    const { rerender } = render(
      <NotificationProvider>
        <NotificationHarness events={[]} scopeKey="workspace-a/agent-1" />
      </NotificationProvider>
    )

    rerender(
      <NotificationProvider>
        <NotificationHarness
          events={['binding_save_failed', 'mcp_unavailable']}
          scopeKey="workspace-a/agent-1"
        />
      </NotificationProvider>
    )

    const notifications = screen.getAllByRole('status')
    expect(notifications).toHaveLength(2)
    expect(notifications.map((entry) => entry.textContent).join('\n')).not.toContain('启动失败')
    expect(screen.getByText('对话仍可继续，但未能保存恢复信息')).toBeInTheDocument()
    expect(
      screen.getByText('CleanCode MCP 当前不可用，Agent 仍可使用基础终端能力')
    ).toBeInTheDocument()
  })
})

function NotificationHarness({
  events,
  scopeKey
}: {
  readonly events: readonly AgentFeedbackEvent[]
  readonly scopeKey: string
}) {
  useAgentProviderNotifications({ events, scopeKey })
  return null
}
