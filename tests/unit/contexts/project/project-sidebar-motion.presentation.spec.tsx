import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

import { ProjectSidebar } from '../../../../src/contexts/project/presentation/components/ProjectSidebar'
import { createWorkbenchSnapshot } from '../../../fixtures/presentation/appShellFixtures'

describe('project sidebar hover and disclosure motion', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('hands one hover surface between project and workspace rows without changing selection', () => {
    const props = createProps()
    render(<ProjectSidebar {...props} />)
    const list = document.querySelector<HTMLElement>('.project-list')!
    const rows = Array.from(
      list.querySelectorAll<HTMLElement>('.project-card__header, .workspace-row')
    )
    vi.spyOn(list, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 250, 400))
    rows.forEach((row, index) => {
      vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(rect(10, index * 34, 220, 32))
    })

    fireEvent.pointerMove(rows[0])
    const highlight = list.querySelector<HTMLElement>('.project-list__hover')!
    expect(highlight).not.toBeNull()
    expect(highlight).toHaveAttribute('aria-hidden', 'true')
    expect(highlight.style.getPropertyValue('--cc-selection-motion-y')).toBe('0px')

    for (const row of rows.slice(1)) {
      fireEvent.pointerMove(row)
      act(() => vi.advanceTimersByTime(1000))
      expect(list.querySelector('.project-list__hover')).toBe(highlight)
      expect(highlight.style.getPropertyValue('--cc-selection-motion-y')).toBe(
        `${row.getBoundingClientRect().y}px`
      )
    }
    expect(list).toHaveAttribute('data-sidebar-hover-visible', 'true')
    fireEvent.pointerLeave(list)
    expect(list).not.toHaveAttribute('data-sidebar-hover-visible')
    expect(props.onSelectWorkspace).not.toHaveBeenCalled()
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
  })

  it.each([
    '.project-card__header',
    '.project-card__select',
    '.project-card__branch',
    '.project-card__remove'
  ])('highlights the complete project header when hovering %s', (selector) => {
    const props = createProps()
    render(<ProjectSidebar {...props} />)
    const list = document.querySelector<HTMLElement>('.project-list')!
    const header = list.querySelector<HTMLElement>('.project-card__header')!
    const title = header.querySelector<HTMLElement>('.project-card__select')!
    vi.spyOn(list, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 250, 400))
    vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(rect(4, 20, 242, 34))
    vi.spyOn(title, 'getBoundingClientRect').mockReturnValue(rect(4, 21, 186, 32))

    fireEvent.pointerMove(list.querySelector(selector)!)

    const highlight = list.querySelector<HTMLElement>('.project-list__hover')!
    expect(list).toHaveAttribute('data-sidebar-hover-visible', 'true')
    expect(highlight.style.getPropertyValue('--cc-selection-motion-x')).toBe('4px')
    expect(highlight.style.getPropertyValue('--cc-selection-motion-y')).toBe('20px')
    expect(highlight.style.getPropertyValue('--cc-selection-motion-width')).toBe('242px')
    expect(highlight.style.getPropertyValue('--cc-selection-motion-height')).toBe('34px')
    expect(title).toHaveAttribute('aria-expanded', 'true')
    expect(props.onSelectWorkspace).not.toHaveBeenCalled()
    expect(props.onRemoveProject).not.toHaveBeenCalled()
  })

  it('keeps disclosure mounted and non-interactive while reversing from its live presentation', () => {
    const props = createProps()
    render(<ProjectSidebar {...props} />)
    const title = screen.getByRole('button', { name: 'motion-alpha' })
    const card = title.closest<HTMLElement>('.project-card')!
    const disclosure = card.querySelector<HTMLElement>('.project-card__disclosure')!
    const workspaceList = disclosure.querySelector('.workspace-list')!
    expect(card).toHaveAttribute('data-project-disclosure-state', 'open')
    expect(progress(card)).toBe(1)

    fireEvent.click(title)
    expect(title).toHaveAttribute('aria-expanded', 'false')
    expect(disclosure).toHaveAttribute('inert')
    expect(disclosure).toHaveAttribute('aria-hidden', 'true')
    act(() => vi.advanceTimersByTime(80))
    const intermediate = progress(card)
    expect(intermediate).toBeGreaterThan(0)
    expect(intermediate).toBeLessThan(1)

    fireEvent.click(title)
    expect(progress(card)).toBe(intermediate)
    expect(disclosure).not.toHaveAttribute('inert')
    expect(disclosure.querySelector('.workspace-list')).toBe(workspaceList)
    act(() => vi.advanceTimersByTime(1000))
    expect(progress(card)).toBe(1)
    expect(card).toHaveAttribute('data-project-disclosure-state', 'open')
    expect(props.onSelectWorkspace).not.toHaveBeenCalled()
  })

  it.each([248, 280, 360].flatMap((width) => [false, true].map((reverse) => ({ width, reverse }))))(
    'keeps the common right edge while the indentation changes ($width, reverse: $reverse)',
    ({ width, reverse }) => {
      render(<ProjectSidebar {...createProps()} />)
      const list = document.querySelector<HTMLElement>('.project-list')!
      const header = list.querySelector<HTMLElement>('.project-card__header')!
      const workspace = list.querySelector<HTMLElement>('.workspace-row')!
      const highlight = list.querySelector<HTMLElement>('.project-list__hover')!
      vi.spyOn(list, 'clientWidth', 'get').mockReturnValue(width)
      vi.spyOn(list, 'getBoundingClientRect').mockReturnValue(rect(0, 0, width, 400))
      vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(rect(4, 0, width - 8, 34))
      vi.spyOn(workspace, 'getBoundingClientRect').mockReturnValue(rect(23, 36, width - 27, 32))
      const [from, to] = reverse ? [workspace, header] : [header, workspace]
      const left = () =>
        Number.parseFloat(highlight.style.getPropertyValue('--cc-selection-motion-x'))
      const rightInset = () =>
        Number.parseFloat(highlight.style.getPropertyValue('--cc-sidebar-hover-right'))

      fireEvent.pointerMove(from)
      const initialLeft = left()
      fireEvent.pointerMove(to)
      expect(left()).toBe(initialLeft)
      for (let frame = 0; frame < 8; frame += 1) {
        act(() => vi.advanceTimersByTime(16))
        expect(rightInset()).toBe(4)
        expect(left()).toBeGreaterThanOrEqual(4)
        expect(left()).toBeLessThanOrEqual(23)
      }
      const beforeReverse = left()
      expect(beforeReverse).not.toBe(initialLeft)
      fireEvent.pointerMove(from)
      expect(left()).toBeCloseTo(beforeReverse, 3)
      expect(rightInset()).toBe(4)
      act(() => vi.advanceTimersByTime(1000))
      expect(left()).toBe(initialLeft)
    }
  )

  it('glides across a row gap and accepts a reversal without jumping to an endpoint', () => {
    render(<ProjectSidebar {...createProps()} />)
    const list = document.querySelector<HTMLElement>('.project-list')!
    const title = list.querySelector<HTMLElement>('.project-card__select')!
    const header = list.querySelector<HTMLElement>('.project-card__header')!
    const workspace = list.querySelector<HTMLElement>('.workspace-row')!
    vi.spyOn(list, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 250, 400))
    vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(rect(10, 0, 220, 34))
    vi.spyOn(workspace, 'getBoundingClientRect').mockReturnValue(rect(28, 36, 200, 32))
    fireEvent.pointerMove(title)
    fireEvent(list, new MouseEvent('pointermove', { bubbles: true, clientY: 35 }))
    expect(list).toHaveAttribute('data-sidebar-hover-visible', 'true')
    fireEvent.pointerMove(workspace)
    act(() => vi.advanceTimersByTime(48))
    const highlight = list.querySelector<HTMLElement>('.project-list__hover')!
    const y = () => Number.parseFloat(highlight.style.getPropertyValue('--cc-selection-motion-y'))
    const before = y()
    expect(before).toBeGreaterThan(0)
    expect(before).toBeLessThan(36)
    fireEvent.pointerMove(title)
    expect(y()).toBe(before)
    act(() => vi.advanceTimersByTime(1000))
    expect(y()).toBe(0)
  })

  it('releases active hover and disclosure frames when the sidebar unmounts', () => {
    const { unmount } = render(<ProjectSidebar {...createProps()} />)
    fireEvent.click(screen.getByRole('button', { name: 'motion-alpha' }))
    act(() => vi.advanceTimersByTime(48))
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('settles immediately under reduced motion and cancels frames on unmount', () => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    vi.spyOn(window, 'matchMedia').mockReturnValue({ ...media, matches: true })
    const { unmount } = render(<ProjectSidebar {...createProps()} />)
    const title = screen.getByRole('button', { name: 'motion-alpha' })
    const card = title.closest<HTMLElement>('.project-card')!
    fireEvent.click(title)
    expect(progress(card)).toBe(0)
    expect(card).toHaveAttribute('data-project-disclosure-state', 'closed')
    fireEvent.click(title)
    expect(progress(card)).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

function progress(card: HTMLElement): number {
  return Number.parseFloat(card.style.getPropertyValue('--project-disclosure-progress'))
}

function rect(x: number, y: number, width: number, height: number): DOMRect {
  return { x, y, width, height, top: y, left: x, right: x + width, bottom: y + height, toJSON() {} }
}

function createProps() {
  const workbenches = ['alpha', 'beta'].map((name) =>
    createWorkbenchSnapshot(`/tmp/motion-${name}`, `motion-${name}`, {
      gitBranch: 'main',
      workspaces: [
        {
          workspaceId: 'main',
          workspaceKind: 'default',
          displayName: 'main',
          directory: `/tmp/motion-${name}`,
          gitBranch: 'main',
          isCurrent: true
        },
        {
          workspaceId: 'feature',
          workspaceKind: 'linked-worktree',
          displayName: 'feature',
          directory: `/tmp/motion-${name}-feature`,
          gitBranch: 'feature',
          isCurrent: false
        }
      ]
    })
  )
  return {
    workbenches,
    currentWorkbench: workbenches[0],
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
