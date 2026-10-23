import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'
import { AppShell } from '../../../src/presentation/app-shell/shell/AppShell'
import { shortcutBindingsStorageKey } from '../../../src/presentation/app-shell/app-features/shortcuts/applicationShortcutPreference'

describe('app shell workspace branches', () => {
  beforeEach(() => {
    window.localStorage.removeItem(shortcutBindingsStorageKey)
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'MacIntel'
    })
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: undefined
    })
  })

  it('switches branch workspaces through the desktop runtime API', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
      workspaces: [
        {
          workspaceId: 'workspace-main',
          workspaceKind: 'default',
          displayName: 'main',
          directory: '/tmp/alpha-project',
          gitBranch: 'main',
          isCurrent: true
        },
        {
          workspaceId: 'workspace-feature-sidebar',
          workspaceKind: 'linked-worktree',
          displayName: 'feature/sidebar',
          directory: '/tmp/alpha-project-worktrees/feature-sidebar',
          gitBranch: 'feature/sidebar',
          isCurrent: false
        }
      ]
    })
    const switchedWorkbench = {
      ...workbench,
      project: {
        ...workbench.project,
        workspaces: workbench.project.workspaces.map((workspace) => ({
          ...workspace,
          isCurrent: workspace.workspaceId === 'workspace-feature-sidebar'
        }))
      },
      graph: { ...workbench.graph, workspaceId: 'workspace-feature-sidebar' }
    }
    const switchBranchWorkspace = vi.fn(async () => switchedWorkbench)

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench]),
        switchBranchWorkspace
      })
    })

    render(<AppShell />)
    const projectCard = await screen.findByRole('group', { name: '项目 alpha-project' })

    fireEvent.click(within(projectCard).getByRole('button', { name: 'feature/sidebar 独立工作区' }))

    await waitFor(() =>
      expect(switchBranchWorkspace).toHaveBeenCalledWith({
        projectDirectory: '/tmp/alpha-project',
        workspaceId: 'workspace-feature-sidebar'
      })
    )
    await screen.findByText('/tmp/alpha-project-worktrees/feature-sidebar')
  })

  it('shows the bound branch as a default-workspace selector instead of listing every branch', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
      workspaces: [
        {
          workspaceId: 'workspace-main',
          workspaceKind: 'default',
          displayName: 'main',
          directory: '/tmp/alpha-project',
          gitBranch: 'main',
          isCurrent: true
        },
        {
          workspaceId: 'feature/worktree',
          workspaceKind: 'linked-worktree',
          displayName: 'feature/worktree',
          directory: '/tmp/alpha-project-worktrees/feature-worktree',
          gitBranch: 'feature/worktree',
          isCurrent: false
        }
      ],
      gitBranches: [
        {
          name: 'feature/free',
          isCurrent: false,
          isMainWorkspaceBranch: false,
          worktreeDirectory: null,
          isSelectableInMainWorkspace: true,
          isLocked: false,
          lockReason: null
        },
        {
          name: 'feature/worktree',
          isCurrent: false,
          isMainWorkspaceBranch: false,
          worktreeDirectory: '/tmp/alpha-project-worktrees/feature-worktree',
          isSelectableInMainWorkspace: false,
          isLocked: false,
          lockReason: null
        },
        {
          name: 'main',
          isCurrent: true,
          isMainWorkspaceBranch: true,
          worktreeDirectory: '/tmp/alpha-project',
          isSelectableInMainWorkspace: false,
          isLocked: false,
          lockReason: null
        }
      ]
    })

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench])
      })
    })

    render(<AppShell />)
    const projectCard = await screen.findByRole('group', { name: '项目 alpha-project' })

    expect(within(projectCard).getByRole('button', { name: '切换到默认工作区 main' })).toBeEnabled()
    expect(
      within(projectCard).getByRole('button', { name: '选择默认工作区分支 main' })
    ).toBeEnabled()
    expect(within(projectCard).getByText('默认工作区')).toBeInTheDocument()
    expect(within(projectCard).queryByRole('button', { name: /feature\/free/ })).toBeNull()
    const worktreeWorkspaceButton = within(projectCard).getByRole('button', {
      name: 'feature/worktree 独立工作区'
    })

    expect(worktreeWorkspaceButton).toBeEnabled()
    expect(worktreeWorkspaceButton).toHaveAccessibleName('feature/worktree 独立工作区')
    const worktreeIndicator =
      worktreeWorkspaceButton.querySelector<HTMLElement>('.workspace-row__kind')!

    expect(worktreeIndicator).toBeInTheDocument()
    expect(worktreeIndicator).toHaveAttribute('aria-hidden', 'true')
    expect(worktreeIndicator.querySelector('svg')).toBeInTheDocument()
    expect(within(worktreeWorkspaceButton).queryByText('worktree')).not.toBeInTheDocument()

    const branchTrigger = within(projectCard).getByRole('button', {
      name: '选择默认工作区分支 main'
    })
    fireEvent.click(branchTrigger)

    const branchDialog = await screen.findByRole('dialog', { name: '选择默认工作区分支' })
    const branchOptionButtons = within(branchDialog).getAllByRole('button')
    const branchSearch = within(branchDialog).getByPlaceholderText('搜索分支')

    expect(branchDialog.parentElement).toBe(document.body)
    expect(branchSearch).toBeInTheDocument()
    expect(branchOptionButtons[0]).toHaveAccessibleName('main')
    expect(within(branchDialog).getByRole('button', { name: /feature\/free/ })).toBeEnabled()
    expect(
      within(branchDialog).getByRole('button', { name: /feature\/worktree.*独立工作区/ })
    ).toBeDisabled()

    fireEvent.pointerDown(branchSearch)
    expect(branchDialog).toBeInTheDocument()
    firePointerSequence(document.body)

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '选择默认工作区分支' })).not.toBeInTheDocument()
    )
  })

  it('switches to main when clicking the default workspace row body', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
      workspaceId: 'test',
      workspaceDirectory: '/tmp/alpha-project-worktrees/test',
      gitBranch: 'test',
      workspaces: [
        {
          workspaceId: 'workspace-main',
          workspaceKind: 'default',
          displayName: 'main',
          directory: '/tmp/alpha-project',
          gitBranch: 'main',
          isCurrent: false
        },
        {
          workspaceId: 'test',
          workspaceKind: 'linked-worktree',
          displayName: 'test',
          directory: '/tmp/alpha-project-worktrees/test',
          gitBranch: 'test',
          isCurrent: true
        }
      ],
      gitBranches: [
        {
          name: 'main',
          isCurrent: false,
          isMainWorkspaceBranch: true,
          worktreeDirectory: '/tmp/alpha-project',
          isSelectableInMainWorkspace: false,
          isLocked: false,
          lockReason: null
        },
        {
          name: 'test',
          isCurrent: true,
          isMainWorkspaceBranch: false,
          worktreeDirectory: '/tmp/alpha-project-worktrees/test',
          isSelectableInMainWorkspace: false,
          isLocked: false,
          lockReason: null
        }
      ]
    })
    const switchedWorkbench = {
      ...workbench,
      project: {
        ...workbench.project,
        workspaces: workbench.project.workspaces.map((workspace) => ({
          ...workspace,
          gitBranch: 'main'
        }))
      }
    }
    const switchBranchWorkspace = vi.fn(async () => switchedWorkbench)

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench]),
        switchBranchWorkspace
      })
    })

    render(<AppShell />)
    const projectCard = await screen.findByRole('group', { name: '项目 alpha-project' })

    fireEvent.click(within(projectCard).getByRole('button', { name: '切换到默认工作区 main' }))

    await waitFor(() =>
      expect(switchBranchWorkspace).toHaveBeenCalledWith({
        projectDirectory: '/tmp/alpha-project',
        workspaceId: 'workspace-main'
      })
    )
    expect(screen.queryByRole('dialog', { name: '选择默认工作区分支' })).not.toBeInTheDocument()
  })

  it('marks worktree rows without repeating the branch name or current marker', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
      workspaces: [
        {
          workspaceId: 'main',
          workspaceKind: 'default',
          displayName: 'main',
          directory: '/tmp/alpha-project',
          gitBranch: 'main',
          isCurrent: false
        },
        {
          workspaceId: 'test',
          workspaceKind: 'linked-worktree',
          displayName: 'test',
          directory: '/tmp/alpha-project-worktrees/test',
          gitBranch: 'test',
          isCurrent: true
        }
      ]
    })

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench])
      })
    })

    render(<AppShell />)
    const projectCard = await screen.findByRole('group', { name: '项目 alpha-project' })

    expect(within(projectCard).getByRole('button', { name: 'test 独立工作区' })).toBeEnabled()
    expect(within(projectCard).queryByText('当前')).not.toBeInTheDocument()
    expect(within(projectCard).queryByRole('button', { name: 'test 当前 test' })).toBeNull()
  })

  it('checks out a selectable local branch in the main workspace', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
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
          name: 'feature/free',
          isCurrent: false,
          isMainWorkspaceBranch: false,
          worktreeDirectory: null,
          isSelectableInMainWorkspace: true,
          isLocked: false,
          lockReason: null
        }
      ]
    })
    const checkedOutWorkbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
      gitBranch: 'feature/free',
      gitBranches: [
        {
          name: 'main',
          isCurrent: false,
          isMainWorkspaceBranch: false,
          worktreeDirectory: null,
          isSelectableInMainWorkspace: true,
          isLocked: false,
          lockReason: null
        },
        {
          name: 'feature/free',
          isCurrent: true,
          isMainWorkspaceBranch: true,
          worktreeDirectory: '/tmp/alpha-project',
          isSelectableInMainWorkspace: false,
          isLocked: false,
          lockReason: null
        }
      ]
    })
    const checkoutMainWorkspaceBranch = vi.fn(async () => checkedOutWorkbench)

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench]),
        checkoutMainWorkspaceBranch
      })
    })

    render(<AppShell />)
    const projectCard = await screen.findByRole('group', { name: '项目 alpha-project' })

    fireEvent.click(within(projectCard).getByRole('button', { name: '选择默认工作区分支 main' }))
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: '选择默认工作区分支' })).getByRole(
        'button',
        { name: /feature\/free/ }
      )
    )

    await waitFor(() =>
      expect(checkoutMainWorkspaceBranch).toHaveBeenCalledWith({
        projectDirectory: '/tmp/alpha-project',
        branchName: 'feature/free'
      })
    )
    await screen.findByRole('button', { name: '切换到默认工作区 feature/free' })
    expect(screen.queryByText('默认工作区')).not.toBeInTheDocument()
  })
})

function firePointerSequence(target: Element): void {
  fireEvent.pointerDown(target, { button: 0, pointerId: 1 })
  fireEvent.pointerUp(target, { button: 0, pointerId: 1 })
  fireEvent.click(target, { button: 0 })
}
