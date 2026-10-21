import { fireEvent, render, screen } from '@testing-library/react'

import { I18nProvider } from '../../../../src/presentation/i18n/I18nProvider'
import {
  TerminalRuntimeActions,
  TerminalWorkflowStatusBadge,
  type TerminalRuntimeActionsProps
} from '../../../../src/contexts/run/presentation/components/TerminalRuntimeHeader'

describe('terminal runtime header presentation', () => {
  it.each([
    { locale: 'zh-CN', canQuickLaunch: false, label: 'Terminal 配置启动命令' },
    { locale: 'zh-CN', canQuickLaunch: true, label: 'Terminal 启动命令' },
    { locale: 'en', canQuickLaunch: false, label: 'Terminal — Configure launch command' },
    { locale: 'en', canQuickLaunch: true, label: 'Terminal — Launch command' }
  ] as const)(
    'identifies the launch action by shape and name ($locale, configured: $canQuickLaunch)',
    ({ locale, canQuickLaunch, label }) => {
      const callbacks = createCallbacks()
      const props = { ...createProps(callbacks), canQuickLaunch }
      const { rerender } = render(
        <I18nProvider initialLocale={locale}>
          <TerminalRuntimeActions {...props} />
        </I18nProvider>
      )
      const button = screen.getByRole('button', { name: label })
      expect(button).toHaveAttribute(
        'data-launch-command-state',
        canQuickLaunch ? 'configured' : 'unconfigured'
      )
      expect(button.querySelector('[data-icon="terminal-launch"]')).toMatchObject({
        dataset: expect.objectContaining({
          iconGlyph: canQuickLaunch ? 'play' : 'gear-six',
          iconRole: canQuickLaunch ? 'launch' : 'settings',
          iconWeight: canQuickLaunch ? 'fill' : 'bold'
        })
      })
      fireEvent.click(button)
      expect(callbacks.onQuickLaunch).toHaveBeenCalledOnce()

      rerender(
        <I18nProvider initialLocale={locale}>
          <TerminalRuntimeActions {...props} isRecoveryPending />
        </I18nProvider>
      )
      if (canQuickLaunch) expect(button).toBeDisabled()
      else expect(button).toBeEnabled()
    }
  )

  it('projects the workflow node status without terminal definition state', () => {
    const { rerender } = render(<TerminalWorkflowStatusBadge status="running" />)

    expect(screen.getByText('执行中')).toHaveClass('workflow-state', 'workflow-state--running')

    rerender(<TerminalWorkflowStatusBadge status={undefined} />)
    expect(screen.queryByText('执行中')).not.toBeInTheDocument()
  })

  it('keeps the five runtime actions ordered and publishes their narrow callbacks', () => {
    const callbacks = createCallbacks()
    render(<TerminalRuntimeActions {...createProps(callbacks)} />)

    expect(
      screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))
    ).toEqual([
      'Terminal 从此处运行终端流程',
      'Terminal 启动命令',
      'Terminal 停止当前命令',
      'Terminal 应用退出后继续运行此会话',
      'Terminal 重开空终端会话'
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Terminal 从此处运行终端流程' }))
    fireEvent.click(screen.getByRole('button', { name: 'Terminal 启动命令' }))
    fireEvent.click(screen.getByRole('button', { name: 'Terminal 停止当前命令' }))
    fireEvent.click(screen.getByRole('button', { name: 'Terminal 应用退出后继续运行此会话' }))
    fireEvent.click(screen.getByRole('button', { name: 'Terminal 重开空终端会话' }))

    expect(callbacks.onRunFromHere).toHaveBeenCalledOnce()
    expect(callbacks.onQuickLaunch).toHaveBeenCalledOnce()
    expect(callbacks.onStop).toHaveBeenCalledOnce()
    expect(callbacks.onToggleRetention).toHaveBeenCalledOnce()
    expect(callbacks.onRestart).toHaveBeenCalledOnce()
    expect(document.querySelector('[data-icon="terminal-workflow-run"]')).toHaveAttribute(
      'data-icon-glyph',
      'flow-arrow'
    )
    expect(document.querySelector('[data-icon="terminal-retention"]')).toHaveAttribute(
      'data-icon-weight',
      'bold'
    )
  })

  it('turns the workflow action into the active run stop action', () => {
    const callbacks = createCallbacks()
    render(
      <TerminalRuntimeActions
        {...createProps(callbacks)}
        isActiveWorkflowRoot
        isStoppingWorkflow={false}
      />
    )

    const stopWorkflow = screen.getByRole('button', { name: 'Terminal 停止本次运行' })
    expect(stopWorkflow).toHaveClass('terminal-node__action--workflow-stop')
    expect(stopWorkflow.querySelector('[data-icon="terminal-workflow-stop"]')).toMatchObject({
      dataset: expect.objectContaining({ iconGlyph: 'stop', iconWeight: 'fill' })
    })

    fireEvent.click(stopWorkflow)
    expect(callbacks.onStopWorkflow).toHaveBeenCalledOnce()
    expect(callbacks.onRunFromHere).not.toHaveBeenCalled()
  })

  it('keeps workflow retention focusable for its explanation without publishing a toggle', () => {
    const callbacks = createCallbacks()
    render(
      <TerminalRuntimeActions
        {...createProps(callbacks)}
        sessionKind="workflow"
        retentionPolicy="terminate-on-application-exit"
      />
    )

    const retention = screen.getByRole('button', {
      name: 'Terminal 工作流会话会随应用退出停止，不能跨应用保留'
    })
    expect(retention).toHaveAttribute('aria-disabled', 'true')
    expect(retention).not.toBeDisabled()

    fireEvent.click(retention)
    expect(callbacks.onToggleRetention).not.toHaveBeenCalled()
  })
})

function createProps(callbacks: ReturnType<typeof createCallbacks>): TerminalRuntimeActionsProps {
  return {
    terminalName: 'Terminal',
    canQuickLaunch: true,
    isRunning: true,
    isRecoveryPending: false,
    sessionKind: 'interactive',
    retentionPolicy: 'terminate-on-application-exit',
    isActiveWorkflowRoot: false,
    isStoppingWorkflow: false,
    ...callbacks
  }
}

function createCallbacks() {
  return {
    onRunFromHere: vi.fn(),
    onStopWorkflow: vi.fn(),
    onQuickLaunch: vi.fn(),
    onStop: vi.fn(),
    onToggleRetention: vi.fn(),
    onRestart: vi.fn()
  }
}
