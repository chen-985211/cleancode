import { fireEvent, render, screen } from '@testing-library/react'
import { IssueMenuSelect } from '../../../../src/contexts/project/presentation/components/IssueMenuSelect'

function setup() {
  const onChange = vi.fn()
  render(
    <IssueMenuSelect
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
