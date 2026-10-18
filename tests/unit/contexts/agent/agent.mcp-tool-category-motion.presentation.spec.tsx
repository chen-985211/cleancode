import { StrictMode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { AgentMcpSettingsPane } from '../../../../src/contexts/agent/presentation/components/AgentMcpSettingsPane'
import { motionPreferenceStore } from '../../../../src/presentation/shared/motion/motionPreference'

describe('MCP tool category disclosure motion', () => {
  let time: number
  let frames: Map<number, FrameRequestCallback>
  let resizeCallbacks: Set<() => void>
  let contentHeight: number
  beforeEach(() => {
    time = 0
    contentHeight = 640
    frames = new Map()
    resizeCallbacks = new Set()
    let nextId = 0
    vi.spyOn(window.performance, 'now').mockImplementation(() => time)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++nextId, callback)
      return nextId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => frames.delete(id))
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => contentHeight)
    vi.spyOn(motionPreferenceStore, 'getSnapshot').mockReturnValue(false)
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly callback: () => void) {}
        observe() {
          resizeCallbacks.add(this.callback)
        }
        disconnect() {
          resizeCallbacks.delete(this.callback)
        }
      }
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
  function advance(milliseconds = 16) {
    act(() => {
      time += milliseconds
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach((callback) => callback(time))
    })
  }
  function settle() {
    for (let frame = 0; frame < 240 && frames.size > 0; frame += 1) advance()
    expect(frames.size).toBe(0)
  }
  function height(root: HTMLElement) {
    return parseFloat(root.style.getPropertyValue('--mcp-tool-list-height'))
  }

  it.each([
    ['终端画布工具', false],
    ['终端画布工具', true],
    ['Agent 协作工具', false],
    ['Agent 协作工具', true]
  ] as const)(
    'keeps %s opening, closing and reversal continuous (StrictMode: %s)',
    (name, strict) => {
      const onPreferencesChange = vi.fn()
      const pane = <AgentMcpSettingsPane onPreferencesChange={onPreferencesChange} />
      const { unmount } = render(strict ? <StrictMode>{pane}</StrictMode> : pane)
      const trigger = screen.getByRole('button', { name: new RegExp(name) })
      const root = trigger.closest('section') as HTMLElement
      const list = root.querySelector('ul') as HTMLUListElement
      const body = list.parentElement as HTMLElement
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
      expect(body).toHaveAttribute('hidden')
      expect(frames.size).toBe(0)

      fireEvent.click(trigger)
      expect(root).toHaveAttribute('data-mcp-tools-motion', 'opening')
      expect(body).not.toHaveAttribute('hidden')
      advance(80)
      const openingHeight = height(root)
      expect(openingHeight).toBeGreaterThan(0)
      expect(openingHeight).toBeLessThan(contentHeight)
      fireEvent.click(trigger)
      expect(root).toHaveAttribute('data-mcp-tools-motion', 'closing')
      expect(height(root)).toBeCloseTo(openingHeight)
      expect(body).not.toHaveAttribute('hidden')
      expect(body).toHaveAttribute('inert')
      expect(body).toHaveAttribute('aria-hidden', 'true')
      advance()
      const closingHeight = height(root)
      expect(closingHeight).toBeLessThan(openingHeight)

      fireEvent.click(trigger)
      expect(height(root)).toBeCloseTo(closingHeight)
      expect(body).not.toHaveAttribute('inert')
      advance()
      expect(height(root)).toBeGreaterThan(closingHeight)
      settle()
      expect(root.style.getPropertyValue('--mcp-tool-list-height')).toBe('auto')
      expect(root).toHaveAttribute('data-mcp-tools-motion', 'open')
      fireEvent.click(trigger)
      settle()
      expect(body).toHaveAttribute('hidden')
      expect(height(root)).toBe(0)
      expect(root).toHaveAttribute('data-mcp-tools-motion', 'closed')
      expect(onPreferencesChange).not.toHaveBeenCalled()
      fireEvent.click(trigger)
      advance()
      unmount()
      expect(frames.size).toBe(0)
      expect(resizeCallbacks.size).toBe(0)
    }
  )

  it('keeps its current progress when the list reflows during expansion', () => {
    const { unmount } = render(<AgentMcpSettingsPane onPreferencesChange={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: /终端画布工具/ })
    const root = trigger.closest('section') as HTMLElement
    fireEvent.click(trigger)
    advance(80)
    const progress = height(root) / contentHeight
    contentHeight = 960
    act(() => resizeCallbacks.forEach((callback) => callback()))
    expect(height(root)).toBeCloseTo(contentHeight * progress)
    expect(root).toHaveAttribute('data-mcp-tools-motion', 'opening')
    settle()
    expect(root.style.getPropertyValue('--mcp-tool-list-height')).toBe('auto')
    unmount()
  })

  it('settles immediately when reduced motion changes during an animation', () => {
    const pane = <AgentMcpSettingsPane onPreferencesChange={vi.fn()} />
    const { rerender, unmount } = render(pane)
    const trigger = screen.getByRole('button', { name: /终端画布工具/ })
    const root = trigger.closest('section') as HTMLElement
    fireEvent.click(trigger)
    advance(80)
    vi.mocked(motionPreferenceStore.getSnapshot).mockReturnValue(true)
    rerender(<AgentMcpSettingsPane onPreferencesChange={vi.fn()} />)
    expect(root).toHaveAttribute('data-mcp-tools-motion', 'open')
    expect(root.style.getPropertyValue('--mcp-tool-list-height')).toBe('auto')
    expect(frames.size).toBe(0)
    fireEvent.click(trigger)
    expect(root).toHaveAttribute('data-mcp-tools-motion', 'closed')
    expect(root.querySelector('ul')?.parentElement).toHaveAttribute('hidden')
    expect(frames.size).toBe(0)
    unmount()
  })
})
