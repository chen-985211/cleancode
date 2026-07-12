import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { AgentConsoleActions } from '../../../src/presentation/app-shell/AgentConsoleActions'

const agent = {
  agentId: 'agent-2',
  layout: { position: { x: 320, y: 140 }, size: { width: 720, height: 460 } },
  name: 'Agent 2',
  projectId: 'project-1',
  workspaceName: 'main'
}

describe('Agent console actions', () => {
  it('keeps secondary actions in a compact menu and starts inline rename from it', () => {
    render(<AgentConsoleActions agent={agent} onRemove={vi.fn()} onRename={vi.fn()} />)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Agent 2 更多操作' }))

    const menu = screen.getByRole('menu', { name: 'Agent 2 操作' })
    expect(screen.getByRole('menuitem', { name: '移除 Agent' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名 Agent' }))

    expect(menu).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Agent 名称' })).toHaveFocus()
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
    expect(dialog).toHaveTextContent('取消未完成审批并删除其对话绑定')
    expect(dialog).toHaveTextContent('不会回滚项目文件、删除 Git 提交或影响其他 Agent')
    fireEvent.click(within(dialog).getByRole('button', { name: '移除' }))

    await waitFor(() => expect(onRemove).toHaveBeenCalledWith(agent))
  })
})
