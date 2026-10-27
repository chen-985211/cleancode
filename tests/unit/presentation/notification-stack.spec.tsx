import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { useRef, useState } from 'react'

import { NotificationProvider } from '../../../src/presentation/app-shell/app-features/notifications/NotificationProvider'
import { useNotifications } from '../../../src/presentation/app-shell/app-features/notifications/useNotifications'
import { I18nProvider } from '../../../src/presentation/i18n/I18nProvider'
import type { AppNotificationInput } from '../../../src/presentation/shared/notifications/appNotifications'

function Publisher({ messages }: { readonly messages: readonly AppNotificationInput[] }) {
  const { dismiss, notify } = useNotifications()
  const firstMessage = useRef<string | null>(null)
  const [canvasActions, setCanvasActions] = useState(0)
  return (
    <>
      {messages.map((message, index) => (
        <button
          key={index}
          onClick={() => {
            const id = notify(message)
            if (index === 0) firstMessage.current = id
          }}
          type="button"
        >
          发布 {index + 1}
        </button>
      ))}
      <div className="canvas-surface" data-testid="canvas-surface">
        <button type="button">画布操作</button>
        <input aria-label="画布终端输入" />
        <button type="button" onClick={() => setCanvasActions((count) => count + 1)}>
          画布内容操作
        </button>
        <span data-testid="canvas-actions">{canvasActions}</span>
      </div>
      <button type="button">侧栏操作</button>
      <button
        type="button"
        onClick={() => {
          if (firstMessage.current) dismiss(firstMessage.current)
        }}
      >
        撤回第一条
      </button>
      <button type="button" onClick={() => dismiss(notify(messages[0]))}>
        发布后立即撤回
      </button>
    </>
  )
}

function setup(messages: readonly AppNotificationInput[]) {
  return render(
    <I18nProvider initialLocale="zh-CN">
      <NotificationProvider>
        <Publisher messages={messages} />
      </NotificationProvider>
    </I18nProvider>
  )
}

function publish(index: number) {
  fireEvent.click(screen.getByRole('button', { name: `发布 ${index}` }))
}

function notifications() {
  return screen.getByRole('region', { name: '通知' })
}

function advance(milliseconds: number) {
  act(() => vi.advanceTimersByTime(milliseconds))
}

const errors: readonly AppNotificationInput[] = ['第一条', '第二条', '第三条'].map((title) => ({
  kind: 'error',
  title
}))

