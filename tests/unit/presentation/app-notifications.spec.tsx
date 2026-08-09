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
              label: '停止本次运行',
              pendingLabel: '正在停止…',
              onClick: onStop,
              tone: 'danger'
            },
            isActivity: true,
            kind: 'info',
            title: '流程运行中',
            message: '从“依赖就绪”开始 · 涉及 2 个终端'
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
            message: '从“依赖就绪”开始 · 2 个终端已完成'
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
    expect(alerts[0]).toHaveTextContent('流程失败')
    expect(alerts[0]).toHaveTextContent('终端“OpenCove 开发环境”运行失败。')
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
    expect(screen.getByRole('button', { name: '正在停止…' })).toBeDisabled()

    finishStop?.()

    await waitFor(() => expect(screen.getByRole('button', { name: '停止本次运行' })).toBeEnabled())
  })
})
