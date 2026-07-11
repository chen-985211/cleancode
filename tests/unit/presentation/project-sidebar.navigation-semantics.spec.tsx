import { render, screen, within } from '@testing-library/react'

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

    expect(screen.getByRole('button', { name: projectName })).toHaveAttribute('title', projectName)
    expect(screen.getByRole('button', { name: '切换到默认工作区 main' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.getByRole('button', { name: '切换到默认工作区 main' })).toHaveAttribute(
      'title',
      'main'
    )
  })
})
