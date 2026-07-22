import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { AgentConsoleActions } from '../../../src/presentation/app-shell/AgentConsoleActions'

const agent = {
  agentId: 'agent-2',
  cleancodeMcpEnabled: true,
  layout: { position: { x: 320, y: 140 }, size: { width: 720, height: 460 } },
  name: 'Agent 2',
  projectId: 'project-1',
  providerId: 'codex',
  workspaceName: 'main'
}

describe('Agent console actions', () => {
  it('selects the whole Agent from the title area without treating actions as selection', () => {
    const onSelect = vi.fn()

    render(
      <AgentConsoleActions
        agent={agent}
        onRemove={vi.fn()}
        onRename={vi.fn()}
        onSelect={onSelect}
      />
    )

    const title = screen.getByRole('button', { name: 'Agent 2，双击重命名' })
    fireEvent.click(title)

    expect(onSelect).toHaveBeenCalledOnce()
    expect(title).not.toHaveClass('nodrag')

    fireEvent.click(screen.getByRole('button', { name: 'Agent 2 更多操作' }))
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('keeps secondary actions in a compact menu and starts inline rename from it', () => {
    render(<AgentConsoleActions agent={agent} onRemove={vi.fn()} onRename={vi.fn()} />)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Agent 2 更多操作' }))

    const menu = screen.getByRole('menu', { name: 'Agent 2 操作' })
    expect(screen.getByRole('menuitem', { name: '重命名 Agent' })).toHaveFocus()
    expect(screen.getByRole('menuitem', { name: '移除 Agent' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名 Agent' }))

    expect(menu).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Agent 名称' })).toHaveFocus()
  })

  it('supports roving keyboard focus in the action menu', () => {
    render(<AgentConsoleActions agent={agent} onRemove={vi.fn()} onRename={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Agent 2 更多操作' })
    fireEvent.click(trigger)
    const rename = screen.getByRole('menuitem', { name: '重命名 Agent' })
    const remove = screen.getByRole('menuitem', { name: '移除 Agent' })

    fireEvent.keyDown(rename, { key: 'ArrowDown' })
    expect(remove).toHaveFocus()
    fireEvent.keyDown(remove, { key: 'ArrowDown' })
    expect(rename).toHaveFocus()
    fireEvent.keyDown(rename, { key: 'End' })
    expect(remove).toHaveFocus()
    fireEvent.keyDown(remove, { key: 'Home' })
    expect(rename).toHaveFocus()
  })

  it('closes the action menu on outside pointer down and Escape', () => {
    render(<AgentConsoleActions agent={agent} onRemove={vi.fn()} onRename={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Agent 2 更多操作' })

    fireEvent.click(trigger)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('confirms the impact before removing an Agent', async () => {
    const onRemove = vi.fn(async () => undefined)
    render(<AgentConsoleActions agent={agent} onRemove={onRemove} onRename={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Agent 2 更多操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '移除 Agent' }))

    const dialog = screen.getByRole('dialog', { name: '移除 Agent' })
    expect(within(dialog).getByRole('button', { name: '取消' })).toHaveFocus()
    expect(dialog).toHaveTextContent('取消未完成审批并删除其对话绑定')
    expect(dialog).toHaveTextContent('不会回滚项目文件、删除 Git 提交或影响其他 Agent')
    fireEvent.click(within(dialog).getByRole('button', { name: '移除' }))

    await waitFor(() => expect(onRemove).toHaveBeenCalledWith(agent))
  })

  it('returns focus to the action trigger when removal is cancelled', () => {
    render(<AgentConsoleActions agent={agent} onRemove={vi.fn()} onRename={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Agent 2 更多操作' })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: '移除 Agent' }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))

    expect(screen.queryByRole('dialog', { name: '移除 Agent' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('traps confirmation focus and disables every exit while removal is pending', async () => {
    let finishRemove!: () => void
    const onRemove = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRemove = resolve
        })
    )
    render(<AgentConsoleActions agent={agent} onRemove={onRemove} onRename={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Agent 2 更多操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '移除 Agent' }))
    const dialog = screen.getByRole('dialog', { name: '移除 Agent' })
    const cancel = within(dialog).getByRole('button', { name: '取消' })
    const remove = within(dialog).getByRole('button', { name: '移除' })

    fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true })
    expect(remove).toHaveFocus()
    fireEvent.keyDown(remove, { key: 'Tab' })
    expect(cancel).toHaveFocus()
    fireEvent.click(remove)

    await waitFor(() => expect(onRemove).toHaveBeenCalledOnce())
    expect(dialog).toHaveAttribute('aria-busy', 'true')
    expect(dialog).toHaveFocus()
    expect(cancel).toBeDisabled()
    expect(remove).toBeDisabled()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(dialog).toBeInTheDocument()

    await act(async () => finishRemove())
  })
})
