import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

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
    expect(menu.parentElement).toBe(document.body)
    expect(screen.getByRole('menuitem', { name: '重命名' })).toHaveFocus()
    expect(screen.getByRole('menuitem', { name: '移除' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名' }))

    expect(menu).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Agent 名称' })).toHaveFocus()
  })

  it('supports roving keyboard focus in the action menu', () => {
    render(<AgentConsoleActions agent={agent} onRemove={vi.fn()} onRename={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Agent 2 更多操作' })
    fireEvent.click(trigger)
    const rename = screen.getByRole('menuitem', { name: '重命名' })
    const remove = screen.getByRole('menuitem', { name: '移除' })

    expect(rename).toHaveAttribute('tabindex', '0')
    expect(remove).toHaveAttribute('tabindex', '-1')
    fireEvent.keyDown(rename, { key: 'ArrowDown' })
    expect(remove).toHaveFocus()
    expect(rename).toHaveAttribute('tabindex', '-1')
    expect(remove).toHaveAttribute('tabindex', '0')
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

  it('closes the menu when keyboard focus leaves it', () => {
    render(
      <>
        <AgentConsoleActions agent={agent} onRemove={vi.fn()} onRename={vi.fn()} />
        <button type="button">下一个控件</button>
      </>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Agent 2 更多操作' }))
    const rename = screen.getByRole('menuitem', { name: '重命名' })
    fireEvent.blur(rename, { relatedTarget: screen.getByRole('button', { name: '下一个控件' }) })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('removes an Agent directly from its scoped action menu', async () => {
    const onRemove = vi.fn(async () => undefined)
    render(<AgentConsoleActions agent={agent} onRemove={onRemove} onRename={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Agent 2 更多操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '移除' }))

    await waitFor(() => expect(onRemove).toHaveBeenCalledWith(agent))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes the menu and prevents repeated removal while the request is pending', async () => {
    let finishRemove!: () => void
    const onRemove = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRemove = resolve
        })
    )
    render(<AgentConsoleActions agent={agent} onRemove={onRemove} onRename={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Agent 2 更多操作' })
    fireEvent.click(screen.getByRole('button', { name: 'Agent 2 更多操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '移除' }))

    await waitFor(() => expect(onRemove).toHaveBeenCalledOnce())
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toBeDisabled()

    await act(async () => finishRemove())
    expect(trigger).toBeEnabled()
  })

  it('uses a resilient floating menu and an adequate icon-button target', () => {
    const styles = readFileSync(
      resolve(process.cwd(), 'src/presentation/app-shell/styles/agent-console.css'),
      'utf8'
    )
    const moreButtonRule = styles.split('.agent-console-actions__more {')[1]?.split('}')[0] ?? ''
    const menuRule = styles.split('.agent-console-actions__menu {')[1]?.split('}')[0] ?? ''
    const focusRule = styles
      .split(
        '.agent-console-actions__menu button:hover,\n.agent-console-actions__menu button:focus-visible {'
      )[1]
      ?.split('}')[0]

    expect(moreButtonRule).toContain('width: 30px;')
    expect(moreButtonRule).toContain('height: 30px;')
    expect(menuRule).toContain('position: fixed;')
    expect(focusRule).toContain('outline: 2px solid var(--cc-ring);')
  })
})
