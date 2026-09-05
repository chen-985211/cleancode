import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

import { ProjectSidebar } from '../../../../src/contexts/project/presentation/components/ProjectSidebar'
import { createWorkbenchSnapshot } from '../../../fixtures/presentation/appShellFixtures'

describe('workspace row menu interaction', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  describe.each([true, false])('when the worktree is current: %s', (isCurrent) => {
    it.each(['pointer', 'ArrowDown', 'ArrowUp'] as const)(
      'closes on a second trigger click and reopens after opening with %s',
      (openingInput) => {
        const { trigger, onSelectWorkspace, onArchiveBranchWorkspace } = renderSidebar(isCurrent)

        if (openingInput === 'pointer') {
          clickWithFocus(trigger)
        } else {
          act(() => trigger.focus())
          fireEvent.keyDown(trigger, { key: openingInput })
        }

        expect(trigger).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByRole('menuitem', { name: '归档工作区' })).toHaveFocus()

        clickWithFocus(trigger)

        expectMenuClosed(trigger)
        expect(trigger).toHaveFocus()

        clickWithFocus(trigger)

        expect(trigger).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByRole('menuitem', { name: '归档工作区' })).toHaveFocus()
        expect(onSelectWorkspace).not.toHaveBeenCalled()
        expect(onArchiveBranchWorkspace).not.toHaveBeenCalled()
      }
    )
  })

  it.each(['outside focus', 'lost focus', 'Escape', 'outside pointer'] as const)(
    'still dismisses the menu on %s',
    (dismissal) => {
      const { trigger } = renderSidebar(true)
      clickWithFocus(trigger)
      const archive = screen.getByRole('menuitem', { name: '归档工作区' })

      switch (dismissal) {
        case 'outside focus':
          act(() => screen.getByRole('button', { name: '添加项目' }).focus())
          break
        case 'lost focus':
          act(() => archive.blur())
          break
        case 'Escape':
          fireEvent.keyDown(archive, { key: 'Escape' })
          break
        case 'outside pointer':
          fireEvent.pointerDown(document.body)
          fireEvent.pointerUp(document.body)
          fireEvent.click(document.body)
          break
      }

      expectMenuClosed(trigger)
      if (dismissal === 'Escape' || dismissal === 'outside pointer') {
        expect(trigger).toHaveFocus()
      }
    }
  )

  it.each(['bottom', 'top'] as const)(
    'preserves the live menu and its motion when reversing below or above the trigger: %s',
    (side) => {
      const frames = installMotionFrames()
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement
      ) {
        return this.getAttribute('aria-label') === '打开 feat 工作区菜单'
          ? new DOMRect(174, side === 'top' ? window.innerHeight - 32 : 100, 28, 28)
          : new DOMRect()
      })
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(80)
      const { trigger } = renderSidebar(true)
      clickWithFocus(trigger)
      const menu = screen.getByRole('menu')
      const position = { left: menu.style.left, top: menu.style.top }

      expect(menu).toHaveAttribute('data-side', side)
      frames.advance(40)
      const openingOpacity = readOpacity(menu)
      expect(openingOpacity).toBeGreaterThan(0)
      expect(openingOpacity).toBeLessThan(1)

      clickWithFocus(trigger)

      expectMenuClosed(trigger)
      expect(menu).toHaveAttribute('inert')
      expect(menu).toHaveStyle({ ...position, visibility: 'visible' })
      expect(readOpacity(menu)).toBe(openingOpacity)
      // The old velocity is carried through the reversal before the spring turns back.
      frames.advance(1)
      expect(readOpacity(menu)).toBeGreaterThan(openingOpacity)
      frames.advance(80)
      const closingOpacity = readOpacity(menu)
      expect(closingOpacity).toBeGreaterThan(0)
      expect(closingOpacity).toBeLessThan(openingOpacity)

      clickWithFocus(trigger)

      expect(screen.getByRole('menu')).toBe(menu)
      expect(menu).not.toHaveAttribute('inert')
      expect(menu).toHaveStyle({ ...position, visibility: 'visible' })
      expect(readOpacity(menu)).toBe(closingOpacity)
      frames.advance(1)
      expect(readOpacity(menu)).toBeLessThan(closingOpacity)
      frames.finish()
      expect(screen.getByRole('menu')).toBe(menu)
      expect(readOpacity(menu)).toBe(1)
      expect(menu).toHaveAttribute('data-surface-motion-state', 'open')
      expect(screen.getByRole('menuitem', { name: '归档工作区' })).toHaveFocus()

      clickWithFocus(trigger)
      expect(menu).toHaveStyle({ ...position, visibility: 'visible' })
      frames.finish()
      expect(menu).not.toBeInTheDocument()
      expectMenuClosed(trigger)
    }
  )

  it.each([2, 3, 6, 7])('settles at the latest intent after %s rapid clicks', (clickCount) => {
    const frames = installMotionFrames()
    const { trigger } = renderSidebar(true)
    for (let click = 0; click < clickCount; click += 1) {
      clickWithFocus(trigger)
      frames.advance(16)
    }

    frames.finish()

    if (clickCount % 2 === 0) {
      expectMenuClosed(trigger)
      expect(document.querySelector('.workspace-row-menu')).toBeNull()
    } else {
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
      expect(readOpacity(screen.getByRole('menu'))).toBe(1)
      expect(screen.getByRole('menuitem', { name: '归档工作区' })).toHaveFocus()
    }
  })

  it('toggles immediately and restores menu focus when motion is reduced', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: () => true
    }))
    const { trigger } = renderSidebar(true)
    clickWithFocus(trigger)
    expect(readOpacity(screen.getByRole('menu'))).toBe(1)
    expect(screen.getByRole('menuitem', { name: '归档工作区' })).toHaveFocus()

    clickWithFocus(trigger)
    expectMenuClosed(trigger)
    expect(document.querySelector('.workspace-row-menu')).toBeNull()

    clickWithFocus(trigger)
    expect(readOpacity(screen.getByRole('menu'))).toBe(1)
    expect(screen.getByRole('menuitem', { name: '归档工作区' })).toHaveFocus()
  })
})

