import { fireEvent, render, screen } from '@testing-library/react'
import { ChoiceSelect } from '../../../../src/presentation/shared/components/ChoiceSelect'

it('skips disabled choices, scrolls keyboard targets and only commits on activation', () => {
  const change = vi.fn()
  const cancelParent = vi.fn()
  render(
    <div onKeyDown={cancelParent}>
      <ChoiceSelect
        label="Choice"
        value="b"
        options={[
          { value: 'a', label: 'A', disabled: true },
          { value: 'b', label: 'B' },
          { value: 'c', label: 'C' }
        ]}
        onChange={change}
      />
    </div>
  )
  const trigger = screen.getByRole('button', { name: 'Choice' })
  fireEvent.keyDown(trigger, { key: 'ArrowDown' })
  const b = screen.getByRole('menuitemradio', { name: 'B' })
  const c = screen.getByRole('menuitemradio', { name: 'C' })
  expect(b).toHaveFocus()
  c.scrollIntoView = vi.fn()
  fireEvent.keyDown(b, { key: 'ArrowDown' })
  expect(c).toHaveFocus()
  expect(c.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
  expect(b).toHaveAttribute('aria-checked', 'true')
  expect(change).not.toHaveBeenCalled()
  fireEvent.keyDown(c, { key: 'Escape' })
  c.scrollIntoView = vi.fn()
  fireEvent.keyDown(trigger, { key: 'ArrowUp' })
  expect(c).toHaveFocus()
  expect(c.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
  fireEvent.keyDown(c, { key: ' ' })
  expect(change).toHaveBeenCalledExactlyOnceWith('c')
  expect(trigger).toHaveFocus()
  fireEvent.click(trigger)
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  expect(cancelParent).not.toHaveBeenCalled()
})

it.each([{ options: [] }, { options: [{ value: 'a', label: 'A', disabled: true }] }])(
  'keeps an empty or unavailable menu keyboard dismissible',
  ({ options }) => {
    render(<ChoiceSelect label="Choice" value="a" options={options} onChange={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Choice' })
    fireEvent.keyDown(trigger, { key: 'ArrowUp' })
    expect(screen.getByRole('menu')).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Tab' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  }
)

it('opens upward within available viewport space', () => {
  render(
    <ChoiceSelect
      label="Choice"
      value="a"
      options={[{ value: 'a', label: 'A' }]}
      onChange={vi.fn()}
    />
  )
  const trigger = screen.getByRole('button', { name: 'Choice' })
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
    top: window.innerHeight - 60,
    bottom: window.innerHeight - 30,
    left: 20,
    width: 240
  } as DOMRect)
  fireEvent.click(trigger)
  expect(screen.getByRole('menu')).toHaveAttribute('data-side', 'top')
  expect(screen.getByRole('menu')).toHaveStyle({ bottom: '66px', width: '240px' })
})

it('keeps the opened menu anchored when the form finishes scrolling its trigger into view', () => {
  render(
    <ChoiceSelect
      label="Choice"
      value="a"
      options={[{ value: 'a', label: 'A' }]}
      onChange={vi.fn()}
    />
  )
  const trigger = screen.getByRole('button', { name: 'Choice' })
  const rect = vi
    .spyOn(trigger, 'getBoundingClientRect')
    .mockReturnValue({ top: 100, bottom: 132, left: 20, width: 240 } as DOMRect)
  fireEvent.click(trigger)
  const menu = screen.getByRole('menu')
  rect.mockReturnValue({ top: 80, bottom: 112, left: 20, width: 240 } as DOMRect)
  fireEvent.scroll(document)
  expect(screen.getByRole('menu')).toBe(menu)
  expect(menu).toHaveFocus()
  expect(menu).toHaveStyle({ top: '118px' })
})
