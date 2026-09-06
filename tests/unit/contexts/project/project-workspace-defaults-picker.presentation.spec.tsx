import { fireEvent, render, screen } from '@testing-library/react'
import { WorkspaceDefaultsPicker } from '../../../../src/contexts/project/presentation/components/WorkspaceDefaultsPicker'

describe('workspace defaults picker', () => {
  afterEach(() => vi.restoreAllMocks())
  it('keeps Escape inside a picker with no selectable choices', () => {
    const outsideEscape = vi.fn()
    document.addEventListener('keydown', outsideEscape)
    const { unmount } = render(
      <WorkspaceDefaultsPicker
        label="Add"
        groups={[
          { name: 'Group', empty: 'Empty', choices: [{ id: 'one', name: 'One', selected: true }] }
        ]}
        onAdd={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('menu')).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(outsideEscape).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Add' })).toHaveFocus()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    document.removeEventListener('keydown', outsideEscape)
    unmount()
  })
  it('anchors an upward picker by its bottom edge regardless of its content height', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: window.innerHeight - 80,
      bottom: window.innerHeight - 50,
      right: 400
    } as DOMRect)
    render(
      <WorkspaceDefaultsPicker
        label="Add"
        groups={[
          { name: 'Group', empty: 'Empty', choices: [{ id: 'one', name: 'One', selected: false }] }
        ]}
        onAdd={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('menu')).toHaveStyle({ bottom: '88px' })
    fireEvent.keyDown(screen.getByRole('menuitem'), { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Add' })).toHaveFocus()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
