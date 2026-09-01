import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { AppShell } from '../../../src/presentation/app-shell/shell/AppShell'
import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'

describe('project sidebar project removal', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: undefined
    })
  })

  it('requires confirmation before removing a remembered project', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const removeProject = vi.fn(async () => [])

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench]),
        removeProject
      })
    })

    render(<AppShell />)
    const projectCard = await screen.findByRole('group', { name: '项目 alpha-project' })

    fireEvent.click(within(projectCard).getByRole('button', { name: '移除项目' }))

    const dialog = screen.getByRole('dialog', { name: '移除项目 alpha-project' })
    expect(removeProject).not.toHaveBeenCalled()
    expect(dialog).not.toHaveAttribute('aria-modal')
    expect(dialog).toHaveClass('project-removal-popover')
    expect(within(dialog).getByText('移除项目？')).toBeInTheDocument()
    expect(within(dialog).getByText('停止会话并从列表移除，本地文件保留。')).toBeInTheDocument()
    expect(document.querySelector('.project-sidebar-confirmation-dialog__backdrop')).toBeNull()

    firePointerSequence(document.body)

    expect(screen.queryByRole('dialog', { name: '移除项目 alpha-project' })).not.toBeInTheDocument()
    expect(removeProject).not.toHaveBeenCalled()

    fireEvent.click(within(projectCard).getByRole('button', { name: '移除项目' }))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '移除项目 alpha-project' })).getByRole('button', {
        name: '取消'
      })
    )

    expect(screen.queryByRole('dialog', { name: '移除项目 alpha-project' })).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: '项目 alpha-project' })).toBeInTheDocument()
    expect(removeProject).not.toHaveBeenCalled()

    fireEvent.click(within(projectCard).getByRole('button', { name: '移除项目' }))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '移除项目 alpha-project' })).getByRole('button', {
        name: '移除'
      })
    )

    await waitFor(() =>
      expect(removeProject).toHaveBeenCalledWith({ projectDirectory: '/tmp/alpha-project' })
    )
    expect(removeProject).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: '项目 alpha-project' })).not.toBeInTheDocument()
    )
    const pane = document.querySelector<HTMLElement>('.react-flow__pane')
    if (!pane) throw new Error('Expected a React Flow pane')
    fireEvent.contextMenu(pane, { clientX: 320, clientY: 240 })
    expect(await screen.findByRole('menuitem', { name: '新建终端积木' })).toBeDisabled()
  })
})

function firePointerSequence(target: Element): void {
  fireEvent.pointerDown(target, { button: 0, pointerId: 1 })
  fireEvent.mouseDown(target, { button: 0 })
  fireEvent.pointerUp(target, { button: 0, pointerId: 1 })
  fireEvent.mouseUp(target, { button: 0 })
  fireEvent.click(target, { button: 0 })
}
