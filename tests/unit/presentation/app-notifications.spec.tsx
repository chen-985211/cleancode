import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode, useRef } from 'react'

import { NotificationProvider } from '../../../src/presentation/app-shell/NotificationProvider'
import { useNotifications } from '../../../src/presentation/app-shell/useNotifications'

function NotificationHarness({ onStop = async () => undefined }: { onStop?: () => Promise<void> }) {
  const { dismiss, notify, update } = useNotifications()
  const activityNotificationId = useRef<string | null>(null)

  return (
    <div>
      <button
        type="button"
        onClick={() =>
          notify({
            kind: 'error',
            title: '流程失败',
            message: '终端“OpenCove 开发环境”运行失败。'
          })
        }
      >
        发送错误通知
      </button>
      <button
        type="button"
        onClick={() =>
          notify({
            autoDismissMs: 1_000,
            kind: 'info',
            title: '项目已同步'
          })
        }
      >
        发送自动关闭通知
      </button>
      <button
        type="button"
        onClick={() => {
          activityNotificationId.current = notify({
            action: {
              icon: 'stop',
              label: '停止本次运行',
              pendingLabel: '正在停止…',
              onClick: onStop,
              tone: 'danger'
            },
            isActivity: true,
            kind: 'info',
            title: '流程运行中',
            source: { label: '从“依赖就绪”开始 · 涉及 2 个终端' }
          })
        }}
      >
        发送活动通知
      </button>
      <button
        type="button"
        onClick={() => {
          if (!activityNotificationId.current) return
          update(activityNotificationId.current, {
            autoDismissMs: 4_000,
            kind: 'success',
            title: '流程运行成功',
            source: { label: '从“依赖就绪”开始 · 2 个终端已完成' }
          })
        }}
      >
        更新活动通知
      </button>
      <button
        type="button"
        onClick={() => {
          if (!activityNotificationId.current) return
          dismiss(activityNotificationId.current)
        }}
      >
        关闭活动通知
      </button>
    </div>
  )
}

function SemanticNotificationHarness() {
  const { notify } = useNotifications()

  return (
    <div>
      <button
        type="button"
        onClick={() =>
          notify({
            identity: { key: 'agent:workspace-1', occurrenceId: 'turn-1', revision: 1 },
            kind: 'info',
            message: '正在处理',
            title: 'Agent 正在回答'
          })
        }
      >
        发布 Agent 消息
      </button>
      <button
        type="button"
        onClick={() =>
          notify({
            identity: { key: 'agent:workspace-1', occurrenceId: 'turn-1', revision: 2 },
            kind: 'success',
            message: '回答已完成',
            title: 'Agent 已完成'
          })
        }
      >
        更新同一 Agent 消息
      </button>
      <button
        type="button"
        onClick={() =>
          notify({
            identity: { key: 'agent:workspace-1', occurrenceId: 'turn-1', revision: 3 },
            kind: 'success',
            title: 'Agent 已完成（重复）'
          })
        }
      >
        重放同一 Agent 消息
      </button>
      <button
        type="button"
        onClick={() =>
          notify({
            identity: { key: 'agent:workspace-1', occurrenceId: 'turn-2', revision: 1 },
            kind: 'info',
            title: 'Agent 正在回答新消息'
          })
        }
      >
        发布下一条 Agent 消息
      </button>
    </div>
  )
}

function SemanticLifecycleHarness({
  onFirstAction = async () => undefined,
  onSecondAction = async () => undefined
}: {
  readonly onFirstAction?: () => Promise<void>
  readonly onSecondAction?: () => Promise<void>
}) {
  const { notify } = useNotifications()

  return (
    <div>
      <button
        type="button"
        onClick={() =>
          notify({
            autoDismissMs: 1_000,
            identity: { key: 'semantic-lifecycle', occurrenceId: 'first' },
            kind: 'info',
            title: '第一条语义消息'
          })
        }
      >
        发布第一条定时消息
      </button>
      <button
        type="button"
        onClick={() =>
          notify({
            autoDismissMs: 1_000,
            identity: { key: 'semantic-lifecycle', occurrenceId: 'second' },
            kind: 'info',
            title: '第二条语义消息'
          })
        }
      >
        发布第二条定时消息
      </button>
      <button
        type="button"
        onClick={() =>
          notify({
            action: {
              icon: 'retry',
              label: '执行第一条动作',
              pendingLabel: '第一条动作进行中…',
              onClick: onFirstAction
            },
            identity: { key: 'semantic-action', occurrenceId: 'first' },
            kind: 'info',
            title: '第一条可操作消息'
          })
        }
      >
        发布第一条可操作消息
      </button>
      <button
        type="button"
        onClick={() =>
          notify({
            action: {
              icon: 'retry',
              label: '执行第二条动作',
              pendingLabel: '第二条动作进行中…',
              onClick: onSecondAction
            },
            identity: { key: 'semantic-action', occurrenceId: 'second' },
            kind: 'info',
            title: '第二条可操作消息'
          })
        }
      >
        发布第二条可操作消息
      </button>
    </div>
  )
}

