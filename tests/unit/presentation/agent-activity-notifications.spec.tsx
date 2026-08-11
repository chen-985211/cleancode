import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type {
  AgentTurnCompletedEvent,
  TerminalAgentActivitySnapshot
} from '../../../src/contexts/agent/application/dto/AgentActivityProtocol'
import type { AgentProviderDescriptor } from '../../../src/contexts/agent/application/ports/AgentProviderContribution'
import { AgentActivityObserver } from '../../../src/presentation/app-shell/AgentActivityObserver'
import type { AgentActivityNavigationTarget } from '../../../src/presentation/app-shell/agentActivityNavigation'
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

    expect(screen.queryByText('Agent 等待输入')).not.toBeInTheDocument()

    act(() => runtime.emitActivity(createSnapshot({ revision: 2, status: 'working' })))

    expect(screen.getByTestId('agent-activity')).toHaveTextContent('working')
    expect(screen.queryByRole('status')).toBeNull()

    act(() => runtime.emitActivity(createSnapshot({ revision: 3, status: 'waiting_approval' })))

    const attentionNotification = screen.getByRole('status')
    expect(attentionNotification).toHaveTextContent('Agent 等待审批')
    expect(attentionNotification).toHaveTextContent('project · main')
    expect(attentionNotification).not.toHaveTextContent('/tmp/project')
    expect(attentionNotification).not.toHaveTextContent('Agent · main')
    expect(attentionNotification).toHaveAccessibleName('Agent 等待审批 — Agent — project · main')
    expect(attentionNotification).toHaveClass('notification-card--uniform')

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
    const completionNotification = screen.getByLabelText('本轮已完成').closest('[role="status"]')
    expect(completionNotification).not.toBeNull()
    expect(completionNotification).not.toBe(attentionNotification)
    expect(completionNotification).toHaveTextContent('Agent')
    expect(completionNotification).toHaveTextContent('project · main')
    expect(completionNotification).not.toHaveTextContent('已回复')
    expect(completionNotification).not.toHaveTextContent('/tmp/project')
    expect(completionNotification).not.toHaveTextContent('Provider Neutral')
    expect(completionNotification).toHaveAccessibleName(
      'Agent — 本轮已完成 — Provider Neutral — project · main'
    )
    expect(completionNotification).toHaveClass('notification-card--uniform')
    expect(completionNotification?.querySelector('.agent-provider-icon')).not.toBeNull()
    expect(
      screen.getByRole('button', {
        name: '关闭“Agent — 本轮已完成 — Provider Neutral — project · main”通知'
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
    expect(screen.queryByText('Agent 等待输入')).not.toBeInTheDocument()

    await act(async () => {
      resolveBaseline?.([createSnapshot({ revision: 1, status: 'idle' })])
      await baseline
    })

    expect(screen.getByTestId('agent-activity')).toHaveTextContent('waiting_input')
    expect(screen.getByRole('status')).toHaveTextContent('Agent 等待输入')
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
    expect(screen.queryByText('Agent 等待输入')).not.toBeInTheDocument()

    await act(async () => {
      resolveBaseline?.([waiting])
      await baseline
    })

    expect(screen.getByTestId('agent-activity')).toHaveTextContent('waiting_input')
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('Agent 等待输入')
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
    expect(screen.queryByLabelText('本轮已完成')).not.toBeInTheDocument()

    await act(async () => {
      resolveBaseline?.([createSnapshot({ revision: 5, status: 'working' })])
      await baseline
    })

    expect(screen.getByTestId('agent-activity')).toHaveTextContent('working')
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('Agent')
    expect(screen.getByRole('status')).not.toHaveTextContent('已回复')
    expect(screen.getByLabelText('本轮已完成')).toBeInTheDocument()
  })

  it('identifies the Agent source and retranslates a retained notification on locale change', async () => {
    const terminal = {
      gitBranch: 'feat/notifications',
      projectDirectory: '/Users/nature/Development/cleancode',
      workspaceDirectory: '/Users/nature/.cleancode/worktrees/notifications'
    } as const
    const runtime = installAgentActivityRuntime([
      createSnapshot({ revision: 1, status: 'idle', terminal })
    ])
    renderObserver()

    await waitFor(() => expect(screen.getByTestId('agent-activity')).toHaveTextContent('idle'))
    act(() =>
      runtime.emitCompletion(
        createCompletion({
          agentName: 'Agent 6',
          completionId: 'completion-localized',
          providerId: 'codex',
          terminal,
          terminalRevision: 1
        })
      )
    )

    const notification = screen.getByRole('status')
    expect(notification).toHaveTextContent('Agent 6')
    expect(notification).toHaveTextContent('cleancode · feat/notifications')
    expect(notification).not.toHaveTextContent('已回复')
    expect(notification).not.toHaveTextContent('/Users/nature/.cleancode/worktrees/notifications')
    expect(notification).not.toHaveTextContent('Codex')
    expect(screen.getByLabelText('本轮已完成')).toBeInTheDocument()
    expect(notification.querySelector('.agent-provider-icon')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Switch to English' }))

    expect(screen.getByRole('status')).toHaveTextContent('Agent 6')
    expect(screen.getByRole('status')).not.toHaveTextContent('replied')
    expect(screen.getByRole('status')).toHaveTextContent('cleancode · feat/notifications')
    expect(screen.getByRole('status')).not.toHaveTextContent('Codex')
    expect(screen.getByLabelText('Turn completed')).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'Focus Agent 6 in cleancode · feat/notifications'
      })
    ).toBeInTheDocument()
  })

  it('navigates completed cards to either a managed Agent or a terminal-launched Agent', async () => {
    const onNavigate = vi.fn<(target: AgentActivityNavigationTarget) => void>()
    const runtime = installAgentActivityRuntime([createSnapshot({ revision: 1, status: 'idle' })])
    renderObserver(onNavigate)

    await waitFor(() => expect(screen.getByTestId('agent-activity')).toHaveTextContent('idle'))
    act(() =>
      runtime.emitCompletion(
        createCompletion({
          agentName: 'Agent 6',
          completionId: 'managed-completion',
          terminal: { owner: { id: 'agent-6', kind: 'agent' } },
          terminalRevision: 1
        })
      )
    )

    fireEvent.click(screen.getByRole('button', { name: '定位到 Agent 6（project · main）' }))
    expect(onNavigate).toHaveBeenLastCalledWith({
      target: {
        objectId: 'agent-6',
        objectKind: 'agent',
        projectId: 'project-1',
        workspaceId: 'workspace-1'
      }
    })

    act(() =>
      runtime.emitCompletion(
        createCompletion({
          completionId: 'terminal-completion',
          invocationId: 'terminal-invocation',
          terminalRevision: 1
        })
      )
    )
    fireEvent.click(screen.getByRole('button', { name: '定位到 Agent（project · main）' }))
    expect(onNavigate).toHaveBeenLastCalledWith({
      target: {
        objectId: 'terminal-1',
        objectKind: 'terminal',
        projectId: 'project-1',
        workspaceId: 'workspace-1'
      }
    })
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
    expect(notification).toHaveTextContent('Agent 1 等待输入')
    expect(notification).toHaveTextContent('project · main')
    expect(notification).not.toHaveTextContent('Codex')

    act(() =>
      runtime.emitActivity(
        createSnapshot({ agentName: 'Renamed Agent', revision: 3, status: 'waiting_input' })
      )
    )
    expect(screen.getAllByRole('status')).toEqual([notification])
    expect(notification).toHaveTextContent('Renamed Agent 等待输入')
    expect(notification).toHaveTextContent('project · main')
    expect(notification).not.toHaveTextContent('Codex')

    fireEvent.click(
      screen.getByRole('button', {
        name: '关闭“Renamed Agent 等待输入 — Codex — project · main”通知'
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
    expect(translate('en', 'agentActivity.turnCompleted')).toBe('Turn completed')
    expect(translate('en', 'agentActivity.waitingInput', { agentName: 'Agent 6' })).toBe(
      'Agent 6 is waiting for input'
    )
    expect(translate('en', 'agentActivity.waitingApproval', { agentName: 'Agent 6' })).toBe(
      'Agent 6 is waiting for approval'
    )
  })
})

function renderObserver(onNavigate: (target: AgentActivityNavigationTarget) => void = vi.fn()) {
  return render(
    <I18nProvider initialLocale="zh-CN">
      <NotificationProvider>
        <AgentActivityObserver onNavigate={onNavigate}>
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
  const listAgentProviders = vi.fn(async () => testAgentProviders)
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
      listAgentProviders,
      onAgentActivityChanged: onActivityChanged,
      onAgentTurnCompleted: onTurnCompleted
    }
  })

  return {
    emitActivity: (snapshot: TerminalAgentActivitySnapshot) => activityListener?.(snapshot),
    emitCompletion: (completion: AgentTurnCompletedEvent) => completionListener?.(completion),
    listAgentActivities,
    listAgentProviders,
    onActivityChanged,
    onTurnCompleted,
    unsubscribeActivity,
    unsubscribeCompletion
  }
}

