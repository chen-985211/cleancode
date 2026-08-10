import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type {
  AgentTurnCompletedEvent,
  TerminalAgentActivitySnapshot
} from '../../../src/contexts/agent/application/dto/AgentActivityProtocol'
import { AgentActivityObserver } from '../../../src/presentation/app-shell/AgentActivityObserver'
import { I18nProvider } from '../../../src/presentation/app-shell/i18n/I18nProvider'
import { translate } from '../../../src/presentation/app-shell/i18n/messages'
import { useI18n } from '../../../src/presentation/app-shell/i18n/useI18n'
import { NotificationProvider } from '../../../src/presentation/app-shell/NotificationProvider'
import { useAgentActivitySnapshots } from '../../../src/presentation/app-shell/useAgentActivitySnapshots'

describe('Agent activity notifications', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'cleancode', { configurable: true, value: undefined })
  })

  it('keeps the baseline quiet, updates global state, and publishes retained semantic messages', async () => {
    const baseline = createSnapshot({ revision: 1, status: 'waiting_input' })
    const runtime = installAgentActivityRuntime([baseline])
    const { unmount } = renderObserver()

    await waitFor(() =>
      expect(screen.getByTestId('agent-activity')).toHaveTextContent('waiting_input')
    )

    expect(screen.queryByText('Agent 正在等待输入')).not.toBeInTheDocument()

    act(() => runtime.emitActivity(createSnapshot({ revision: 2, status: 'working' })))

    expect(screen.getByTestId('agent-activity')).toHaveTextContent('working')
    expect(screen.queryByRole('status')).toBeNull()

    act(() => runtime.emitActivity(createSnapshot({ revision: 3, status: 'waiting_approval' })))

    const attentionNotification = screen.getByRole('status')
    expect(attentionNotification).toHaveTextContent('Agent 正在等待审批')
    expect(attentionNotification).toHaveTextContent('Agent · main')

    act(() => runtime.emitActivity(createSnapshot({ revision: 3, status: 'waiting_approval' })))
    expect(screen.getAllByRole('status')).toHaveLength(1)

    act(() =>
      runtime.emitCompletion(
        createCompletion({
          completionId: 'completion-1',
          invocationId: 'invocation-b',
          terminalRevision: 3
        })
      )
    )

    expect(screen.getAllByRole('status')).toHaveLength(2)
    const completionNotification = screen
      .getByText('Agent 已完成本轮回答')
      .closest('[role="status"]')
    expect(completionNotification).not.toBeNull()
    expect(completionNotification).not.toBe(attentionNotification)
    expect(completionNotification).toHaveTextContent('Provider Neutral · main')
    expect(
      screen.getByRole('button', {
        name: '关闭“Agent 已完成本轮回答 — Provider Neutral · main”通知'
      })
    ).toBeInTheDocument()

    act(() =>
      runtime.emitCompletion(
        createCompletion({
          completionId: 'completion-1',
          invocationId: 'invocation-b',
          terminalRevision: 3
        })
      )
    )
    expect(screen.getAllByRole('status')).toHaveLength(2)

    act(() => runtime.emitActivity(createSnapshot({ revision: 4, status: 'idle' })))

    expect(screen.getByTestId('agent-activity')).toHaveTextContent('idle')
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toBe(completionNotification)
    expect(attentionNotification).toHaveAttribute('data-surface-motion-state', 'closing')

    unmount()
    expect(runtime.unsubscribeActivity).toHaveBeenCalledOnce()
    expect(runtime.unsubscribeCompletion).toHaveBeenCalledOnce()
  })

  it('queues live events until the baseline snapshot is established', async () => {
    let resolveBaseline: ((snapshots: readonly TerminalAgentActivitySnapshot[]) => void) | undefined
    const baseline = new Promise<readonly TerminalAgentActivitySnapshot[]>((resolve) => {
      resolveBaseline = resolve
    })
    const runtime = installAgentActivityRuntime(baseline)
    renderObserver()

    expect(runtime.onActivityChanged).toHaveBeenCalledOnce()
    expect(runtime.onTurnCompleted).toHaveBeenCalledOnce()
    expect(runtime.listAgentActivities).toHaveBeenCalledOnce()

    act(() => runtime.emitActivity(createSnapshot({ revision: 2, status: 'waiting_input' })))
    expect(screen.queryByText('Agent 正在等待输入')).not.toBeInTheDocument()

    await act(async () => {
      resolveBaseline?.([createSnapshot({ revision: 1, status: 'idle' })])
      await baseline
    })

    expect(screen.getByTestId('agent-activity')).toHaveTextContent('waiting_input')
    expect(screen.getByRole('status')).toHaveTextContent('Agent 正在等待输入')
  })

  it('notifies a queued waiting fact even when the baseline already contains its revision', async () => {
    let resolveBaseline: ((snapshots: readonly TerminalAgentActivitySnapshot[]) => void) | undefined
    const baseline = new Promise<readonly TerminalAgentActivitySnapshot[]>((resolve) => {
      resolveBaseline = resolve
    })
    const runtime = installAgentActivityRuntime(baseline)
    renderObserver()
    const waiting = createSnapshot({ revision: 2, status: 'waiting_input' })

    act(() => runtime.emitActivity(waiting))
    expect(screen.queryByText('Agent 正在等待输入')).not.toBeInTheDocument()

    await act(async () => {
      resolveBaseline?.([waiting])
      await baseline
    })

    expect(screen.getByTestId('agent-activity')).toHaveTextContent('waiting_input')
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('Agent 正在等待输入')
  })

  it('replays a queued completion that cannot be represented by the baseline snapshot', async () => {
    let resolveBaseline: ((snapshots: readonly TerminalAgentActivitySnapshot[]) => void) | undefined
    const baseline = new Promise<readonly TerminalAgentActivitySnapshot[]>((resolve) => {
      resolveBaseline = resolve
    })
    const runtime = installAgentActivityRuntime(baseline)
    renderObserver()

    act(() =>
      runtime.emitCompletion(
        createCompletion({ completionId: 'queued-completion', terminalRevision: 2 })
      )
    )
    expect(screen.queryByText('Agent 已完成本轮回答')).not.toBeInTheDocument()

    await act(async () => {
      resolveBaseline?.([createSnapshot({ revision: 5, status: 'working' })])
      await baseline
    })

    expect(screen.getByTestId('agent-activity')).toHaveTextContent('working')
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('Agent 已完成本轮回答')
  })

  it('identifies the Agent source and retranslates a retained notification on locale change', async () => {
    const runtime = installAgentActivityRuntime([createSnapshot({ revision: 1, status: 'idle' })])
    renderObserver()

    await waitFor(() => expect(screen.getByTestId('agent-activity')).toHaveTextContent('idle'))
    act(() =>
      runtime.emitCompletion(
        createCompletion({
          agentName: 'Agent 6',
          completionId: 'completion-localized',
          providerId: 'codex',
          terminalRevision: 1
        })
      )
    )

    expect(screen.getByRole('status')).toHaveTextContent('Agent 已完成本轮回答')
    expect(screen.getByRole('status')).toHaveTextContent('Agent 6 · Codex · main')

    fireEvent.click(screen.getByRole('button', { name: 'Switch to English' }))

    expect(screen.getByRole('status')).toHaveTextContent('Agent finished this turn')
    expect(screen.getByRole('status')).toHaveTextContent('Agent 6 · Codex · main')
    expect(screen.getByText('Agent 已完成本轮回答')).toHaveAttribute('aria-hidden', 'true')
  })

  it('updates a waiting card source after rename without creating or reviving an occurrence', async () => {
    const runtime = installAgentActivityRuntime([createSnapshot({ revision: 1, status: 'idle' })])
    renderObserver()

    await waitFor(() => expect(screen.getByTestId('agent-activity')).toHaveTextContent('idle'))
    act(() =>
      runtime.emitActivity(
        createSnapshot({ agentName: 'Agent 1', revision: 2, status: 'waiting_input' })
      )
    )
    const notification = screen.getByRole('status')
    expect(notification).toHaveTextContent('Agent 1 · Codex · main')

    act(() =>
      runtime.emitActivity(
        createSnapshot({ agentName: 'Renamed Agent', revision: 3, status: 'waiting_input' })
      )
    )
    expect(screen.getAllByRole('status')).toEqual([notification])
    expect(notification).toHaveTextContent('Renamed Agent · Codex · main')

    fireEvent.click(
      screen.getByRole('button', {
        name: '关闭“Agent 正在等待输入 — Renamed Agent · Codex · main”通知'
      })
    )
    expect(screen.queryByRole('status')).toBeNull()

    act(() =>
      runtime.emitActivity(
        createSnapshot({ agentName: 'Final Agent', revision: 4, status: 'waiting_input' })
      )
    )
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('provides matching English notification copy', () => {
    expect(translate('en', 'agentActivity.turnCompleted')).toBe('Agent finished this turn')
    expect(translate('en', 'agentActivity.waitingInput')).toBe('Agent is waiting for input')
    expect(translate('en', 'agentActivity.waitingApproval')).toBe('Agent is waiting for approval')
  })
})

