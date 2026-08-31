import { render, screen } from '@testing-library/react'

import { NotificationProvider } from '../../../src/presentation/app-shell/NotificationProvider'
import { useNotifications } from '../../../src/presentation/app-shell/useNotifications'
import type { AgentFeedbackEvent } from '../../../src/contexts/agent/presentation/view-models/agentProviderFeedback'
import { useAgentProviderNotifications } from '../../../src/contexts/agent/presentation/view-models/useAgentProviderNotifications'

describe('Agent Provider notifications', () => {
  it('notifies a newly observed binding issue once and resets the baseline when scope changes', () => {
    const { rerender } = render(
      <NotificationProvider>
        <NotificationHarness events={[]} scopeKey="workspace-a/agent-1" />
      </NotificationProvider>
    )

    rerender(
      <NotificationProvider>
        <NotificationHarness events={['binding_save_failed']} scopeKey="workspace-a/agent-1" />
      </NotificationProvider>
    )
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('未能保存恢复信息')
    expect(screen.getByRole('status')).toHaveClass('notification-card--uniform')

    rerender(
      <NotificationProvider>
        <NotificationHarness events={['binding_save_failed']} scopeKey="workspace-a/agent-1" />
      </NotificationProvider>
    )
    expect(screen.getAllByRole('status')).toHaveLength(1)

    rerender(
      <NotificationProvider>
        <NotificationHarness events={['binding_save_failed']} scopeKey="workspace-b/agent-1" />
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

  it('labels the notifiable binding event without borrowing start failure wording', () => {
    const { rerender } = render(
      <NotificationProvider>
        <NotificationHarness events={[]} scopeKey="workspace-a/agent-1" />
      </NotificationProvider>
    )

    rerender(
      <NotificationProvider>
        <NotificationHarness events={['binding_save_failed']} scopeKey="workspace-a/agent-1" />
      </NotificationProvider>
    )

    const notifications = screen.getAllByRole('status')
    expect(notifications).toHaveLength(1)
    expect(notifications.map((entry) => entry.textContent).join('\n')).not.toContain('启动失败')
    expect(screen.getByText('对话仍可继续，但未能保存恢复信息')).toBeInTheDocument()
  })
})

function NotificationHarness({
  events,
  scopeKey
}: {
  readonly events: readonly AgentFeedbackEvent[]
  readonly scopeKey: string
}) {
  const notifications = useNotifications()
  useAgentProviderNotifications({ events, notifications, scopeKey })
  return null
}