describe('app notifications', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('stacks notifications and lets the user dismiss each one independently', () => {
    render(
      <NotificationProvider>
        <NotificationHarness />
      </NotificationProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: '发送错误通知' }))
    fireEvent.click(screen.getByRole('button', { name: '发送错误通知' }))

    const alerts = screen.getAllByRole('alert')

    expect(alerts).toHaveLength(2)
    expect(alerts[0]).toHaveClass('notification-card--uniform')
    expect(alerts[0]).toHaveTextContent('流程失败')
    expect(alerts[0]).toHaveTextContent('终端“OpenCove 开发环境”运行失败。')
    expect(alerts[0].querySelector('.notification-card__title-copy')).toHaveAttribute(
      'title',
      '流程失败'
    )
    expect(alerts[0].querySelector('.notification-card__message')).toHaveAttribute(
      'title',
      '终端“OpenCove 开发环境”运行失败。'
    )
    expect(alerts[0]).toHaveAttribute('data-surface-motion-state', 'opening')
    fireEvent.transitionEnd(alerts[0], { propertyName: 'transform' })
    expect(alerts[0]).toHaveAttribute('data-surface-motion-state', 'open')

    fireEvent.click(screen.getAllByRole('button', { name: '关闭“流程失败”通知' })[0])

    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(alerts[0]).toHaveAttribute('data-surface-motion-state', 'closing')
    expect(alerts[0]).toHaveAttribute('inert')
    fireEvent.transitionEnd(alerts[0], { propertyName: 'transform' })
    expect(alerts[0]).not.toBeInTheDocument()
  })

  it('dismisses a notification after its optional duration', () => {
    vi.useFakeTimers()
    render(
      <NotificationProvider>
        <NotificationHarness />
      </NotificationProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: '发送自动关闭通知' }))

    const notification = screen.getByRole('status')
    expect(notification).toHaveTextContent('项目已同步')

    act(() => vi.advanceTimersByTime(1_000))

    expect(screen.queryByRole('status')).toBeNull()
    expect(notification).toHaveAttribute('data-surface-motion-state', 'closing')
    fireEvent.transitionEnd(notification, { propertyName: 'transform' })
    expect(screen.queryByText('项目已同步')).not.toBeInTheDocument()
  })

  it('updates an existing notification in place and does not restore it after dismissal', async () => {
    render(
      <NotificationProvider>
        <NotificationHarness />
      </NotificationProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: '发送活动通知' }))
    const activeNotification = screen.getByRole('status')
    const stopButton = screen.getByRole('button', { name: '停止本次运行' })
    const dismissButton = screen.getByRole('button', { name: '关闭“流程运行中”通知' })

    expect(activeNotification).toHaveClass('notification-card--uniform')
    expect(activeNotification.querySelector('.notification-card__source-label')).toHaveTextContent(
      '从“依赖就绪”开始 · 涉及 2 个终端'
    )
    expect(stopButton).not.toHaveTextContent(/\S/)
    expect(stopButton).toHaveAttribute('data-notification-action-icon', 'stop')
    expect(stopButton.querySelector('.notification-card__action-icon')).toBeInTheDocument()
    expect(stopButton.closest('.notification-card__controls')).toContainElement(dismissButton)

    fireEvent.click(screen.getByRole('button', { name: '更新活动通知' }))

    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('流程运行成功')
    const outgoingTitle = screen.getByText('流程运行中')
    const outgoingTitleLayer = outgoingTitle.closest('.notification-card__title-layer')
    const currentTitleLayer = screen
      .getByText('流程运行成功')
      .closest('.notification-card__title-layer')
    const notification = screen.getByRole('status')
    const outgoingIconLayer = notification.querySelector(
      '.notification-card__icon-layer[data-notification-status-motion-state="outgoing"]'
    )
    const currentIconLayer = notification.querySelector(
      '.notification-card__icon-layer[data-notification-status-motion-state="current"]'
    )

    expect(outgoingTitleLayer).toHaveAttribute('data-notification-status-motion-state', 'outgoing')
    expect(outgoingTitleLayer).toHaveAttribute('aria-hidden', 'true')
    expect(currentTitleLayer).toHaveAttribute('data-notification-status-motion-state', 'current')
    expect(outgoingIconLayer?.querySelector('.notification-card__spinner')).toBeInTheDocument()
    expect(currentIconLayer?.querySelector('.notification-card__spinner')).not.toBeInTheDocument()
    expect(outgoingIconLayer).toHaveAttribute('data-notification-icon-spring-state', 'closing')
    expect(currentIconLayer).toHaveAttribute('data-notification-icon-spring-state', 'opening')
    expect(currentIconLayer).toHaveStyle({
      '--notification-icon-motion-opacity': '0',
      '--notification-icon-motion-scale': '0.76',
      '--notification-icon-motion-y': '6px'
    })

    await waitFor(() => expect(screen.queryByText('流程运行中')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: '关闭活动通知' }))
    fireEvent.click(screen.getByRole('button', { name: '更新活动通知' }))

    expect(screen.queryByRole('status')).toBeNull()
    expect(notification).toHaveAttribute('data-surface-motion-state', 'closing')
    expect(notification).toHaveTextContent('流程运行成功')
    fireEvent.transitionEnd(notification, { propertyName: 'transform' })
    expect(screen.queryByText('流程运行成功')).not.toBeInTheDocument()
  })

  it('shows a stable pending state while an asynchronous notification action runs', async () => {
    let finishStop: (() => void) | undefined
    const onStop = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishStop = resolve
        })
    )
    render(
      <StrictMode>
        <NotificationProvider>
          <NotificationHarness onStop={onStop} />
        </NotificationProvider>
      </StrictMode>
    )

    fireEvent.click(screen.getByRole('button', { name: '发送活动通知' }))
    fireEvent.click(screen.getByRole('button', { name: '停止本次运行' }))

    expect(onStop).toHaveBeenCalledOnce()
    const pendingStopButton = screen.getByRole('button', { name: '正在停止…' })
    expect(pendingStopButton).not.toHaveTextContent(/\S/)
    expect(pendingStopButton).toHaveAttribute('data-notification-action-icon', 'loading')
    expect(
      pendingStopButton.querySelector('.notification-card__action-spinner')
    ).toBeInTheDocument()
    expect(pendingStopButton).toHaveAttribute('aria-busy', 'true')
    expect(pendingStopButton).toHaveAttribute('aria-disabled', 'true')

    finishStop?.()

    await waitFor(() =>
      expect(screen.getByRole('button', { name: '停止本次运行' })).toHaveAttribute(
        'aria-disabled',
        'false'
      )
    )
  })

  it('deduplicates a semantic occurrence, keeps it acknowledged, and reopens for the next one', () => {
    render(
      <NotificationProvider>
        <SemanticNotificationHarness />
      </NotificationProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: '发布 Agent 消息' }))

    const notification = screen.getByRole('status')

    fireEvent.click(screen.getByRole('button', { name: '更新同一 Agent 消息' }))

    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toBe(notification)
    expect(notification).toHaveTextContent('回答已完成')

    fireEvent.click(screen.getByRole('button', { name: '关闭“Agent 已完成”通知' }))
    fireEvent.transitionEnd(notification, { propertyName: 'transform' })
    fireEvent.click(screen.getByRole('button', { name: '重放同一 Agent 消息' }))

    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByText('Agent 已完成（重复）')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '发布下一条 Agent 消息' }))

    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('Agent 正在回答新消息')
  })

  it('starts a fresh auto-dismiss window for each semantic occurrence', () => {
    vi.useFakeTimers()
    render(
      <NotificationProvider>
        <SemanticLifecycleHarness />
      </NotificationProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: '发布第一条定时消息' }))
    act(() => vi.advanceTimersByTime(750))
    fireEvent.click(screen.getByRole('button', { name: '发布第二条定时消息' }))

    act(() => vi.advanceTimersByTime(250))
    expect(screen.getByRole('status')).toHaveTextContent('第二条语义消息')

    act(() => vi.advanceTimersByTime(749))
    expect(screen.getByRole('status')).toHaveTextContent('第二条语义消息')

    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('isolates pending actions between semantic occurrences and ignores an old promise result', async () => {
    let finishFirstAction: (() => void) | undefined
    let finishSecondAction: (() => void) | undefined
    const onFirstAction = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishFirstAction = resolve
        })
    )
    const onSecondAction = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSecondAction = resolve
        })
    )
    render(
      <NotificationProvider>
        <SemanticLifecycleHarness onFirstAction={onFirstAction} onSecondAction={onSecondAction} />
      </NotificationProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: '发布第一条可操作消息' }))
    fireEvent.click(screen.getByRole('button', { name: '执行第一条动作' }))
    const firstPendingAction = screen.getByRole('button', { name: '第一条动作进行中…' })
    expect(firstPendingAction).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(firstPendingAction)
    expect(onFirstAction).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '发布第二条可操作消息' }))
    expect(screen.getByRole('button', { name: '执行第二条动作' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: '执行第二条动作' }))
    expect(screen.getByRole('button', { name: '第二条动作进行中…' })).toHaveAttribute(
      'aria-disabled',
      'true'
    )

    await act(async () => {
      finishFirstAction?.()
      await Promise.resolve()
    })
    expect(screen.getByRole('button', { name: '第二条动作进行中…' })).toHaveAttribute(
      'aria-disabled',
      'true'
    )

    await act(async () => {
      finishSecondAction?.()
      await Promise.resolve()
    })
    expect(screen.getByRole('button', { name: '执行第二条动作' })).toBeEnabled()
  })
})