describe('compact notification stack', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('shows the newest message and keeps the rest accessible through the count', () => {
    setup(errors)
    publish(1)
    publish(2)
    publish(3)

    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert')).toHaveTextContent('第三条')
    expect(screen.getByText('第一条').closest('[inert]')).not.toBeNull()
    const toggle = screen.getByRole('button', { name: '展开全部 3 条通知' })
    expect(toggle).toHaveTextContent('+2')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(toggle)
    expect(screen.getAllByRole('alert')).toHaveLength(3)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(toggle)
    fireEvent.pointerLeave(notifications())
    expect(screen.getAllByRole('alert')).toHaveLength(3)
    expect(screen.queryByText('收起')).toBeNull()
    fireEvent.pointerDown(screen.getByRole('button', { name: '画布操作' }))
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('expands on hover and keeps the list stable when a new message arrives during inspection', () => {
    setup(errors)
    publish(1)
    publish(2)
    fireEvent.pointerEnter(notifications())
    expect(screen.getAllByRole('alert').map((card) => card.textContent)).toEqual([
      expect.stringContaining('第二条'),
      expect.stringContaining('第一条')
    ])

    publish(3)
    expect(screen.getAllByRole('alert').map((card) => card.textContent)).toEqual([
      expect.stringContaining('第二条'),
      expect.stringContaining('第一条'),
      expect.stringContaining('第三条')
    ])
    fireEvent.pointerLeave(notifications())
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert')).toHaveTextContent('第三条')
  })

  it('does not move keyboard focus when notifications arrive', () => {
    setup(errors)
    const canvas = screen.getByRole('button', { name: '画布操作' })
    canvas.focus()
    publish(1)
    publish(2)
    expect(canvas).toHaveFocus()
  })

  it('keeps a clicked stack open through Escape until keyboard focus activates the canvas', () => {
    setup(errors)
    publish(1)
    publish(2)
    const toggle = screen.getByRole('button', { name: '展开全部 2 条通知' })
    act(() => toggle.focus())
    expect(screen.getAllByRole('alert')).toHaveLength(2)
    fireEvent.click(toggle)
    const dismiss = screen.getByRole('button', { name: '关闭“第一条”通知' })
    act(() => dismiss.focus())
    fireEvent.keyDown(dismiss, { key: 'Escape' })
    expect(dismiss).toHaveFocus()
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(dismiss, { key: 'Tab' })
    const canvasInput = screen.getByRole('textbox', { name: '画布终端输入' })
    act(() => canvasInput.focus())
    expect(canvasInput).toHaveFocus()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('retains focus on the next notification when the focused card is dismissed', () => {
    setup(errors)
    publish(1)
    publish(2)
    fireEvent.click(screen.getByRole('button', { name: '展开全部 2 条通知' }))
    const dismiss = screen.getByRole('button', { name: '关闭“第二条”通知' })
    act(() => dismiss.focus())
    fireEvent.click(dismiss)
    expect(screen.getByRole('button', { name: '关闭“第一条”通知' })).toHaveFocus()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('returns focus to the previous control when the last focused notification is dismissed', () => {
    setup(errors)
    publish(1)
    const canvas = screen.getByRole('button', { name: '画布操作' })
    act(() => canvas.focus())
    const dismiss = screen.getByRole('button', { name: '关闭“第一条”通知' })
    act(() => dismiss.focus())
    fireEvent.click(dismiss)
    expect(canvas).toHaveFocus()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each(['画布操作', '侧栏操作'])(
    'expands new notifications from keyboard after the last dismissal returns focus to %s',
    (returnTarget) => {
      setup(errors)
      publish(1)
      const previousControl = screen.getByRole('button', { name: returnTarget })
      act(() => previousControl.focus())
      const dismiss = screen.getByRole('button', { name: '关闭“第一条”通知' })
      act(() => dismiss.focus())
      fireEvent.click(dismiss)
      expect(previousControl).toHaveFocus()
      expect(screen.queryByRole('alert')).toBeNull()

      publish(1)
      publish(2)
      const toggle = screen.getByRole('button', { name: '展开全部 2 条通知' })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      fireEvent.keyDown(previousControl, { key: 'Tab' })
      act(() => toggle.focus())
      expect(toggle).toHaveFocus()
      expect(toggle).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getAllByRole('alert')).toHaveLength(2)
    }
  )

  it('keeps focus in the front card when the count button disappears after another message closes', () => {
    setup(errors)
    publish(1)
    publish(2)
    act(() => screen.getByRole('button', { name: '展开全部 2 条通知' }).focus())
    fireEvent.click(screen.getByRole('button', { name: '撤回第一条' }))
    expect(screen.getByRole('button', { name: '关闭“第二条”通知' })).toHaveFocus()
  })

  it('opens on a touch click even when the same pointer gesture focuses the toggle', () => {
    setup(errors)
    publish(1)
    publish(2)
    const toggle = screen.getByRole('button', { name: '展开全部 2 条通知' })
    fireEvent.pointerDown(toggle, { pointerType: 'touch' })
    act(() => toggle.focus())
    fireEvent.click(toggle, { detail: 1 })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('alert')).toHaveLength(2)
  })

  it('keeps notifications expanded across pointer leave until keyboard focus leaves', () => {
    setup(errors)
    publish(1)
    publish(2)
    fireEvent.pointerEnter(notifications())
    act(() => screen.getByRole('button', { name: '关闭“第一条”通知' }).focus())
    fireEvent.pointerLeave(notifications())
    expect(screen.getAllByRole('alert')).toHaveLength(2)
    act(() => screen.getByRole('button', { name: '画布操作' }).focus())
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('keeps the stack open after clicking plain notification content', () => {
    setup(errors)
    publish(1)
    publish(2)
    fireEvent.pointerEnter(notifications())
    fireEvent.click(screen.getByText('第一条'))
    fireEvent.pointerLeave(notifications())
    expect(screen.getAllByRole('alert')).toHaveLength(2)
  })

  it('does not collapse a clicked stack for unrelated sidebar interaction', () => {
    setup(errors)
    publish(1)
    publish(2)
    fireEvent.click(screen.getByRole('button', { name: '展开全部 2 条通知' }))
    const sidebar = screen.getByRole('button', { name: '侧栏操作' })
    fireEvent.pointerDown(sidebar)
    act(() => sidebar.focus())
    fireEvent.keyDown(sidebar, { key: 'Escape' })
    expect(screen.getAllByRole('alert')).toHaveLength(2)
    expect(sidebar).toHaveFocus()
  })

  it.each(['pointer', 'touch', 'wheel', 'keyboard focus', 'keyboard input'] as const)(
    'collapses a clicked stack when the canvas receives %s',
    (input) => {
      setup(errors)
      publish(1)
      publish(2)
      fireEvent.click(screen.getByRole('button', { name: '展开全部 2 条通知' }))
      fireEvent.pointerLeave(notifications())
      const canvas = screen.getByTestId('canvas-surface')
      const canvasInput = screen.getByRole('textbox', { name: '画布终端输入' })
      if (input === 'pointer') fireEvent.pointerDown(canvas)
      else if (input === 'touch') fireEvent.touchStart(canvas)
      else if (input === 'wheel') fireEvent.wheel(canvas, { deltaY: 20 })
      else {
        if (input === 'keyboard focus') fireEvent.keyDown(document, { key: 'Tab' })
        act(() => canvasInput.focus())
        if (input === 'keyboard input') fireEvent.keyDown(canvasInput, { key: 'a' })
      }
      expect(screen.getAllByRole('alert')).toHaveLength(1)
      expect(screen.getByRole('button', { name: '展开全部 2 条通知' })).toHaveAttribute(
        'aria-expanded',
        'false'
      )
    }
  )

  it('does not consume the canvas action that collapses notifications', () => {
    setup(errors)
    publish(1)
    publish(2)
    fireEvent.click(screen.getByRole('button', { name: '展开全部 2 条通知' }))
    const action = screen.getByRole('button', { name: '画布内容操作' })
    fireEvent.pointerDown(action)
    fireEvent.click(action)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByTestId('canvas-actions')).toHaveTextContent('1')
  })

  it('keeps the stack open when notification navigation programmatically focuses canvas content', () => {
    setup([
      { kind: 'info', title: '普通消息' },
      {
        kind: 'info',
        title: 'Agent 1',
        activation: {
          label: '定位 Agent 1',
          onClick: () => {
            screen.getByRole('textbox', { name: '画布终端输入' }).focus()
          }
        }
      }
    ])
    publish(1)
    publish(2)
    fireEvent.click(screen.getByRole('button', { name: '定位 Agent 1' }))
    fireEvent.pointerLeave(notifications())
    const canvasInput = screen.getByRole('textbox', { name: '画布终端输入' })
    expect(canvasInput).toHaveFocus()
    expect(screen.getAllByRole('status')).toHaveLength(2)
    fireEvent.keyDown(canvasInput, { key: 'a' })
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(canvasInput).toHaveFocus()
  })

  it.each(['Escape', 'ArrowDown', 'Shift'])(
    'preserves delayed notification navigation through %s inside the notification',
    async (key) => {
      let finishNavigation!: () => void
      const navigation = new Promise<void>((resolve) => {
        finishNavigation = resolve
      })
      setup([
        { kind: 'info', title: '普通消息' },
        {
          kind: 'info',
          title: 'Agent 1',
          activation: {
            label: '定位 Agent 1',
            onClick: async () => {
              await navigation
              screen.getByRole('textbox', { name: '画布终端输入' }).focus()
            }
          }
        }
      ])
      publish(1)
      publish(2)
      const activate = screen.getByRole('button', { name: '定位 Agent 1' })
      act(() => activate.focus())
      fireEvent.click(activate)
      fireEvent.keyDown(activate, { key })
      fireEvent.pointerLeave(notifications())
      expect(notifications()).toHaveAttribute('data-expanded', 'true')

      await act(async () => {
        finishNavigation()
        await navigation
      })
      const canvasInput = screen.getByRole('textbox', { name: '画布终端输入' })
      expect(canvasInput).toHaveFocus()
      expect(notifications()).toHaveAttribute('data-expanded', 'true')
      expect(screen.getAllByRole('status')).toHaveLength(2)

      fireEvent.keyDown(canvasInput, { key: 'a' })
      expect(notifications()).toHaveAttribute('data-expanded', 'false')
      expect(canvasInput).toHaveFocus()
    }
  )

  it('cleans up a concealed message without waiting for an invisible exit transition', () => {
    setup(errors)
    publish(1)
    publish(2)
    fireEvent.click(screen.getByRole('button', { name: '撤回第一条' }))
    expect(screen.queryByText('第一条')).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent('第二条')
    expect(screen.queryByRole('button', { name: /展开全部/ })).toBeNull()
  })

  it('cleans up a message withdrawn before its first visible render', () => {
    setup(errors)
    fireEvent.click(screen.getByRole('button', { name: '发布后立即撤回' }))
    expect(screen.queryByRole('region', { name: '通知' })).toBeNull()
    expect(screen.queryByText('第一条')).toBeNull()
  })

  it('keeps Agent identity while presenting running activity without a spinner', () => {
    setup([
      {
        accessibleLabel: 'Agent 1 · Provider · 本轮已完成',
        kind: 'success',
        leadingIcon: <span data-testid="provider-identity">Provider</span>,
        title: 'Agent 1'
      },
      { isActivity: true, kind: 'info', title: '流程服务已就绪' }
    ])
    publish(1)
    expect(within(screen.getByRole('status')).getByTestId('provider-identity')).toBeVisible()
    publish(2)
    expect(screen.getByRole('status')).toHaveTextContent('流程服务已就绪')
    expect(screen.getByRole('status').querySelector('.notification-card__spinner')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '展开全部 2 条通知' }))
    expect(screen.getByTestId('provider-identity')).toBeVisible()
  })

  it.each(['pointer', 'keyboard'] as const)(
    'pauses the remaining display time while the user reads with %s',
    (input) => {
      vi.useFakeTimers()
      setup([{ autoDismissMs: 1_000, kind: 'info', title: '自动关闭消息' }])
      publish(1)
      advance(250)
      const viewport = notifications()
      const dismiss = screen.getByRole('button', { name: '关闭“自动关闭消息”通知' })
      if (input === 'pointer') fireEvent.pointerEnter(viewport)
      else act(() => dismiss.focus())
      advance(2_000)
      expect(screen.getByRole('status')).toHaveTextContent('自动关闭消息')
      if (input === 'pointer') fireEvent.pointerLeave(viewport)
      else act(() => screen.getByRole('button', { name: '画布操作' }).focus())
      advance(749)
      expect(screen.getByRole('status')).toHaveTextContent('自动关闭消息')
      advance(1)
      expect(screen.queryByRole('status')).toBeNull()
    }
  )

  it('does not consume the display budget of a message concealed behind the stack', () => {
    vi.useFakeTimers()
    setup([
      { autoDismissMs: 1_000, kind: 'info', title: '较早消息' },
      { autoDismissMs: 1_000, kind: 'info', title: '最新消息' }
    ])
    publish(1)
    advance(200)
    publish(2)
    advance(1_000)
    expect(screen.getByRole('status')).toHaveTextContent('较早消息')
    advance(799)
    expect(screen.getByRole('status')).toHaveTextContent('较早消息')
    advance(1)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('pauses when the document is hidden and cleans up its timer on unmount', () => {
    vi.useFakeTimers()
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const view = setup([{ autoDismissMs: 1_000, kind: 'info', title: '后台消息' }])
    publish(1)
    advance(300)
    hidden.mockReturnValue(true)
    fireEvent(document, new Event('visibilitychange'))
    advance(2_000)
    expect(screen.getByRole('status')).toHaveTextContent('后台消息')
    hidden.mockReturnValue(false)
    fireEvent(document, new Event('visibilitychange'))
    advance(699)
    expect(screen.getByRole('status')).toHaveTextContent('后台消息')
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('starts a fresh budget for a replacement occurrence while keeping a paused message paused', () => {
    vi.useFakeTimers()
    setup([
      {
        autoDismissMs: 1_000,
        identity: { key: 'slot', occurrenceId: 'first' },
        kind: 'info',
        title: '上一轮'
      },
      {
        autoDismissMs: 1_000,
        identity: { key: 'slot', occurrenceId: 'second' },
        kind: 'info',
        title: '新一轮'
      }
    ])
    publish(1)
    advance(400)
    fireEvent.pointerEnter(notifications())
    publish(2)
    advance(2_000)
    expect(screen.getByRole('status')).toHaveTextContent('新一轮')
    fireEvent.pointerLeave(notifications())
    advance(999)
    expect(screen.getByRole('status')).toHaveTextContent('新一轮')
    advance(1)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('does not renew the display budget when the same occurrence receives a revision', () => {
    vi.useFakeTimers()
    setup([
      {
        autoDismissMs: 1_000,
        identity: { key: 'revision', occurrenceId: 'one', revision: 1 },
        kind: 'info',
        title: '初始消息'
      },
      {
        autoDismissMs: 1_000,
        identity: { key: 'revision', occurrenceId: 'one', revision: 2 },
        kind: 'info',
        title: '更新消息'
      }
    ])
    publish(1)
    advance(600)
    publish(2)
    advance(399)
    expect(screen.getByRole('status')).toHaveTextContent('更新消息')
    advance(1)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('brings a new occurrence to the front even when its retained slot is older', () => {
    setup([
      { identity: { key: 'retained', occurrenceId: 'first' }, kind: 'info', title: '旧事件' },
      { kind: 'info', title: '其他消息' },
      { identity: { key: 'retained', occurrenceId: 'second' }, kind: 'info', title: '新事件' }
    ])
    publish(1)
    publish(2)
    expect(screen.getByRole('status')).toHaveTextContent('其他消息')
    publish(3)
    expect(screen.getByRole('status')).toHaveTextContent('新事件')
  })

  it('keeps an older slot in place when only its revision changes', () => {
    setup([
      {
        identity: { key: 'retained', occurrenceId: 'same', revision: 1 },
        kind: 'info',
        title: '旧版本'
      },
      { kind: 'info', title: '其他消息' },
      {
        identity: { key: 'retained', occurrenceId: 'same', revision: 2 },
        kind: 'info',
        title: '新版本'
      }
    ])
    publish(1)
    publish(2)
    publish(3)
    expect(screen.getByRole('status')).toHaveTextContent('其他消息')
    fireEvent.click(screen.getByRole('button', { name: '展开全部 2 条通知' }))
    expect(screen.getAllByRole('status')[1]).toHaveTextContent('新版本')
  })

  it('defers reordering a replacement occurrence until inspection ends', () => {
    setup([
      { identity: { key: 'retained', occurrenceId: 'first' }, kind: 'info', title: '旧事件' },
      { kind: 'info', title: '其他消息' },
      { identity: { key: 'retained', occurrenceId: 'second' }, kind: 'info', title: '新事件' }
    ])
    publish(1)
    publish(2)
    fireEvent.pointerEnter(notifications())
    publish(3)
    expect(screen.getAllByRole('status')[0]).toHaveTextContent('其他消息')
    expect(screen.getAllByRole('status')[1]).toHaveTextContent('新事件')
    fireEvent.pointerLeave(notifications())
    expect(screen.getByRole('status')).toHaveTextContent('新事件')
  })
})
