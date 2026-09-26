import { fireEvent, render, screen } from '@testing-library/react'
import {
  applicationShortcutCommands,
  defaultApplicationShortcutBindings,
  type ApplicationShortcutBindings,
  type ShortcutPlatform
} from '../../../src/presentation/app-shell/app-features/shortcuts/applicationShortcuts'
import {
  useApplicationShortcuts,
  type ApplicationShortcutActions
} from '../../../src/presentation/app-shell/app-features/shortcuts/useApplicationShortcuts'
import { AppShellProjectArea } from '../../../src/presentation/app-shell/shell/project-sidebar/AppShellProjectArea'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'

describe('task view keyboard navigation', () => {
  beforeEach(() => {
    const matchMedia = window.matchMedia.bind(window)
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      ...matchMedia(query),
      matches: query === '(prefers-reduced-motion: reduce)'
    }))
    window.cleancode = {
      listProjectIssues: async () => ({
        repository: { name: 'owner/repo', defaultBranch: 'main' },
        issues: [],
        hasMore: false
      })
    } as unknown as NonNullable<Window['cleancode']>
  })
  afterEach(() => {
    delete window.cleancode
    vi.restoreAllMocks()
  })

  it.each([
    { platform: 'mac', key: 'b', metaKey: true },
    { platform: 'other', key: 'b', ctrlKey: true },
    { platform: 'mac', key: 'k', metaKey: true, shiftKey: true }
  ] as const)('keeps sidebar navigation available with $platform / $key', async (shortcut) => {
    const bindings = {
      ...defaultApplicationShortcutBindings,
      toggleSidebar: {
        ...defaultApplicationShortcutBindings.toggleSidebar,
        key: shortcut.key.toUpperCase(),
        shift: 'shiftKey' in shortcut
      }
    }
    const actions = createActions()
    render(<Harness actions={actions} bindings={bindings} platform={shortcut.platform} />)
    const entry = await openTasks()
    const targets = [
      entry,
      screen.getByRole('button', { name: '收起侧边栏' }),
      screen.getByRole('button', { name: 'owner/repo' }),
      screen.getByRole('complementary', { name: '任务' })
    ]
    for (const target of targets) {
      vi.mocked(actions.toggleSidebar.run).mockClear()
      target.focus()
      fireEvent.keyDown(target, shortcut)
      fireEvent.keyDown(target, { ...shortcut, repeat: true })
      expect(actions.toggleSidebar.run).toHaveBeenCalledOnce()
      expect(entry).toHaveAttribute('aria-expanded', 'true')
    }
    if (shortcut.key !== 'b') {
      vi.mocked(actions.toggleSidebar.run).mockClear()
      fireEvent.keyDown(targets[3], { key: 'b', metaKey: true })
      expect(actions.toggleSidebar.run).not.toHaveBeenCalled()
    }
  })

  it('keeps canvas commands isolated and gives inputs and menus ownership of their keys', async () => {
    const actions = createActions()
    render(<Harness actions={actions} />)
    const entry = await openTasks()
    const panel = screen.getByRole('complementary', { name: '任务' })
    for (const target of [entry, panel]) {
      fireEvent.keyDown(target, { key: 't', metaKey: true })
      fireEvent.keyDown(target, { key: 'ArrowRight', metaKey: true })
    }
    const search = screen.getByRole('searchbox', { name: '搜索 Issues' })
    search.focus()
    fireEvent.keyDown(search, { key: 'b', metaKey: true })
    fireEvent.click(screen.getByRole('button', { name: '任务项目' }))
    const menu = screen.getByRole('menu', { name: '任务项目' })
    fireEvent.keyDown(menu, { key: 'b', metaKey: true })
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(entry).toHaveAttribute('aria-expanded', 'true')
    for (const action of Object.values(actions)) expect(action.run).not.toHaveBeenCalled()
  })

  it('closes the initial or reopened list with Escape without focusing the search input', async () => {
    render(<Harness actions={createActions()} />)
    for (let visit = 0; visit < 2; visit += 1) {
      const entry = await openTasks()
      expect(screen.getByRole('searchbox', { name: '搜索 Issues' })).not.toHaveFocus()
      fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
      expect(entry).toHaveAttribute('aria-expanded', 'false')
      expect(entry).toHaveFocus()
    }
  })

  it('cancels the repository editor before closing the task view', async () => {
    render(<Harness actions={createActions()} />)
    const entry = await openTasks()
    fireEvent.click(screen.getByRole('button', { name: 'owner/repo' }))
    const editor = screen.getByRole('textbox', { name: 'GitHub 仓库' })
    expect(editor).toHaveFocus()
    fireEvent.keyDown(editor, { key: 'Escape' })
    expect(screen.queryByRole('textbox', { name: 'GitHub 仓库' })).not.toBeInTheDocument()
    expect(entry).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(entry).toHaveAttribute('aria-expanded', 'false')
  })
})

async function openTasks() {
  const entry = screen.getByRole('button', { name: '任务' })
  entry.focus()
  fireEvent.click(entry)
  await screen.findByRole('button', { name: 'owner/repo' })
  return entry
}

function createActions(): ApplicationShortcutActions {
  return Object.fromEntries(
    applicationShortcutCommands.map((command) => [command, { enabled: true, run: vi.fn() }])
  ) as unknown as ApplicationShortcutActions
}

function Harness({
  actions,
  bindings = defaultApplicationShortcutBindings,
  platform = 'mac'
}: {
  readonly actions: ApplicationShortcutActions
  readonly bindings?: ApplicationShortcutBindings
  readonly platform?: ShortcutPlatform
}) {
  useApplicationShortcuts({ actions, bindings, platform })
  const workbench = createWorkbenchSnapshot('/one', 'One')
  return (
    <main className="app-shell">
      <section className="app-shell__workspace">Canvas</section>
      <AppShellProjectArea
        workbenches={[workbench]}
        currentWorkbench={workbench}
        isDesktopRuntime
        isCollapsed={false}
        toggleRef={{ current: null }}
        motion={{ titlebarRef: { current: null }, sidebarRef: { current: null } }}
        toggleTooltip="Toggle"
        onToggle={actions.toggleSidebar.run}
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
