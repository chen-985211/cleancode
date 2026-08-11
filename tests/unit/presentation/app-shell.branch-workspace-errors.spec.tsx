import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'
import { NotifiedAppShell } from '../../fixtures/presentation/NotifiedAppShell'
import { createClientAppError } from '../../../src/shared-kernel/application/errors/AppError'

describe('app shell branch workspace errors', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: undefined
    })
  })

  it('shows a user-facing error when creating a duplicate branch workspace', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
      gitBranch: 'main'
    })
    const createBranchWorkspace = vi.fn(async () => {
      throw createClientAppError({
        code: 'GIT_BRANCH_ALREADY_EXISTS',
        correlationId: 'operation-1',
        isExpected: true,
        message: 'Git branch already exists.'
      })
    })

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench]),
        createBranchWorkspace
      })
    })

    render(<NotifiedAppShell />)
    const projectCard = await screen.findByRole('group', { name: '项目 alpha-project' })

    fireEvent.click(within(projectCard).getByRole('button', { name: '新建分支工作区' }))
    fireEvent.change(within(projectCard).getByLabelText('分支名称'), {
      target: { value: 'main' }
    })
    fireEvent.click(within(projectCard).getByRole('button', { name: '创建 Worktree' }))

    await waitFor(() =>
      expect(createBranchWorkspace).toHaveBeenCalledWith({
        projectDirectory: '/tmp/alpha-project',
        branchName: 'main'
      })
    )
    const notificationViewport = await screen.findByLabelText('通知')
    expect(within(notificationViewport).getByRole('alert')).toHaveTextContent(
      'Git 分支已存在，无法创建同名工作区。'
    )
    expect(document.querySelector('.project-sidebar-alert')).toBeNull()
  })
})
