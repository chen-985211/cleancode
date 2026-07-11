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
      workspaceName: 'feature/sidebar',
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
})
