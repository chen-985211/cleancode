import { fireEvent, render, screen } from '@testing-library/react'
import { IssueMenuSelect } from '../../../../src/contexts/project/presentation/components/IssueMenuSelect'

function setup() {
  const onChange = vi.fn()
  render(
    <IssueMenuSelect
      active
      label="Project"
      value="two"
      options={[
        { value: 'one', label: 'One' },
        { value: 'two', label: 'Two' }
      ]}
      onChange={onChange}
    />
  )
  return { trigger: screen.getByRole('button', { name: 'Project' }), onChange }
}

describe('issue menu selection and hover', () => {
  it.each(['pointer', 'keyboard'] as const)(
    'releases its portal and input ownership when the parent closes after %s opening',
    (input) => {
      const onChange = vi.fn()
      const onPointerDown = vi.fn()
      const onClick = vi.fn()
      const view = (active: boolean) => (
        <>
          <button onPointerDown={onPointerDown} onClick={onClick}>
            Canvas
          </button>
          <IssueMenuSelect
            active={active}
            label="Project"
            value="two"
            options={[
              { value: 'one', label: 'One' },
              { value: 'two', label: 'Two' }
            ]}
            onChange={onChange}
          />
        </>
      )
      const { rerender } = render(view(true))
      const trigger = screen.getByRole('button', { name: 'Project' })
      if (input === 'pointer') fireEvent.click(trigger)
      else fireEvent.keyDown(trigger, { key: 'ArrowDown' })
      expect(screen.getByRole('menu')).toBeInTheDocument()
      const canvas = screen.getByRole('button', { name: 'Canvas' })
      canvas.focus()
      rerender(view(false))
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
      expect(canvas).toHaveFocus()
      fireEvent.pointerDown(canvas, { pointerId: 1 })
      fireEvent.pointerUp(canvas, { pointerId: 1 })
      fireEvent.click(canvas)
      expect(onPointerDown).toHaveBeenCalledOnce()
      expect(onClick).toHaveBeenCalledOnce()

      rerender(view(true))
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
      fireEvent.click(trigger)
      fireEvent.click(screen.getByRole('menuitemradio', { name: 'One' }))
      expect(onChange).toHaveBeenCalledExactlyOnceWith('one')
    }
  )
  it('opens on the menu container and highlights only the hovered row after a pointer click', () => {
    const { trigger } = setup()
    fireEvent.click(trigger)
    const menu = screen.getByRole('menu')
    const highlight = menu.querySelector('.menu-option-highlight-motion')!
    expect(menu).toHaveFocus()
    expect(screen.getByRole('menuitemradio', { name: 'Two' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(highlight).not.toHaveAttribute('data-visible', 'true')
    fireEvent.pointerOver(screen.getByRole('menuitemradio', { name: 'One' }))
    expect(highlight).toHaveAttribute('data-visible', 'true')
    fireEvent.pointerLeave(menu)
    expect(highlight).not.toHaveAttribute('data-visible', 'true')
    fireEvent.keyDown(menu, { key: 'Escape' })
    fireEvent.click(trigger)
    expect(
      screen.getByRole('menu').querySelector('.menu-option-highlight-motion')
    ).not.toHaveAttribute('data-visible', 'true')
  })

  it('keeps keyboard navigation visible without changing the checked value until activation', () => {
    const { trigger, onChange } = setup()
    fireEvent.click(trigger)
    const menu = screen.getByRole('menu')
    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    const two = screen.getByRole('menuitemradio', { name: 'Two' })
    expect(two).toHaveFocus()
    fireEvent.keyDown(two, { key: 'Home' })
    const one = screen.getByRole('menuitemradio', { name: 'One' })
    expect(one).toHaveFocus()
    expect(two).toHaveAttribute('aria-checked', 'true')
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.keyDown(one, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('one')
    expect(trigger).toHaveFocus()
  })
})
