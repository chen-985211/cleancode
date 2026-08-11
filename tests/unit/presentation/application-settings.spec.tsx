import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'

import { ApplicationSettingsRoot } from '../../../src/presentation/app-shell/ApplicationSettingsRoot'
import {
  defaultApplicationShortcutBindings,
  type ApplicationShortcutBinding,
  type ApplicationShortcutBindings,
  type ApplicationShortcutCommand
} from '../../../src/presentation/app-shell/applicationShortcuts'

describe('application settings', () => {
  it('projects the default navigation selection when the delayed settings surface first mounts', () => {
    const offsetWidth = vi
      .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.hasAttribute('data-selection-motion-option') ? 180 : 0
      })
    const offsetHeight = vi
      .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.hasAttribute('data-selection-motion-option') ? 40 : 0
      })

    try {
      render(<SettingsHarness />)
      fireEvent.click(screen.getByRole('button', { name: '设置' }))

      const navigation = screen.getByRole('navigation', { name: '设置导航' })
      const indicator = navigation.querySelector('.application-settings-navigation__selection')

      expect(navigation).toHaveAttribute('data-selection-motion-ready', 'true')
      expect(indicator).toHaveAttribute('data-selection-motion-state', 'settled')
      expect(
        (indicator as HTMLElement).style.getPropertyValue('--cc-selection-motion-height')
      ).toBe('40px')
      expect((indicator as HTMLElement).style.getPropertyValue('--cc-selection-motion-width')).toBe(
        '180px'
      )
      expect(screen.getByRole('button', { name: '快捷键' })).toHaveAttribute('aria-current', 'page')
    } finally {
      offsetWidth.mockRestore()
      offsetHeight.mockRestore()
    }
  })

  it('opens as a focused full-app surface while keeping the workbench mounted and inert', () => {
    render(
      <>
        <aside className="project-sidebar" aria-label="项目区域" />
        <section className="app-shell__workspace" aria-label="工作区状态">
          保留的终端状态
        </section>
        <SettingsHarness />
      </>
    )

    const trigger = screen.getByRole('button', { name: '设置' })
    expect(trigger).toHaveClass('app-shell-utility-button')
    fireEvent.pointerDown(trigger, { pointerType: 'mouse' })
    fireEvent.click(trigger)

    const dialog = screen.getByRole('dialog', { name: '设置' })
    expect(dialog).toHaveClass('application-settings-surface')
    expect(dialog).toHaveAttribute('data-surface-spring-preset', 'fullscreen-right')
    expect(screen.getByText('保留的终端状态')).toBeInTheDocument()
    expect(screen.getByLabelText('项目区域').inert).toBe(true)
    expect(screen.getByLabelText('工作区状态').inert).toBe(true)
    const settingsNavigation = screen.getByRole('navigation', { name: '设置导航' })
    expect(
      within(settingsNavigation)
        .getAllByRole('button')
        .map((button) => button.textContent)
    ).toEqual(['快捷键', '画布', '终端', 'Agent'])
    expect(screen.getByRole('button', { name: '快捷键' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: '快捷键' })).toBeInTheDocument()
    expect(
      screen.queryByText('自定义 cleancode 中常用操作的按键组合。更改会立即生效。')
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '修改“切换侧边栏”快捷键' })).toHaveTextContent('⌘B')
    const projectShortcuts = screen.getByRole('group', { name: '项目与工作区' })
    expect(
      within(projectShortcuts).getByRole('button', { name: '修改“添加项目”快捷键' })
    ).toHaveTextContent('⌘O')
    expect(
      within(projectShortcuts).getByRole('button', { name: '修改“下一个工作区”快捷键' })
    ).toHaveTextContent('⌘⇧↓')
    const canvasShortcuts = screen.getByRole('group', { name: '画布' })
    expect(
      within(canvasShortcuts).getByRole('button', { name: '修改“选择左侧节点”快捷键' })
    ).toHaveTextContent('⌘←')
    expect(screen.getByRole('button', { name: '返回工作区' })).toHaveFocus()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: '设置' })).not.toBeInTheDocument()
    expect(dialog).toHaveAttribute('data-surface-motion-state', 'closing')
    expect(dialog).toHaveAttribute('inert')
    expect(screen.getByText('保留的终端状态')).toBeInTheDocument()
    expect(screen.getByLabelText('项目区域').inert).toBe(false)
    expect(screen.getByLabelText('工作区状态').inert).toBe(false)

    fireEvent.transitionEnd(dialog, { propertyName: 'opacity' })

    expect(dialog).not.toBeInTheDocument()
    expect(screen.getByLabelText('项目区域').inert).toBe(false)
    expect(screen.getByLabelText('工作区状态').inert).toBe(false)
    expect(trigger).toHaveFocus()
  })

  it('records a safe binding and rejects conflicts without replacing the previous value', () => {
    render(<SettingsHarness initiallyOpen />)

    const terminalRecorder = screen.getByRole('button', {
      name: '修改“新建终端积木”快捷键'
    })
    expect(within(terminalRecorder).getAllByText(/⌘|T/)).toHaveLength(2)
    expect(terminalRecorder).not.toHaveTextContent('⇧')
    expect(terminalRecorder).toHaveAttribute('data-selection-motion-state', 'closed')
    expect(terminalRecorder.style.getPropertyValue('--cc-selection-motion-progress')).toBe('0')

    fireEvent.click(terminalRecorder)
    expect(terminalRecorder).toHaveAttribute('aria-pressed', 'true')
    expect(terminalRecorder).toHaveAttribute('data-selection-motion-state', 'opening')
    expect(terminalRecorder).toHaveTextContent('请按下新的快捷键')

    fireEvent.keyDown(terminalRecorder, { key: 'a', metaKey: true, shiftKey: true })

    expect(screen.getByRole('alert')).toHaveTextContent('该快捷键已分配给“新建 Agent”')
    expect(terminalRecorder).toHaveTextContent('请按下新的快捷键')

    fireEvent.keyDown(terminalRecorder, { altKey: true, key: 't', metaKey: true })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(terminalRecorder).toHaveAttribute('aria-pressed', 'false')
    expect(terminalRecorder).toHaveTextContent('⌘')
    expect(terminalRecorder).toHaveTextContent('⌥')
    expect(terminalRecorder).toHaveTextContent('T')
  })

  it('supports clearing, per-command reset, and resetting the whole catalog', () => {
    render(<SettingsHarness initiallyOpen />)

    const agentRecorder = screen.getByRole('button', { name: '修改“新建 Agent”快捷键' })
    fireEvent.click(agentRecorder)
    fireEvent.keyDown(agentRecorder, { key: 'Delete' })
    expect(agentRecorder).toHaveTextContent('未分配')

    fireEvent.click(screen.getByRole('button', { name: '恢复“新建 Agent”的默认快捷键' }))
    expect(agentRecorder).toHaveTextContent('⌘')
    expect(agentRecorder).toHaveTextContent('⇧')
    expect(agentRecorder).toHaveTextContent('A')

    const terminalRecorder = screen.getByRole('button', { name: '修改“新建终端积木”快捷键' })
    fireEvent.click(terminalRecorder)
    fireEvent.click(screen.getByRole('button', { name: '清除“新建终端积木”的快捷键' }))
    expect(terminalRecorder).toHaveAttribute('aria-pressed', 'false')
    expect(terminalRecorder).toHaveTextContent('未分配')

    fireEvent.click(screen.getByRole('button', { name: '全部恢复默认' }))
    expect(screen.getByRole('button', { name: '修改“新建终端积木”快捷键' })).toHaveTextContent('⌘T')
  })

  it('updates the settings trigger tooltip when its shortcut binding changes', async () => {
    render(<SettingsHarness initiallyOpen />)

    const recorder = screen.getByRole('button', { name: '修改“打开设置”快捷键' })
    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { altKey: true, key: 'o', metaKey: true })
    fireEvent.click(screen.getByRole('button', { name: '返回工作区' }))

    const trigger = screen.getByRole('button', { name: '设置' })
    fireEvent.pointerMove(trigger, { pointerType: 'mouse' })

    expect(await screen.findByRole('tooltip')).toHaveTextContent('打开设置 (⌘⌥O)')
  })

  it('does not steal focus back when a new external intent takes over an active exit', () => {
    render(
      <>
        <button type="button">外部目标</button>
        <SettingsHarness initiallyOpen />
      </>
    )

    const dialog = screen.getByRole('dialog', { name: '设置' })
    const trigger = screen.getByRole('button', { name: '设置' })
    const externalTarget = screen.getByRole('button', { name: '外部目标' })
    fireEvent.click(screen.getByRole('button', { name: '返回工作区' }))
    fireEvent.pointerDown(externalTarget)
    externalTarget.focus()
    fireEvent.transitionEnd(dialog, { propertyName: 'opacity' })

    expect(externalTarget).toHaveFocus()
    expect(trigger).not.toHaveFocus()
  })

  it('changes the shared terminal scrollback budget from the terminal settings pane', () => {
    render(<SettingsHarness initiallyOpen />)

    fireEvent.click(screen.getByRole('button', { name: '终端' }))

    expect(screen.getByRole('heading', { name: '终端' })).toBeInTheDocument()
    expect(screen.queryByText('调整终端历史记录，不会重启正在运行的会话。')).not.toBeInTheDocument()
    expect(
      screen.queryByText('后台终端状态和可见终端视图使用相同的历史上限。')
    ).not.toBeInTheDocument()
    const scrollbackOptions = screen.getByRole('radiogroup', { name: '滚动历史' })
    expect(
      scrollbackOptions.querySelector('.terminal-settings-options__selection')
    ).toHaveAttribute('data-selection-motion-target', '1000')
    expect(within(scrollbackOptions).getAllByRole('radio')).toHaveLength(3)
    expect(within(scrollbackOptions).getByRole('radio', { name: '5,000 行' })).not.toBeChecked()
    fireEvent.click(within(scrollbackOptions).getByRole('radio', { name: '5,000 行' }))
    expect(within(scrollbackOptions).getByRole('radio', { name: '5,000 行' })).toBeChecked()
  })

  it('moves settings panes along the navigation order and keeps outgoing content inert', () => {
    render(<SettingsHarness initiallyOpen />)

    const selectionIndicator = document.querySelector('.application-settings-navigation__selection')
    expect(selectionIndicator).toHaveAttribute('data-selection-motion-target', 'shortcuts')

    fireEvent.click(screen.getByRole('button', { name: '终端' }))

    const transition = document.querySelector('.application-settings-pane-transition')
    const currentPane = document.querySelector('[data-application-settings-pane-role="current"]')
    const outgoingPane = document.querySelector('[data-application-settings-pane-role="outgoing"]')
    expect(transition).toHaveAttribute('data-application-settings-pane-direction', 'forward')
    expect(currentPane).toHaveAttribute('data-application-settings-pane', 'terminal')
    expect(outgoingPane).toHaveAttribute('data-application-settings-pane', 'shortcuts')
    expect(outgoingPane).toHaveAttribute('aria-hidden', 'true')
    expect(outgoingPane).toHaveAttribute('inert')
    expect(selectionIndicator).toHaveAttribute('data-selection-motion-target', 'terminal')

    fireEvent.click(screen.getByRole('button', { name: '画布' }))

    expect(transition).toHaveAttribute('data-application-settings-pane-direction', 'backward')
    expect(
      document.querySelector('[data-application-settings-pane-role="current"]')
    ).toHaveAttribute('data-application-settings-pane', 'canvas')
  })

  it('switches terminal workflow construction between progressive and parallel presentation', () => {
    render(<SettingsHarness initiallyOpen />)

    fireEvent.click(screen.getByRole('button', { name: '终端' }))

    const buildModeOptions = screen.getByRole('radiogroup', { name: '工作流搭建动效' })
    expect(within(buildModeOptions).getByRole('radio', { name: /逐步搭建/ })).toBeChecked()
    fireEvent.click(within(buildModeOptions).getByRole('radio', { name: /并行进入/ }))
    expect(within(buildModeOptions).getByRole('radio', { name: /并行进入/ })).toBeChecked()
  })

  it('lets the user control canvas visual noise with an accessible switch', () => {
    render(<SettingsHarness initiallyOpen />)

    fireEvent.click(screen.getByRole('button', { name: '画布' }))

    expect(screen.getByRole('heading', { name: '画布' })).toBeInTheDocument()
    expect(
      screen.getByText('缩小画布时隐藏次要描述和操作；悬停、聚焦或选中时重新显示。')
    ).toBeInTheDocument()
    const toggle = screen.getByRole('switch', { name: '减少视觉噪声' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(toggle).toHaveAttribute('data-selection-motion-state', 'open')
    expect(toggle.style.getPropertyValue('--cc-selection-motion-progress')).toBe('1')

    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(toggle).toHaveAttribute('data-selection-motion-state', 'closing')
  })

  it('lets the user disable quick execution target following from canvas settings', () => {
    render(<SettingsHarness initiallyOpen />)

    fireEvent.click(screen.getByRole('button', { name: '画布' }))

    expect(
      screen.getByText('使用快捷键执行后，将对应终端、流程或组合定位到画布视野中。')
    ).toBeInTheDocument()
    const toggle = screen.getByRole('switch', { name: '快捷执行后跟随目标' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-checked', 'false')
  })
})

function SettingsHarness({ initiallyOpen = false }: { readonly initiallyOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(initiallyOpen)
  const [bindings, setBindings] = useState<ApplicationShortcutBindings>(
    defaultApplicationShortcutBindings
  )
  const [terminalScrollbackRows, setTerminalScrollbackRows] = useState<1000 | 5000 | 10000>(1000)
  const [terminalWorkflowBuildMode, setTerminalWorkflowBuildMode] = useState<
    'parallel' | 'progressive'
  >('progressive')
  const [reduceVisualNoise, setReduceVisualNoise] = useState(true)
  const [followQuickExecutionTarget, setFollowQuickExecutionTarget] = useState(true)

  const changeBinding = (
    command: ApplicationShortcutCommand,
    binding: ApplicationShortcutBinding | null
  ): void => {
    setBindings((current) => ({ ...current, [command]: binding }))
  }

  return (
    <ApplicationSettingsRoot
      bindings={bindings}
      isOpen={isOpen}
      platform="mac"
      onBindingChange={changeBinding}
      onClose={() => setIsOpen(false)}
      onOpen={() => setIsOpen(true)}
      onResetAll={() => setBindings(defaultApplicationShortcutBindings)}
      reduceVisualNoise={reduceVisualNoise}
      onReduceVisualNoiseChange={setReduceVisualNoise}
      followQuickExecutionTarget={followQuickExecutionTarget}
      onFollowQuickExecutionTargetChange={setFollowQuickExecutionTarget}
      terminalScrollbackRows={terminalScrollbackRows}
      onTerminalScrollbackChange={setTerminalScrollbackRows}
      terminalWorkflowBuildMode={terminalWorkflowBuildMode}
      onTerminalWorkflowBuildModeChange={setTerminalWorkflowBuildMode}
    />
  )
}
