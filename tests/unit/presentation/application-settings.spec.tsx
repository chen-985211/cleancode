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
    fireEvent.pointerDown(trigger, { pointerType: 'mouse' })
    fireEvent.click(trigger)

    const dialog = screen.getByRole('dialog', { name: '设置' })
    expect(dialog).toHaveClass('application-settings-surface')
    expect(screen.getByText('保留的终端状态')).toBeInTheDocument()
    expect(screen.getByLabelText('项目区域').inert).toBe(true)
    expect(screen.getByLabelText('工作区状态').inert).toBe(true)
    expect(screen.getByRole('navigation', { name: '设置导航' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '快捷键' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: '快捷键' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '修改“切换侧边栏”快捷键' })).toHaveTextContent('⌘B')
    expect(screen.getByRole('button', { name: '返回工作区' })).toHaveFocus()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: '设置' })).not.toBeInTheDocument()
    expect(screen.getByText('保留的终端状态')).toBeInTheDocument()
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

    fireEvent.click(terminalRecorder)
    expect(terminalRecorder).toHaveAttribute('aria-pressed', 'true')
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
})

function SettingsHarness({ initiallyOpen = false }: { readonly initiallyOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(initiallyOpen)
  const [bindings, setBindings] = useState<ApplicationShortcutBindings>(
    defaultApplicationShortcutBindings
  )

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
    />
  )
}
