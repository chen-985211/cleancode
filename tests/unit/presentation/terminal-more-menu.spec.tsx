import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { TerminalMoreMenu } from '../../../src/presentation/app-shell/workbench/nodes/terminal/TerminalMoreMenu'
import { I18nProvider } from '../../../src/presentation/i18n/I18nProvider'

function createProps() {
  return {
    terminalName: 'Terminal',
    isRunning: true,
    isRecoveryPending: false,
    sessionKind: 'interactive' as const,
    retentionPolicy: 'terminate-on-application-exit' as const,
    onStop: vi.fn(),
    onToggleRetention: vi.fn(),
    onRestart: vi.fn(),
    onDelete: vi.fn()
  }
}

describe('terminal more menu', () => {
  it.each([
    ['menuitem', '停止当前命令', 'onStop'],
    ['menuitemcheckbox', '应用退出后继续运行此会话', 'onToggleRetention'],
    ['menuitem', '重开空终端会话', 'onRestart'],
    ['menuitem', '删除终端', 'onDelete']
  ] as const)('closes and only invokes %s %s once', (role, label, callback) => {
    const props = createProps()
    const onCanvasClick = vi.fn(),
      onCanvasPointerDown = vi.fn()
    render(
      <div onClick={onCanvasClick} onPointerDown={onCanvasPointerDown}>
        <div
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <TerminalMoreMenu {...props} />
        </div>
      </div>
    )
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    const trigger = screen.getByRole('button', { name: 'Terminal 更多终端操作' })
    fireEvent.click(trigger)
    const item = screen.getByRole(role, { name: `Terminal ${label}` })
    fireEvent.pointerDown(item)
    fireEvent.click(item)
    expect(props[callback]).toHaveBeenCalledOnce()
    for (const other of ['onStop', 'onToggleRetention', 'onRestart', 'onDelete'] as const) {
      if (other !== callback) expect(props[other]).not.toHaveBeenCalled()
    }
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(onCanvasClick).not.toHaveBeenCalled()
    expect(onCanvasPointerDown).not.toHaveBeenCalled()
  })

  it.each([
    { isRunning: true, isRecoveryPending: false, disabled: [false, false, false] },
    { isRunning: false, isRecoveryPending: false, disabled: [true, true, false] },
    { isRunning: true, isRecoveryPending: true, disabled: [true, true, true] }
  ])('preserves session capabilities ($isRunning, recovery $isRecoveryPending)', (state) => {
    const props = createProps()
    render(<TerminalMoreMenu {...props} {...state} />)
    fireEvent.click(screen.getByRole('button', { name: 'Terminal 更多终端操作' }))
    const items = Array.from(screen.getByRole('menu').querySelectorAll<HTMLButtonElement>('button'))
    expect(items.map((item) => item.disabled)).toEqual([...state.disabled, false])
    items.forEach((item, index) => {
      if (state.disabled[index]) fireEvent.click(item)
    })
    expect(props.onStop).not.toHaveBeenCalled()
    expect(props.onToggleRetention).not.toHaveBeenCalled()
    expect(props.onRestart).not.toHaveBeenCalled()
  })

  it('supports keyboard navigation, workflow retention explanation and immediate focus return', async () => {
    const props = createProps()
    render(<TerminalMoreMenu {...props} sessionKind="workflow" />)
    const trigger = screen.getByRole('button', { name: 'Terminal 更多终端操作' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const stop = screen.getByRole('menuitem', { name: 'Terminal 停止当前命令' })
    await waitFor(() => expect(stop).toHaveFocus())
    fireEvent.keyDown(stop, { key: 'ArrowDown' })
    const retention = screen.getByRole('menuitemcheckbox')
    expect(retention).toHaveFocus()
    expect(retention).toHaveAttribute('aria-disabled', 'true')
    expect(retention).toHaveAccessibleName('Terminal 工作流会话会随应用退出停止，不能跨应用保留')
    fireEvent.keyDown(retention, { key: 'Enter' })
    expect(props.onToggleRetention).not.toHaveBeenCalled()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(retention, { key: 'Escape' })
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    fireEvent.keyDown(trigger, { key: 'ArrowUp' })
    const remove = screen.getByRole('menuitem', { name: 'Terminal 删除终端' })
    await waitFor(() => expect(remove).toHaveFocus())
    fireEvent.keyDown(remove, { key: 'Tab' })
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows checked retention with an English accessible menu and dismisses outside', () => {
    render(
      <I18nProvider initialLocale="en">
        <TerminalMoreMenu {...createProps()} retentionPolicy="keep-after-application-exit" />
      </I18nProvider>
    )
    const trigger = screen.getByRole('button', { name: 'Terminal — More terminal actions' })
    fireEvent.click(trigger)
    expect(
      screen.getByRole('menu', { name: 'Terminal — More terminal actions' })
    ).toBeInTheDocument()
    expect(screen.getByRole('menuitemcheckbox')).toHaveAttribute('aria-checked', 'true')
    expect(document.querySelector('[data-icon="terminal-retention"]')).toHaveAttribute(
      'data-icon-weight',
      'fill'
    )
    fireEvent.pointerDown(document.body)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
})
