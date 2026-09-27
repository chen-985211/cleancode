import { join } from 'node:path'
import { act, cleanup, render, screen } from '@testing-library/react'

import { ProjectSidebar } from '../../../../src/contexts/project/presentation/components/ProjectSidebar'
import { createWorkbenchSnapshot } from '../../../fixtures/presentation/appShellFixtures'

const selectedWorkspace = 'issue/249-feat-wezterm'
const previousWorkspace = 'issue/273-feat-add-custom-fonts'
const layoutCases = [
  {
    name: 'sorts a newly registered Issue worktree before an existing worktree',
    before: ['main', previousWorkspace, selectedWorkspace],
    after: ['main', selectedWorkspace, previousWorkspace]
  },
  {
    name: 'inserts a worktree before the selected workspace',
    before: ['main', selectedWorkspace],
    after: ['main', previousWorkspace, selectedWorkspace]
  },
  {
    name: 'removes a worktree before the selected workspace',
    before: ['main', previousWorkspace, selectedWorkspace],
    after: ['main', selectedWorkspace]
  }
]

describe.each([false, true])('workspace selection layout (reduced motion: %s)', (reducedMotion) => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    vi.spyOn(window, 'matchMedia').mockReturnValue({ ...mediaQuery, matches: reducedMotion })
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return this.hasAttribute('data-selection-motion-option') ? 224 : 0
    })
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return this.hasAttribute('data-selection-motion-option') ? 32 : 0
    })
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      const rows = this.parentElement?.querySelectorAll('[data-selection-motion-option]') ?? []
      return Array.from(rows).indexOf(this) * 34
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it.each(layoutCases)(
    'keeps the selection material aligned when the list $name',
    ({ before, after }) => {
      const initial = createSidebarProps(before)
      const { rerender } = render(<ProjectSidebar {...initial} />)
      act(() => vi.advanceTimersByTime(1000))
      expectSelectionToMatchCurrentWorkspace()

      const updated = createSidebarProps(after)
      rerender(
        <ProjectSidebar
          {...initial}
          currentWorkbench={updated.currentWorkbench}
          workbenches={updated.workbenches}
        />
      )
      act(() => vi.advanceTimersByTime(1000))

      expectSelectionToMatchCurrentWorkspace()
      expect(initial.onSelectWorkspace).not.toHaveBeenCalled()
    }
  )
})

function expectSelectionToMatchCurrentWorkspace(): void {
  const current = screen.getByRole('button', { name: `${selectedWorkspace} 独立工作区` })
  const row = current.closest<HTMLElement>('[data-selection-motion-option]')!
  const indicator = document.querySelector<HTMLElement>('.workspace-list__selection')!
  expect(current).toHaveAttribute('aria-current', 'page')
  expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
  expect(indicator).toHaveAttribute('data-selection-motion-state', 'settled')
  expect(indicator.style.getPropertyValue('--cc-selection-motion-y')).toBe(`${row.offsetTop}px`)
  expect(indicator.style.getPropertyValue('--cc-selection-motion-height')).toBe(
    `${row.offsetHeight}px`
  )
  expect(indicator.style.getPropertyValue('--cc-selection-motion-width')).toBe(
    `${row.offsetWidth}px`
  )
}

function createSidebarProps(workspaceIds: string[]) {
  const directory = '/tmp/issue-selection-project'
  const workbench = createWorkbenchSnapshot(directory, 'issue-selection-project', {
    workspaceId: selectedWorkspace,
    workspaceDirectory: join(directory, selectedWorkspace),
    workspaces: workspaceIds.map((workspaceId) => ({
      workspaceId,
      workspaceKind: workspaceId === 'main' ? ('default' as const) : ('linked-worktree' as const),
      displayName: workspaceId,
      directory: workspaceId === 'main' ? directory : join(directory, workspaceId),
      gitBranch: workspaceId,
      isCurrent: workspaceId === selectedWorkspace
    }))
  })
  return {
    currentWorkbench: workbench,
    workbenches: [workbench],
    isDesktopRuntime: true,
    onAddProject: vi.fn(),
    onArchiveBranchWorkspace: vi.fn(),
    onCheckoutMainBranch: vi.fn(),
    onCreateBranchWorkspace: vi.fn(),
    onRemoveProject: vi.fn(),
    onReorderProject: vi.fn(),
    onSelectWorkspace: vi.fn()
  }
}
