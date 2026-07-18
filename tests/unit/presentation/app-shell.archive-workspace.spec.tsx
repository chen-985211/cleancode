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
    fireEvent.click(within(projectCard).getByRole('menuitem', { name: '归档工作区' }))

    const dialog = await screen.findByRole('dialog', { name: '归档工作区 test' })
    expect(
      within(dialog).getByText('当前正在使用该工作区，归档前将自动切回默认工作区。')
    ).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: '归档工作区' }))

    await waitFor(() =>
      expect(archiveBranchWorkspace).toHaveBeenCalledWith({
        projectDirectory: '/tmp/alpha-project',
        workspaceName: 'test'
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
    fireEvent.click(within(projectCard).getByRole('menuitem', { name: '归档工作区' }))
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: '归档工作区 test' })).getByRole('button', {
        name: '归档工作区'
      })
    )

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
    fireEvent.click(within(projectCard).getByRole('menuitem', { name: '归档工作区' }))

    const dialog = await screen.findByRole('dialog', { name: '解除锁并归档工作区 test' })
    expect(within(dialog).getByText(/external agent session/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Git 分支 test 会被保留/)).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: '解除锁并归档' }))

    await waitFor(() =>
      expect(archiveBranchWorkspace).toHaveBeenCalledWith({
        projectDirectory: '/tmp/alpha-project',
        workspaceName: 'test',
        lockedWorktreeConfirmation: { lockReason: 'external agent session' }
      })
    )
  })
})

function createWorkbenchWithTestWorktree(testIsCurrent: boolean, lockReason: string | null = null) {
  return createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
    workspaceName: testIsCurrent ? 'test' : 'main',
    workspaceDirectory: testIsCurrent ? '/tmp/alpha-project-worktrees/test' : '/tmp/alpha-project',
    gitBranch: testIsCurrent ? 'test' : 'main',
    workspaces: [
      {
        name: 'main',
        directory: '/tmp/alpha-project',
        gitBranch: 'main',
        isCurrent: !testIsCurrent
      },
      {
        name: 'test',
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
