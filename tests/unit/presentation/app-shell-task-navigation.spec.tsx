import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useRef, useState } from 'react'
import { AppShellProjectArea } from '../../../src/presentation/app-shell/shell/project-sidebar/AppShellProjectArea'
import { useProjectSidebarMotion } from '../../../src/presentation/app-shell/shell/project-sidebar/useProjectSidebarMotion'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'

describe('task navigation', () => {
  afterEach(() => {
    delete window.cleancode
    vi.restoreAllMocks()
  })

  it.each([false, true])(
    'keeps the same task view and usable sidebar toggle when initially collapsed is %s',
    async (initialIsCollapsed) => {
      const matchMedia = window.matchMedia.bind(window)
      vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
        ...matchMedia(query),
        matches: query === '(prefers-reduced-motion: reduce)'
      }))
      const workbench = createWorkbenchSnapshot('/one', 'One')
      window.cleancode = {
        listProjectIssues: async () => ({
          repository: { name: 'owner/repo', defaultBranch: 'main' },
          issues: [],
          hasMore: false
        })
      } as unknown as NonNullable<Window['cleancode']>
      function Harness() {
        const [isCollapsed, setIsCollapsed] = useState(initialIsCollapsed)
        const toggleRef = useRef<HTMLButtonElement>(null)
        const motion = useProjectSidebarMotion(isCollapsed)
        return (
          <main className={`app-shell ${isCollapsed ? 'app-shell--sidebar-collapsed' : ''}`}>
            <section className="app-shell__workspace">Canvas</section>
            <AppShellProjectArea
              workbenches={[workbench]}
              currentWorkbench={workbench}
              isDesktopRuntime
              isCollapsed={isCollapsed}
              toggleRef={toggleRef}
              motion={motion}
              toggleTooltip="Toggle"
              onToggle={() => setIsCollapsed((value) => !value)}
              onAddProject={vi.fn()}
              onArchiveBranchWorkspace={vi.fn()}
              onCheckoutMainBranch={vi.fn()}
              onCreateBranchWorkspace={vi.fn()}
              onRemoveProject={vi.fn()}
              onReorderProject={vi.fn()}
              onSelectWorkspace={vi.fn()}
              onCreateIssueWorkspace={vi.fn()}
              onProjectChanged={vi.fn()}
            />
          </main>
        )
      }
      render(<Harness />)
      const layout = document.querySelector<HTMLElement>('.task-surface-host')
      expect(layout).not.toBeNull()
      expect(layout?.style.left).toBe(initialIsCollapsed ? '0px' : '280px')
      // Reveal the navigation first if the application was initially collapsed.
      if (initialIsCollapsed) fireEvent.click(screen.getByRole('button', { name: '展开侧边栏' }))
      fireEvent.click(screen.getByRole('button', { name: '任务' }))
      await screen.findByRole('button', { name: '任务项目' })
      const surface = document.querySelector('.task-surface')
      const toggle = screen.getByRole('button', { name: '收起侧边栏' })
      fireEvent.click(toggle)
      expect(toggle).toHaveAccessibleName('展开侧边栏')
      expect(toggle.closest('[inert]')).toBeNull()
      expect(layout?.style.left).toBe('0px')
      fireEvent.click(toggle)
      expect(toggle).toHaveAccessibleName('收起侧边栏')
      expect(layout?.style.left).toBe('280px')
      expect(document.querySelector('.task-surface')).toBe(surface)
      expect(screen.getByRole('button', { name: '任务' })).toHaveAttribute('aria-expanded', 'true')
      expect(document.querySelector<HTMLElement>('.app-shell__workspace')?.inert).toBe(true)
    }
  )

  it('has one entry above projects and browses another project without switching the canvas', async () => {
    const one = createWorkbenchSnapshot('/one', 'One')
    const two = createWorkbenchSnapshot('/two', 'Two')
    const issue = {
      id: 'I_42',
      repository: 'owner/repo',
      number: 42,
      title: 'Fix resizing',
      url: 'https://github.com/owner/repo/issues/42',
      body: 'Details',
      state: 'OPEN' as const,
      labels: [],
      assignees: []
    }
    const list = vi.fn(async () => ({
      repository: { name: 'owner/repo', defaultBranch: 'main' },
      issues: [issue],
      hasMore: false
    }))
    window.cleancode = {
      listProjectIssues: list,
      getProjectIssue: vi.fn(async () => issue)
    } as unknown as NonNullable<Window['cleancode']>
    const onSelectWorkspace = vi.fn()
    const onCreateIssueWorkspace = vi.fn(async () => true)
    render(
      <main className="app-shell">
        <section className="app-shell__workspace">Canvas</section>
        <div className="app-shell__settings">Settings</div>
        <AppShellProjectArea
          workbenches={[one, two]}
          currentWorkbench={one}
          isDesktopRuntime
          isCollapsed={false}
          toggleRef={{ current: null }}
          motion={{ titlebarRef: { current: null }, sidebarRef: { current: null } }}
          toggleTooltip="Toggle"
          onToggle={vi.fn()}
          onAddProject={vi.fn()}
          onArchiveBranchWorkspace={vi.fn()}
          onCheckoutMainBranch={vi.fn()}
          onCreateBranchWorkspace={vi.fn()}
          onRemoveProject={vi.fn()}
          onReorderProject={vi.fn()}
          onSelectWorkspace={onSelectWorkspace}
          onCreateIssueWorkspace={onCreateIssueWorkspace}
          onProjectChanged={vi.fn()}
        />
      </main>
    )
    const entry = screen.getByRole('button', { name: '任务' })
    const projects = document.querySelector('.project-sidebar__section-header')!
    expect(entry.compareDocumentPosition(projects) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Issues' })).not.toBeInTheDocument()
    const canvas = document.querySelector<HTMLElement>('.app-shell__workspace')!
    const settings = document.querySelector<HTMLElement>('.app-shell__settings')!
    fireEvent.click(entry)
    expect(canvas.inert).toBe(true)
    expect(settings).toHaveAttribute('aria-hidden', 'true')
    expect(entry).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: '任务项目' })).toHaveTextContent('One')
    fireEvent.click(screen.getByRole('button', { name: '任务项目' }))
    expect(screen.getByRole('menuitemradio', { name: 'One' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Two' }))
    fireEvent.click(await screen.findByRole('button', { name: issue.title }))
    await screen.findByRole('heading', { name: issue.title })
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ projectDirectory: '/two' }))
    expect(onSelectWorkspace).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '开始处理' }))
    fireEvent.click(screen.getByRole('button', { name: '创建并开始' }))
    await waitFor(() =>
      expect(onCreateIssueWorkspace).toHaveBeenCalledWith(
        two,
        expect.objectContaining({
          projectDirectory: '/two',
          number: 42
        })
      )
    )
    await waitFor(() => expect(entry).toHaveAttribute('aria-expanded', 'false'))
    expect(document.querySelector('.app-shell__workspace')).toBe(canvas)
    expect(canvas.inert).toBe(false)
    expect(settings).not.toHaveAttribute('aria-hidden')
    fireEvent.click(entry)
    expect(screen.getByRole('button', { name: '任务项目' })).toHaveTextContent('Two')
  })
})