function createSnapshot({
  agentName,
  revision,
  status,
  terminal
}: {
  readonly agentName?: string
  readonly revision: number
  readonly status: TerminalAgentActivitySnapshot['status']
  readonly terminal?: Partial<TerminalAgentActivitySnapshot['terminal']>
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
      workspaceId: 'workspace-1',
      ...terminal
    }
  }
}

function createCompletion({
  agentName,
  completionId,
  invocationId = 'invocation-1',
  providerId = 'provider-neutral',
  terminal,
  terminalRevision
}: {
  readonly agentName?: string
  readonly completionId: string
  readonly invocationId?: string
  readonly providerId?: string
  readonly terminal?: Partial<AgentTurnCompletedEvent['identity']['terminal']>
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
      terminal: {
        ...createSnapshot({ revision: terminalRevision, status: 'idle' }).terminal,
        ...terminal
      }
    },
    reason: 'reported',
    terminalRevision
  }
}

const testProviderIcon = {
  paths: [{ d: 'M2 2h20v20H2z' }],
  viewBox: '0 0 24 24'
} as const

const testAgentProviders: readonly AgentProviderDescriptor[] = [
  createTestProvider('agent', 'Agent'),
  createTestProvider('codex', 'Codex'),
  createTestProvider('provider-neutral', 'Provider Neutral')
]

function createTestProvider(id: string, displayName: string): AgentProviderDescriptor {
  return {
    capabilities: {
      activityTracking: true,
      cleancodeMcp: false,
      launchInstructions: false,
      resume: false,
      sessionIdentityCapture: false,
      sessionRefCodec: false
    },
    displayName,
    icon: testProviderIcon,
    id
  }
}