function renderObserver() {
  return render(
    <I18nProvider initialLocale="zh-CN">
      <NotificationProvider>
        <AgentActivityObserver>
          <LocaleSwitcher />
          <AgentActivityProbe />
        </AgentActivityObserver>
      </NotificationProvider>
    </I18nProvider>
  )
}

function LocaleSwitcher() {
  const { selectLocale } = useI18n()
  return (
    <button type="button" onClick={() => selectLocale('en')}>
      Switch to English
    </button>
  )
}

function AgentActivityProbe() {
  const snapshots = useAgentActivitySnapshots()
  return <div data-testid="agent-activity">{snapshots.map(({ status }) => status).join(',')}</div>
}

function installAgentActivityRuntime(
  baseline:
    readonly TerminalAgentActivitySnapshot[] | Promise<readonly TerminalAgentActivitySnapshot[]>
) {
  let activityListener: ((snapshot: TerminalAgentActivitySnapshot) => void) | undefined
  let completionListener: ((completion: AgentTurnCompletedEvent) => void) | undefined
  const unsubscribeActivity = vi.fn()
  const unsubscribeCompletion = vi.fn()
  const listAgentActivities = vi.fn(async () => baseline)
  const onActivityChanged = vi.fn((listener: (snapshot: TerminalAgentActivitySnapshot) => void) => {
    activityListener = listener
    return unsubscribeActivity
  })
  const onTurnCompleted = vi.fn((listener: (completion: AgentTurnCompletedEvent) => void) => {
    completionListener = listener
    return unsubscribeCompletion
  })

  Object.defineProperty(window, 'cleancode', {
    configurable: true,
    value: {
      appName: 'cleancode',
      listAgentActivities,
      onAgentActivityChanged: onActivityChanged,
      onAgentTurnCompleted: onTurnCompleted
    }
  })

  return {
    emitActivity: (snapshot: TerminalAgentActivitySnapshot) => activityListener?.(snapshot),
    emitCompletion: (completion: AgentTurnCompletedEvent) => completionListener?.(completion),
    listAgentActivities,
    onActivityChanged,
    onTurnCompleted,
    unsubscribeActivity,
    unsubscribeCompletion
  }
}

