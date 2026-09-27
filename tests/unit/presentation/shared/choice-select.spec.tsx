import { act, fireEvent, render, screen } from '@testing-library/react'
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

describe('choice menu geometry updates', () => {
  const frames = new Map<number, FrameRequestCallback>()
  let resize: ResizeObserverCallback
  let observed: Element[]
  let disconnect: ReturnType<typeof vi.fn>

  beforeEach(() => {
    frames.clear()
    observed = []
    let nextFrame = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++nextFrame, callback)
      return nextFrame
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => frames.delete(id))
    disconnect = vi.fn()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback
        }
        observe = (element: Element) => {
          observed.push(element)
        }
        disconnect = disconnect
      }
    )
  })

  afterEach(() => vi.unstubAllGlobals())

  function setup() {
    const change = vi.fn()
    const view = render(
      <div data-testid="canvas-transform">
        <ChoiceSelect
          label="Choice"
          value="a"
          options={[{ value: 'a', label: 'A' }]}
          onChange={change}
        />
      </div>
    )
    const trigger = screen.getByRole('button', { name: 'Choice' })
    const bounds = vi
      .spyOn(trigger, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(300, 180, 240, 32))
    fireEvent.click(trigger)
    const menu = screen.getByRole('menu')
    return {
      ...view,
      trigger,
      bounds,
      menu,
      change,
      ancestor: screen.getByTestId('canvas-transform')
    }
  }

  function flush() {
    act(() => {
      const pending = [...frames.values()]
      frames.clear()
      pending.forEach((callback) => callback(performance.now()))
    })
  }

  it.each(['style', 'class'] as const)(
    'follows ancestor %s changes without losing focus or selection',
    async (attribute) => {
      const { ancestor, bounds, menu, change } = setup()
      expect(menu).toHaveStyle({ left: '300px', top: '218px' })
      bounds.mockReturnValue(new DOMRect(430, 270, 192, 26))
      await act(async () => {
        ancestor.setAttribute(attribute, attribute === 'style' ? 'transform: scale(0.8)' : 'moved')
      })
      flush()
      expect(screen.getByRole('menu')).toBe(menu)
      expect(menu).toHaveStyle({ left: '430px', top: '302px' })
      expect(menu).toHaveFocus()
      expect(screen.getByRole('menuitemradio')).toHaveAttribute('aria-checked', 'true')
      expect(change).not.toHaveBeenCalled()
    }
  )

  it('remeasures resized triggers and releases observation on close and unmount', async () => {
    const { trigger, ancestor, bounds, menu, unmount } = setup()
    expect(observed).toContain(trigger)
    expect(observed).toContain(ancestor)
    bounds.mockReturnValue(new DOMRect(280, 220, 280, 32))
    act(() => resize([], {} as ResizeObserver))
    flush()
    expect(menu).toHaveStyle({ left: '280px', top: '258px', width: '280px' })
    bounds.mockReturnValue(new DOMRect(90, 80, 280, 32))
    await act(async () => {
      ancestor.style.transform = 'translateX(20px)'
    })
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(disconnect).toHaveBeenCalledOnce()
    expect(trigger).toHaveFocus()
    bounds.mockClear()
    flush()
    expect(bounds).not.toHaveBeenCalled()
    expect(menu).toHaveStyle({ left: '280px', top: '258px', width: '280px' })
    fireEvent.click(trigger)
    await act(async () => {
      ancestor.style.transform = 'translateX(40px)'
    })
    unmount()
    expect(disconnect).toHaveBeenCalledTimes(2)
    expect(frames.size).toBe(0)
  })
})
