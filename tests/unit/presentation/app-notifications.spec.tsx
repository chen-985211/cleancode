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

    fireEvent.click(screen.getAllByRole('button', { name: '关闭“流程失败”通知' })[0])

    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('dismisses a notification after its optional duration', () => {
    vi.useFakeTimers()
    render(
      <NotificationProvider>
        <NotificationHarness />
      </NotificationProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: '发送自动关闭通知' }))

    expect(screen.getByRole('status')).toHaveTextContent('项目已同步')

    act(() => vi.advanceTimersByTime(1_000))

    expect(screen.queryByText('项目已同步')).not.toBeInTheDocument()
  })

  it('updates an existing notification in place and does not restore it after dismissal', () => {
    render(
      <NotificationProvider>
        <NotificationHarness />
      </NotificationProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: '发送活动通知' }))
    fireEvent.click(screen.getByRole('button', { name: '更新活动通知' }))

    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('流程运行成功')
    expect(screen.queryByText('流程运行中')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '关闭活动通知' }))
    fireEvent.click(screen.getByRole('button', { name: '更新活动通知' }))

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