function createSnapshot({
  agentName,
  revision,
  status
}: {
  readonly agentName?: string
  readonly revision: number
  readonly status: TerminalAgentActivitySnapshot['status']
}): TerminalAgentActivitySnapshot {
  return {
    invocations: [
      {
        invocationId: 'invocation-1',
        ...(agentName
          ? {
              managed: {
                agentId: 'agent-1',
                agentName,
                agentSessionId: 'agent-session-1',
                providerLaunchGeneration: 1
              }
            }
          : {}),
        providerId: agentName ? 'codex' : 'agent',
        status
      }
    ],
    revision,
    status,
    terminal: {
      blockId: 'terminal-1',
      generation: 1,
      gitBranch: 'main',
      owner: { id: 'terminal-1', kind: 'block' },
      projectDirectory: '/tmp/project',
      projectId: 'project-1',
      runId: 'run-1',
      sessionId: 'session-1',
      workspaceDirectory: '/tmp/project',
      workspaceId: 'workspace-1'
    }
  }
}

function createCompletion({
  agentName,
  completionId,
  invocationId = 'invocation-1',
  providerId = 'provider-neutral',
  terminalRevision
}: {
  readonly agentName?: string
  readonly completionId: string
  readonly invocationId?: string
  readonly providerId?: string
  readonly terminalRevision: number
}): AgentTurnCompletedEvent {
  return {
    completedAt: 1_000,
    completionId,
    identity: {
      invocationId,
      ...(agentName
        ? {
            managed: {
              agentId: 'agent-6',
              agentName,
              agentSessionId: 'agent-session-6',
              providerLaunchGeneration: 1
            }
          }
        : {}),
      providerId,
      terminal: createSnapshot({ revision: terminalRevision, status: 'idle' }).terminal
    },
    reason: 'reported',
    terminalRevision
  }
}
