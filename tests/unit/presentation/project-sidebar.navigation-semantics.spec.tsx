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
        onReorderProject={vi.fn()}
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
        onReorderProject={vi.fn()}
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
        onReorderProject={vi.fn()}
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
    const collapsedWorkspaceList = document.getElementById(
      `project-${workbench.project.id}-workspaces`
    )
    const collapsedDisclosure = collapsedWorkspaceList?.closest('.project-card__disclosure')
    expect(collapsedWorkspaceList).toBeInTheDocument()
    expect(collapsedDisclosure).toHaveAttribute('aria-hidden', 'true')
    expect(collapsedDisclosure).toHaveAttribute('inert')
    expect(screen.queryByRole('button', { name: 'Git 未初始化 默认工作区' })).toBeNull()

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
        onReorderProject={vi.fn()}
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

  it('reorders a project only after the pointer crosses the drag threshold', () => {
    const alpha = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const beta = createWorkbenchSnapshot('/tmp/beta-project', 'beta-project')
    const gamma = createWorkbenchSnapshot('/tmp/gamma-project', 'gamma-project')
    const onReorderProject = vi.fn()

    render(
      <ProjectSidebar
        workbenches={[alpha, beta, gamma]}
        currentWorkbench={alpha}
        isDesktopRuntime
        actionError={null}
        onAddProject={vi.fn()}
        onArchiveBranchWorkspace={vi.fn()}
        onCheckoutMainBranch={vi.fn()}
        onCreateBranchWorkspace={vi.fn()}
        onDismissActionError={vi.fn()}
        onRemoveProject={vi.fn()}
        onReorderProject={onReorderProject}
        onSelectWorkspace={vi.fn()}
      />
    )

    const projectList = document.querySelector<HTMLElement>('.project-list')!
    const projectCards = [...document.querySelectorAll<HTMLElement>('.project-card')]
    mockRect(projectList, { top: 100, bottom: 400 })
    mockRect(projectCards[0]!, { top: 100, bottom: 180 })
    mockRect(projectCards[1]!, { top: 190, bottom: 270 })
    mockRect(projectCards[2]!, { top: 280, bottom: 360 })

    const gammaTitle = screen.getByRole('button', { name: 'gamma-project' })
    fireEvent.pointerDown(gammaTitle, { button: 0, pointerId: 1, clientX: 20, clientY: 300 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 22, clientY: 302 })
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 22, clientY: 302 })

    expect(onReorderProject).not.toHaveBeenCalled()

    fireEvent.pointerDown(gammaTitle, { button: 0, pointerId: 2, clientX: 20, clientY: 300 })
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 20, clientY: 101 })
    fireEvent.pointerUp(window, { pointerId: 2, clientX: 20, clientY: 101 })

    expect(onReorderProject).toHaveBeenCalledWith(gamma, '/tmp/alpha-project')
    expect(gammaTitle).toHaveAttribute('aria-expanded', 'true')
  })

  it('cancels an armed project reorder with Escape', () => {
    const alpha = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const beta = createWorkbenchSnapshot('/tmp/beta-project', 'beta-project')
    const onReorderProject = vi.fn()

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
        onReorderProject={onReorderProject}
        onSelectWorkspace={vi.fn()}
      />
    )

    const projectList = document.querySelector<HTMLElement>('.project-list')!
    const projectCards = [...document.querySelectorAll<HTMLElement>('.project-card')]
    mockRect(projectList, { top: 100, bottom: 300 })
    mockRect(projectCards[0]!, { top: 100, bottom: 180 })
    mockRect(projectCards[1]!, { top: 190, bottom: 270 })

    const betaTitle = screen.getByRole('button', { name: 'beta-project' })
    fireEvent.pointerDown(betaTitle, { button: 0, pointerId: 2, clientX: 20, clientY: 210 })
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 20, clientY: 101 })
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.pointerUp(window, { pointerId: 2, clientX: 20, clientY: 101 })

    expect(onReorderProject).not.toHaveBeenCalled()
  })
})

function mockRect(element: HTMLElement, input: { readonly top: number; readonly bottom: number }) {
  element.getBoundingClientRect = vi.fn(() => ({
    bottom: input.bottom,
    height: input.bottom - input.top,
    left: 0,
    right: 240,
    top: input.top,
    width: 240,
    x: 0,
    y: input.top,
    toJSON: () => ({})
  }))
}
