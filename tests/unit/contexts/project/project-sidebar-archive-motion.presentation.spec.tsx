import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'

import { ProjectSidebar } from '../../../../src/contexts/project/presentation/components/ProjectSidebar'
import { createWorkbenchSnapshot } from '../../../fixtures/presentation/appShellFixtures'

describe('project sidebar workspace archive feedback', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(32)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it.each([false, true])(
    'keeps the complete row busy until the operation settles (detached: %s)',
    async (detached) => {
      const operation = deferred()
      const props = createProps(detached)
      props.onArchiveBranchWorkspace.mockReturnValue(operation.promise)
      render(<ProjectSidebar {...props} />)
      const select = screen.getByRole('button', { name: 'feature 独立工作区' })
      const row = select.closest('.workspace-group')!

      const confirm = confirmArchive()
      fireEvent.click(confirm)

      expect(row).toHaveAttribute('aria-busy', 'true')
      expect(row.querySelector('.workspace-archive-row__liquid')).not.toBeNull()
      expect(select).toBeDisabled()
      fireEvent.click(select)
      expect(props.onSelectWorkspace).not.toHaveBeenCalled()
      expect(props.onArchiveBranchWorkspace).toHaveBeenCalledTimes(1)
      act(() => vi.advanceTimersByTime(5000))
      expect(row).toHaveAttribute('aria-busy', 'true')
      expect(row).toBeInTheDocument()

      await act(async () => operation.resolve())
      expect(row).not.toHaveAttribute('aria-busy')
      expect(select).toBeEnabled()
      expect(row).toBeInTheDocument()
    }
  )

  it('stops filling after a rejected operation and leaves the row available for retry', async () => {
    const operation = deferred()
    const props = createProps()
    props.onArchiveBranchWorkspace.mockReturnValue(operation.promise)
    render(<ProjectSidebar {...props} />)
    const select = screen.getByRole('button', { name: 'feature 独立工作区' })
    const row = select.closest('.workspace-group')!
    confirmArchive()

    await act(async () => operation.reject(new Error('archive refused')))

    expect(row).not.toHaveAttribute('aria-busy')
    expect(row).not.toHaveAttribute('inert')
    expect(select).toBeEnabled()
    expect(row.querySelector('.workspace-archive-row__liquid')).toBeNull()
    confirmArchive()
    expect(props.onArchiveBranchWorkspace).toHaveBeenCalledTimes(2)
    await act(async () => undefined)
  })

  it('fills horizontally with a slowing curve and keeps room for the actual result', () => {
    const operation = deferred()
    const props = createProps()
    props.onArchiveBranchWorkspace.mockReturnValue(operation.promise)
    render(<ProjectSidebar {...props} />)
    const row = screen
      .getByRole('button', { name: 'feature 独立工作区' })
      .closest<HTMLElement>('.workspace-group')!
    confirmArchive()

    act(() => vi.advanceTimersByTime(1000))
    const first = fillProgress(row)
    expect(first).toBeGreaterThan(0)
    act(() => vi.advanceTimersByTime(1000))
    const second = fillProgress(row)
    expect(second).toBeGreaterThan(first)
    expect(second - first).toBeLessThan(first)
    act(() => vi.advanceTimersByTime(30000))
    expect(fillProgress(row)).toBeGreaterThanOrEqual(second)
    expect(fillProgress(row)).toBeLessThan(1)
    expect(row).toHaveAttribute('aria-busy', 'true')
    expect(row.style.height).toBe('auto')
  })

  it.each([0, 4000])(
    'accelerates from the current fill before collapsing after success (wait: %sms)',
    async (wait) => {
      const operation = deferred()
      const props = createProps()
      props.onArchiveBranchWorkspace.mockReturnValue(operation.promise)
      const { rerender } = render(<ProjectSidebar {...props} />)
      const row = screen
        .getByRole('button', { name: 'feature 独立工作区' })
        .closest<HTMLElement>('.workspace-group')!
      confirmArchive()
      act(() => vi.advanceTimersByTime(wait))
      const before = fillProgress(row)
      const archived = {
        ...props.currentWorkbench,
        project: {
          ...props.currentWorkbench.project,
          workspaces: props.currentWorkbench.project.workspaces.filter(
            (workspace) => workspace.workspaceId !== 'feature'
          )
        }
      }

      rerender(<ProjectSidebar {...props} currentWorkbench={archived} workbenches={[archived]} />)

      expect(row).toHaveAttribute('inert')
      expect(row).toHaveAttribute('aria-hidden', 'true')
      expect(fillProgress(row)).toBe(before)
      act(() => vi.advanceTimersByTime(80))
      expect(fillProgress(row)).toBeGreaterThan(before)
      expect(fillProgress(row)).toBeLessThan(1)
      expect(row.style.height).toBe('auto')
      act(() => vi.advanceTimersByTime(320))
      expect(fillProgress(row)).toBe(1)
      expect(Number.parseFloat(row.style.height)).toBeLessThan(32)
      act(() => vi.advanceTimersByTime(2000))
      expect(row).not.toBeInTheDocument()
      await act(async () => operation.resolve())
    }
  )

  it.each([false, true])(
    'only retires the row after the authoritative snapshot removes it (reduced motion: %s)',
    async (reduced) => {
      vi.spyOn(window, 'matchMedia').mockReturnValue(mediaQuery(reduced))
      const operation = deferred()
      const props = createProps()
      props.onArchiveBranchWorkspace.mockReturnValue(operation.promise)
      const { rerender } = render(<ProjectSidebar {...props} />)
      const row = screen
        .getByRole('button', { name: 'feature 独立工作区' })
        .closest<HTMLElement>('.workspace-group')!
      const neighbor = screen.getByRole('button', { name: 'other 独立工作区' })
      confirmArchive()
      const archived = {
        ...props.currentWorkbench,
        project: {
          ...props.currentWorkbench.project,
          workspaces: props.currentWorkbench.project.workspaces.filter(
            (workspace) => workspace.workspaceId !== 'feature'
          )
        }
      }

      rerender(<ProjectSidebar {...props} currentWorkbench={archived} workbenches={[archived]} />)

      expect(screen.queryByRole('button', { name: 'feature 独立工作区' })).toBeNull()
      expect(screen.getByRole('button', { name: 'other 独立工作区' })).toBe(neighbor)
      expect(row).toBeInTheDocument()
      expect(row).toHaveAttribute('inert')
      expect(row).toHaveAttribute('data-workspace-archive-state', 'exiting')
      act(() => vi.advanceTimersByTime(400))
      expect(Number.parseFloat(row.style.height)).toBeGreaterThan(0)
      expect(Number.parseFloat(row.style.height)).toBeLessThan(32)
      act(() => vi.advanceTimersByTime(2000))
      expect(row).not.toBeInTheDocument()
      await act(async () => operation.resolve())
    }
  )

  it.each([80, 200])('restores the same row from its current exit position at %sms', (elapsed) => {
    const props = createProps()
    const { rerender, unmount } = render(<ProjectSidebar {...props} />)
    const row = screen
      .getByRole('button', { name: 'feature 独立工作区' })
      .closest<HTMLElement>('.workspace-group')!
    const removed = {
      ...props.currentWorkbench,
      project: {
        ...props.currentWorkbench.project,
        workspaces: props.currentWorkbench.project.workspaces.filter(
          (workspace) => workspace.workspaceId !== 'feature'
        )
      }
    }
    rerender(<ProjectSidebar {...props} currentWorkbench={removed} workbenches={[removed]} />)
    act(() => vi.advanceTimersByTime(elapsed))
    const intermediateHeight = row.style.height

    rerender(<ProjectSidebar {...props} />)

    expect(
      screen.getByRole('button', { name: 'feature 独立工作区' }).closest('.workspace-group')
    ).toBe(row)
    expect(row.style.height).toBe(intermediateHeight)
    expect(row).toHaveAttribute('data-workspace-row-motion', 'opening')
    expect(row).not.toHaveAttribute('inert')
    act(() => vi.advanceTimersByTime(2000))
    expect(row.style.height).toBe('auto')
    expect(row).toHaveAttribute('data-workspace-row-motion', 'open')
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels a pending fill completion when the authoritative row returns', async () => {
    const operation = deferred()
    const props = createProps()
    props.onArchiveBranchWorkspace.mockReturnValue(operation.promise)
    const { rerender, unmount } = render(<ProjectSidebar {...props} />)
    const row = screen
      .getByRole('button', { name: 'feature 独立工作区' })
      .closest<HTMLElement>('.workspace-group')!
    confirmArchive()
    act(() => vi.advanceTimersByTime(300))
    const removed = {
      ...props.currentWorkbench,
      project: {
        ...props.currentWorkbench.project,
        workspaces: props.currentWorkbench.project.workspaces.filter(
          (workspace) => workspace.workspaceId !== 'feature'
        )
      }
    }
    rerender(<ProjectSidebar {...props} currentWorkbench={removed} workbenches={[removed]} />)
    act(() => vi.advanceTimersByTime(80))
    const progress = fillProgress(row)

    rerender(<ProjectSidebar {...props} />)

    expect(fillProgress(row)).toBe(progress)
    expect(row).not.toHaveAttribute('inert')
    act(() => vi.advanceTimersByTime(2000))
    expect(row).toBeInTheDocument()
    expect(row.style.height).toBe('auto')
    await act(async () => operation.resolve())
    expect(row.querySelector('.workspace-archive-row__liquid')).toBeNull()
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps the selection material attached through animated removal with the system preference enabled', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(mediaQuery(true))
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(224)
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      if (this.dataset.selectionMotionOption !== 'other') return 0
      return this.parentElement?.querySelectorAll('.workspace-group').length === 3 ? 68 : 34
    })
    const props = createProps()
    const workbench = {
      ...props.currentWorkbench,
      project: {
        ...props.currentWorkbench.project,
        workspaces: props.currentWorkbench.project.workspaces.map((workspace) => ({
          ...workspace,
          isCurrent: workspace.workspaceId === 'other'
        }))
      }
    }
    const { rerender } = render(
      <ProjectSidebar {...props} currentWorkbench={workbench} workbenches={[workbench]} />
    )
    const indicator = document.querySelector<HTMLElement>('.workspace-list__selection')!
    expect(indicator.style.getPropertyValue('--cc-selection-motion-y')).toBe('68px')
    const archived = {
      ...workbench,
      project: {
        ...workbench.project,
        workspaces: workbench.project.workspaces.filter(
          (workspace) => workspace.workspaceId !== 'feature'
        )
      }
    }

    rerender(<ProjectSidebar {...props} currentWorkbench={archived} workbenches={[archived]} />)

    act(() => vi.advanceTimersByTime(2000))
    expect(indicator.style.getPropertyValue('--cc-selection-motion-y')).toBe('34px')
  })

  it('keeps live workspace order authoritative while retaining row identities', () => {
    const props = createProps()
    const { rerender } = render(<ProjectSidebar {...props} />)
    const feature = screen.getByRole('button', { name: 'feature 独立工作区' })
    const [main, first, second] = props.currentWorkbench.project.workspaces
    const reordered = {
      ...props.currentWorkbench,
      project: { ...props.currentWorkbench.project, workspaces: [main, second, first] }
    }

    rerender(<ProjectSidebar {...props} currentWorkbench={reordered} workbenches={[reordered]} />)

    expect(
      Array.from(document.querySelectorAll('.workspace-group')).map((row) =>
        row.getAttribute('data-selection-motion-option')
      )
    ).toEqual(['main', 'other', 'feature'])
    expect(screen.getByRole('button', { name: 'feature 独立工作区' })).toBe(feature)
  })
})