function readOpacity(menu: HTMLElement): number {
  return Number.parseFloat(menu.style.getPropertyValue('--cc-surface-motion-opacity'))
}

function installMotionFrames() {
  let now = 0
  let nextId = 0
  const callbacks = new Map<number, FrameRequestCallback>()
  vi.spyOn(window.performance, 'now').mockImplementation(() => now)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callbacks.set(++nextId, callback)
    return nextId
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => callbacks.delete(id))
  const advance = (milliseconds: number): void => {
    now += milliseconds
    const pending = [...callbacks.values()]
    callbacks.clear()
    act(() => pending.forEach((callback) => callback(now)))
  }
  return {
    advance,
    finish: (): void => {
      for (let frame = 0; callbacks.size > 0 && frame < 240; frame += 1) advance(1000 / 120)
      expect(callbacks.size).toBe(0)
    }
  }
}

function expectMenuClosed(trigger: HTMLElement): void {
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
}

function clickWithFocus(target: HTMLElement): void {
  fireEvent.pointerDown(target)
  fireEvent.mouseDown(target)
  // fireEvent.click alone omits the focus transfer that precedes a browser click.
  act(() => target.focus())
  fireEvent.pointerUp(target)
  fireEvent.mouseUp(target)
  fireEvent.click(target)
}

function renderSidebar(isCurrent: boolean) {
  const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
    workspaces: [
      {
        workspaceId: 'main',
        workspaceKind: 'default',
        displayName: 'main',
        directory: '/tmp/alpha-project',
        gitBranch: 'main',
        isCurrent: !isCurrent
      },
      {
        workspaceId: 'feature',
        workspaceKind: 'linked-worktree',
        displayName: 'feat',
        directory: '/tmp/alpha-project-feature',
        gitBranch: 'feat',
        isCurrent
      }
    ]
  })
  const onSelectWorkspace = vi.fn()
  const onArchiveBranchWorkspace = vi.fn()
  render(
    <ProjectSidebar
      workbenches={[workbench]}
      currentWorkbench={workbench}
      isDesktopRuntime
      onAddProject={vi.fn()}
      onArchiveBranchWorkspace={onArchiveBranchWorkspace}
      onCheckoutMainBranch={vi.fn()}
      onCreateBranchWorkspace={vi.fn()}
      onRemoveProject={vi.fn()}
      onReorderProject={vi.fn()}
      onSelectWorkspace={onSelectWorkspace}
    />
  )

  return {
    onArchiveBranchWorkspace,
    onSelectWorkspace,
    trigger: screen.getByRole('button', { name: '打开 feat 工作区菜单' })
  }
}
