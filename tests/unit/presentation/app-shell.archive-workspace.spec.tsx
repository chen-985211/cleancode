import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'
import { createClientAppError } from '../../../src/shared-kernel/application/errors/AppError'
import { AppShell } from '../../../src/presentation/app-shell/AppShell'

describe('app shell worktree archive', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: undefined
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens the workspace action menu beside the row and supports keyboard dismissal', async () => {
    const workbench = createWorkbenchWithTestWorktree(false)

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench])
      })
    })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      return this.getAttribute('aria-label') === '打开 test 工作区菜单'
        ? new DOMRect(174, 100, 28, 28)
        : new DOMRect()
    })
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return this.getAttribute('role') === 'menu' ? 160 : 0
    })
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return this.getAttribute('role') === 'menu' ? 120 : 0
    })

    render(<AppShell />)
    const projectCard = await screen.findByRole('group', { name: '项目 alpha-project' })
    const trigger = within(projectCard).getByRole('button', {
      name: '打开 test 工作区菜单'
    })

    fireEvent.click(trigger)

    const menu = screen.getByRole('menu')
    const archive = screen.getByRole('menuitem', { name: '归档工作区' })
    expect(menu.parentElement).toBe(document.body)
    await waitFor(() => expect(menu).toHaveStyle({ left: '170px', top: '134px' }))
    expect(menu).toHaveAttribute('data-side', 'bottom')
    expect(archive).toHaveFocus()

    fireEvent.keyDown(archive, { key: 'ArrowDown' })
    expect(archive).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(menu).toHaveAttribute('data-surface-motion-state', 'closing')
    expect(menu).toHaveAttribute('inert')
    expect(trigger).toHaveFocus()

    fireEvent.transitionEnd(menu, { propertyName: 'transform' })
    expect(menu).not.toBeInTheDocument()

    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: '归档工作区' })).toHaveFocus()
    fireEvent.pointerDown(document.body)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('archives a worktree through the row menu after confirmation', async () => {
    const workbench = createWorkbenchWithTestWorktree(true)
    const archivedWorkbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
      gitBranch: 'main',
      gitBranches: [
        {
          name: 'main',
          isCurrent: true,
          isMainWorkspaceBranch: true,
          worktreeDirectory: '/tmp/alpha-project',
          isSelectableInMainWorkspace: false,
          isLocked: false,
          lockReason: null
        },
        {
          name: 'test',
          isCurrent: false,
          isMainWorkspaceBranch: false,
          worktreeDirectory: null,
          isSelectableInMainWorkspace: true,
          isLocked: false,
          lockReason: null
        }
      ]
    })
    const archiveBranchWorkspace = vi.fn(async () => archivedWorkbench)

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench]),
        archiveBranchWorkspace
      })
    })

    render(<AppShell />)
    const projectCard = await screen.findByRole('group', { name: '项目 alpha-project' })

    fireEvent.click(within(projectCard).getByRole('button', { name: '打开 test 工作区菜单' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '归档工作区' }))

    const dialog = await screen.findByRole('dialog', { name: '归档工作区 test' })
    expect(
      within(dialog).getByText('当前正在使用该工作区，归档前将自动切回默认工作区。')
    ).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: '归档工作区' }))
    fireEvent.transitionEnd(dialog, { propertyName: 'opacity' })

    await waitFor(() =>
      expect(archiveBranchWorkspace).toHaveBeenCalledWith({
        projectDirectory: '/tmp/alpha-project',
        workspaceId: 'test'
      })
    )
    await screen.findByRole('button', { name: '切换到默认工作区 main' })
    expect(within(projectCard).queryByRole('button', { name: 'test 独立工作区' })).toBeNull()
  })

  it('shows a clear error when the worktree has uncommitted changes', async () => {
    const workbench = createWorkbenchWithTestWorktree(false)
    const archiveBranchWorkspace = vi.fn(async () => {
      throw createClientAppError({
        code: 'BRANCH_WORKSPACE_HAS_UNCOMMITTED_CHANGES',
        correlationId: 'operation-2',
        isExpected: true,
        message: 'Branch workspace has uncommitted changes.'
      })
    })

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench]),
        archiveBranchWorkspace
      })
    })

    render(<AppShell />)
    const projectCard = await screen.findByRole('group', { name: '项目 alpha-project' })

    fireEvent.click(within(projectCard).getByRole('button', { name: '打开 test 工作区菜单' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '归档工作区' }))
    const dialog = await screen.findByRole('dialog', { name: '归档工作区 test' })
    fireEvent.click(within(dialog).getByRole('button', { name: '归档工作区' }))
    fireEvent.transitionEnd(dialog, { propertyName: 'opacity' })

    expect(await screen.findByRole('alert')).toHaveTextContent('工作区有未提交更改，无法归档。')
    expect(within(projectCard).getByRole('button', { name: 'test 独立工作区' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: '关闭提示' }))

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('requires an explicit unlock confirmation for a locked external worktree', async () => {
    const workbench = createWorkbenchWithTestWorktree(false, 'external agent session')
    const archiveBranchWorkspace = vi.fn(async () => workbench)

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench]),
        archiveBranchWorkspace
      })
    })

    render(<AppShell />)
    const projectCard = await screen.findByRole('group', { name: '项目 alpha-project' })

    fireEvent.click(within(projectCard).getByRole('button', { name: '打开 test 工作区菜单' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '归档工作区' }))

    const dialog = await screen.findByRole('dialog', { name: '解除锁并归档工作区 test' })
    expect(within(dialog).getByText(/external agent session/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Git 分支 test 会被保留/)).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: '解除锁并归档' }))
    fireEvent.transitionEnd(dialog, { propertyName: 'opacity' })

    await waitFor(() =>
      expect(archiveBranchWorkspace).toHaveBeenCalledWith({
        projectDirectory: '/tmp/alpha-project',
        workspaceId: 'test',
        lockedWorktreeConfirmation: { lockReason: 'external agent session' }
      })
    )
  })
})

function createWorkbenchWithTestWorktree(testIsCurrent: boolean, lockReason: string | null = null) {
  return createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
    workspaceId: testIsCurrent ? 'test' : 'main',
    workspaceDirectory: testIsCurrent ? '/tmp/alpha-project-worktrees/test' : '/tmp/alpha-project',
    gitBranch: testIsCurrent ? 'test' : 'main',
    workspaces: [
      {
        workspaceId: 'main',
        workspaceKind: 'default',
        displayName: 'main',
        directory: '/tmp/alpha-project',
        gitBranch: 'main',
        isCurrent: !testIsCurrent
      },
      {
        workspaceId: 'test',
        workspaceKind: 'linked-worktree',
        displayName: 'test',
        directory: '/tmp/alpha-project-worktrees/test',
        gitBranch: 'test',
        isCurrent: testIsCurrent
      }
    ],
    gitBranches: [
      {
        name: 'main',
        isCurrent: true,
        isMainWorkspaceBranch: true,
        worktreeDirectory: '/tmp/alpha-project',
        isSelectableInMainWorkspace: false,
        isLocked: false,
        lockReason: null
      },
      {
        name: 'test',
        isCurrent: false,
        isMainWorkspaceBranch: false,
        worktreeDirectory: '/tmp/alpha-project-worktrees/test',
        isSelectableInMainWorkspace: false,
        isLocked: lockReason !== null,
        lockReason
      }
    ]
  })
}
