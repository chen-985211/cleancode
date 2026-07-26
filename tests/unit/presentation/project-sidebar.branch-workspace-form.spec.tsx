import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { AppShell } from '../../../src/presentation/app-shell/AppShell'
import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'

describe('project sidebar branch workspace form', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: undefined
    })
  })

  it('creates a git branch and its independent worktree through the desktop runtime API', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const featureWorkbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
      workspaceId: 'feature/sidebar',
      workspaceDirectory: '/tmp/alpha-project-worktrees/feature-sidebar',
      gitBranch: 'feature/sidebar'
    })
    const createBranchWorkspace = vi.fn(async () => featureWorkbench)

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench]),
        createBranchWorkspace
      })
    })

    render(<AppShell />)
    const projectCard = await screen.findByRole('group', { name: '项目 alpha-project' })
    const createBranchWorkspaceButton = within(projectCard).getByRole('button', {
      name: '新建分支工作区'
    })

    fireEvent.click(createBranchWorkspaceButton)
    const branchNameInput = within(projectCard).getByLabelText('分支名称')
    const submitButton = within(projectCard).getByRole('button', { name: '创建 Worktree' })

    expect(branchNameInput).toHaveAttribute('placeholder', '新分支名称')
    expect(within(projectCard).queryByText('同时创建独立 Git worktree')).not.toBeInTheDocument()
    expect(submitButton.querySelector('.lucide-folders')).toBeInTheDocument()
    fireEvent.pointerDown(branchNameInput)
    expect(branchNameInput).toBeInTheDocument()
    fireEvent.change(branchNameInput, {
      target: { value: 'feature/sidebar' }
    })
    fireEvent.click(submitButton)

    await waitFor(() =>
      expect(createBranchWorkspace).toHaveBeenCalledWith({
        projectDirectory: '/tmp/alpha-project',
        branchName: 'feature/sidebar'
      })
    )
    await screen.findByRole('button', { name: 'feature/sidebar 独立工作区' })
  })

  it('cancels branch workspace creation when clicking outside the form', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const createBranchWorkspace = vi.fn()

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench]),
        createBranchWorkspace
      })
    })

    render(<AppShell />)
    const projectCard = await screen.findByRole('group', { name: '项目 alpha-project' })
    const createBranchWorkspaceButton = within(projectCard).getByRole('button', {
      name: '新建分支工作区'
    })

    fireEvent.click(createBranchWorkspaceButton)
    fireEvent.change(within(projectCard).getByLabelText('分支名称'), {
      target: { value: 'feature/draft' }
    })
    fireEvent.pointerDown(document.body)

    expect(within(projectCard).queryByLabelText('分支名称')).not.toBeInTheDocument()
    expect(createBranchWorkspace).not.toHaveBeenCalled()

    fireEvent.click(createBranchWorkspaceButton)
    expect(within(projectCard).getByLabelText('分支名称')).toHaveValue('')

    fireEvent.pointerDown(createBranchWorkspaceButton)
    fireEvent.click(createBranchWorkspaceButton)
    expect(within(projectCard).queryByLabelText('分支名称')).not.toBeInTheDocument()
  })

  it('opens and focuses the current project branch form from its shortcut', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench])
      })
    })

    render(<AppShell />)

    fireEvent.click(await screen.findByRole('button', { name: '收起侧边栏' }))
    fireEvent.keyDown(document, { key: 'n', ...primaryModifier() })

    const branchNameInput = await screen.findByLabelText('分支名称')
    expect(branchNameInput).toHaveFocus()
    expect(screen.getByRole('button', { name: '收起侧边栏' })).toBeInTheDocument()
  })

  it('opens the project chooser from its shortcut', async () => {
    const addProject = vi.fn(async () => undefined)

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({ addProject })
    })

    render(<AppShell />)

    fireEvent.keyDown(document, { key: 'o', ...primaryModifier() })

    await waitFor(() => expect(addProject).toHaveBeenCalledTimes(1))
  })

  it('shows dynamic shortcuts on project sidebar actions', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench])
      })
    })

    render(<AppShell />)

    const addProject = await screen.findByRole('button', { name: '添加项目' })
    fireEvent.pointerMove(addProject, { pointerType: 'mouse' })
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      isMacPlatform() ? '添加项目 (⌘O)' : '添加项目 (Ctrl+O)'
    )

    fireEvent.pointerLeave(addProject, { pointerType: 'mouse' })
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())

    const newBranch = screen.getByRole('button', { name: '新建分支工作区' })
    fireEvent.pointerMove(newBranch, { pointerType: 'mouse' })
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      isMacPlatform() ? '新建分支工作区 (⌘N)' : '新建分支工作区 (Ctrl+N)'
    )
  })

  it('switches to the adjacent workspace once while a shortcut transition is in flight', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
      workspaces: [
        {
          workspaceId: 'main',
          workspaceKind: 'default',
          displayName: 'main',
          directory: '/tmp/alpha-project',
          gitBranch: 'main',
          isCurrent: true
        },
        {
          workspaceId: 'feature/alpha',
          workspaceKind: 'linked-worktree',
          displayName: 'feature/alpha',
          directory: '/tmp/alpha-feature',
          gitBranch: 'feature/alpha',
          isCurrent: false
        }
      ]
    })
    const switchBranchWorkspace = vi.fn(() => new Promise<never>(() => undefined))

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench]),
        switchBranchWorkspace
      })
    })

    render(<AppShell />)

    await screen.findByRole('button', { name: 'feature/alpha 独立工作区' })
    fireEvent.keyDown(document, {
      key: 'ArrowDown',
      shiftKey: true,
      ...primaryModifier()
    })
    fireEvent.keyDown(document, {
      key: 'ArrowDown',
      shiftKey: true,
      ...primaryModifier()
    })

    await waitFor(() =>
      expect(switchBranchWorkspace).toHaveBeenCalledWith({
        projectDirectory: '/tmp/alpha-project',
        workspaceId: 'feature/alpha'
      })
    )
    expect(switchBranchWorkspace).toHaveBeenCalledTimes(1)
  })
})

function primaryModifier(): { readonly metaKey?: true; readonly ctrlKey?: true } {
  return isMacPlatform() ? { metaKey: true } : { ctrlKey: true }
}

function isMacPlatform(): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
}
