import { fireEvent, render, screen, within } from '@testing-library/react'

import { ProjectSidebar } from '../../../src/presentation/app-shell/ProjectSidebar'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'

describe('project sidebar navigation semantics', () => {
  it('describes a project without git instead of presenting a fake main branch', () => {
    const workbench = createWorkbenchSnapshot('/tmp/non-git-project', 'non-git-project')

    render(
      <ProjectSidebar
        workbenches={[workbench]}
        currentWorkbench={workbench}
        isDesktopRuntime
        actionError={null}
        onAddProject={vi.fn()}
        onArchiveBranchWorkspace={vi.fn()}
        onCheckoutMainBranch={vi.fn()}
        onCreateBranchWorkspace={vi.fn()}
        onDismissActionError={vi.fn()}
        onRemoveProject={vi.fn()}
        onSelectWorkspace={vi.fn()}
      />
    )

    const defaultWorkspace = screen.getByRole('button', {
      name: 'Git 未初始化 默认工作区'
    })

    expect(within(defaultWorkspace).getByText('Git 未初始化')).toBeInTheDocument()
    expect(within(defaultWorkspace).getByText('默认工作区')).toBeInTheDocument()
    expect(within(defaultWorkspace).queryByText('main')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /选择默认工作区分支/ })).not.toBeInTheDocument()
  })

  it('identifies the current workspace and preserves complete navigation labels', () => {
    const projectName = 'a-project-name-that-does-not-fit-in-the-sidebar'
    const workbench = createWorkbenchSnapshot('/tmp/long-project', projectName, {
      gitBranch: 'main'
    })

    render(
      <ProjectSidebar
        workbenches={[workbench]}
        currentWorkbench={workbench}
        isDesktopRuntime
        actionError={null}
        onAddProject={vi.fn()}
        onArchiveBranchWorkspace={vi.fn()}
        onCheckoutMainBranch={vi.fn()}
        onCreateBranchWorkspace={vi.fn()}
        onDismissActionError={vi.fn()}
        onRemoveProject={vi.fn()}
        onSelectWorkspace={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: projectName })).toHaveAttribute(
      'title',
      `收起项目 ${projectName}`
    )
    expect(screen.getByRole('button', { name: '切换到默认工作区 main' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.getByRole('button', { name: '切换到默认工作区 main' })).toHaveAttribute(
      'title',
      'main'
    )
  })

  it('collapses a project without selecting or changing its current workspace', () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const onSelectWorkspace = vi.fn()

    render(
      <ProjectSidebar
        workbenches={[workbench]}
        currentWorkbench={workbench}
        isDesktopRuntime
        actionError={null}
        onAddProject={vi.fn()}
        onArchiveBranchWorkspace={vi.fn()}
        onCheckoutMainBranch={vi.fn()}
        onCreateBranchWorkspace={vi.fn()}
        onDismissActionError={vi.fn()}
        onRemoveProject={vi.fn()}
        onSelectWorkspace={onSelectWorkspace}
      />
    )

    const collapseProject = screen.getByRole('button', { name: 'alpha-project' })
    expect(collapseProject).toHaveAttribute('aria-expanded', 'true')
    expect(collapseProject.querySelector('svg')).toBeNull()
    expect(screen.getByRole('button', { name: 'Git 未初始化 默认工作区' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '新建分支工作区' }))
    expect(screen.getByLabelText('分支名称')).toBeVisible()

    fireEvent.click(collapseProject)

    expect(onSelectWorkspace).not.toHaveBeenCalled()
    expect(collapseProject).toHaveAttribute('aria-expanded', 'false')
    expect(collapseProject).toHaveAttribute('title', '展开项目 alpha-project')
    expect(
      screen.queryByRole('button', { name: 'Git 未初始化 默认工作区' })
    ).not.toBeInTheDocument()

    fireEvent.click(collapseProject)

    expect(screen.getByRole('button', { name: 'Git 未初始化 默认工作区' })).toBeVisible()
    expect(screen.queryByLabelText('分支名称')).not.toBeInTheDocument()
    expect(onSelectWorkspace).not.toHaveBeenCalled()
  })

  it('keeps project disclosure state independent for each project', () => {
    const alpha = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const beta = createWorkbenchSnapshot('/tmp/beta-project', 'beta-project')

    render(
      <ProjectSidebar
        workbenches={[alpha, beta]}
        currentWorkbench={alpha}
        isDesktopRuntime
        actionError={null}
        onAddProject={vi.fn()}
        onArchiveBranchWorkspace={vi.fn()}
        onCheckoutMainBranch={vi.fn()}
        onCreateBranchWorkspace={vi.fn()}
        onDismissActionError={vi.fn()}
        onRemoveProject={vi.fn()}
        onSelectWorkspace={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'alpha-project' }))

    expect(
      within(screen.getByRole('group', { name: '项目 alpha-project' })).queryByRole('button', {
        name: 'Git 未初始化 默认工作区'
      })
    ).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('group', { name: '项目 beta-project' })).getByRole('button', {
        name: 'Git 未初始化 默认工作区'
      })
    ).toBeVisible()
  })
})