function fillProgress(row: HTMLElement): number {
  return Number(
    row
      .querySelector<HTMLElement>('.workspace-archive-row__liquid-surface')
      ?.style.getPropertyValue('--workspace-archive-fill')
  )
}

function confirmArchive(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: '打开 feature 工作区菜单' }))
  fireEvent.click(screen.getByRole('menuitem', { name: '归档工作区' }))
  const confirm = within(screen.getByRole('dialog', { name: '归档工作区 feature' })).getByRole(
    'button',
    { name: '归档工作区' }
  )
  fireEvent.click(confirm)
  return confirm
}

function createProps(detached = false) {
  const workbench = createWorkbenchSnapshot('/tmp/archive-motion', 'archive-motion', {
    workspaces: [
      {
        workspaceId: 'main',
        workspaceKind: 'default',
        displayName: 'main',
        directory: '/tmp/archive-motion',
        gitBranch: 'main',
        isCurrent: true
      },
      {
        workspaceId: 'feature',
        workspaceKind: 'linked-worktree',
        displayName: 'feature',
        directory: '/tmp/archive-motion-feature',
        gitBranch: detached ? null : 'feature',
        isCurrent: false
      },
      {
        workspaceId: 'other',
        workspaceKind: 'linked-worktree',
        displayName: 'other',
        directory: '/tmp/archive-motion-other',
        gitBranch: 'other',
        isCurrent: false
      }
    ]
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

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function mediaQuery(matches: boolean): MediaQueryList {
  return {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  }
}
