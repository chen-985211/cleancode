import { act, render } from '@testing-library/react'

import type { BlockGraphSnapshot } from '../../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { QuickExecutionBar } from '../../../../src/contexts/block-graph/presentation/components/QuickExecutionBar'
import { motionPreferenceStore } from '../../../../src/presentation/shared/motion/motionPreference'

describe('quick execution dock layout continuity', () => {
  let now: number
  let frames: Map<number, FrameRequestCallback>

  beforeEach(() => {
    now = 0
    frames = new Map()
    let nextId = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++nextId, callback)
      return nextId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => frames.delete(id))
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      const bar = this.closest('[data-quick-execution-bar]')
      if (!bar) return new DOMRect()
      const slots = [
        ...bar.querySelectorAll('[data-quick-execution-slots="dock"] [data-quick-execution-slot]')
      ]
      const addWidth = slots.length === 0 ? 110 : 30
      const width = slots.length * 40 + addWidth
      if (this === bar) {
        const reserved = Math.max(width, Number.parseFloat(this.style.minWidth) || 0)
        return new DOMRect(1000 - reserved, 400, reserved, 24)
      }
      const index = slots.indexOf(this)
      return new DOMRect(
        1000 - width + (index < 0 ? slots.length : index) * 40 + offset(this),
        400,
        index < 0 ? addWidth : 38,
        24
      )
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it.each([1, 2, 3] as const)(
    'preserves surviving entries at removal of position %s, then closes the gap smoothly',
    (removed) => {
      const props = {
        onAdd: vi.fn(),
        onClear: vi.fn(),
        onFocus: vi.fn(),
        onExecute: vi.fn(),
        onReorder: vi.fn()
      }
      const { rerender, unmount } = render(
        <QuickExecutionBar {...props} graph={graph([1, 2, 3])} />
      )
      const survivors = ([1, 2, 3] as const).filter((number) => number !== removed)
      const before = survivors.map((number) => slot(number).getBoundingClientRect().left)
      rerender(<QuickExecutionBar {...props} graph={graph(survivors)} />)
      expect(
        document.querySelector(
          `[data-quick-execution-slots="dock"] [data-quick-execution-slot="${removed}"]`
        )
      ).toBeNull()
      expect(survivors.map((number) => slot(number).getBoundingClientRect().left)).toEqual(before)
      const moving = survivors.filter((number) => Math.abs(offset(slot(number))) > 0)
      if (removed !== 1) expect(moving.length).toBeGreaterThan(0)
      const bar = document.querySelector<HTMLElement>('[data-quick-execution-bar]')!
      // A long workspace path must not claim the space still occupied by a
      // moving entry just because its committed grid cell has already moved.
      for (const number of survivors) {
        expect(slot(number).getBoundingClientRect().left).toBeGreaterThanOrEqual(
          bar.getBoundingClientRect().left
        )
      }
      for (const number of moving) {
        const initial = Math.abs(offset(slot(number)))
        step()
        expect(Math.abs(offset(slot(number)))).toBeGreaterThan(0)
        expect(Math.abs(offset(slot(number)))).toBeLessThan(initial)
      }
      settle()
      for (const number of survivors) expect(offset(slot(number))).toBe(0)
      expect(bar.style.minWidth).toBe('')
      unmount()
      expect(frames.size).toBe(0)
    }
  )

  it('continues a second removal from the current position and snaps only for reduced motion or a different workspace', () => {
    const props = {
      onAdd: vi.fn(),
      onClear: vi.fn(),
      onFocus: vi.fn(),
      onExecute: vi.fn(),
      onReorder: vi.fn()
    }
    const { rerender } = render(<QuickExecutionBar {...props} graph={graph([1, 2, 3])} />)
    rerender(<QuickExecutionBar {...props} graph={graph([1, 2])} />)
    step()
    const before = slot(1).getBoundingClientRect().left
    rerender(<QuickExecutionBar {...props} graph={graph([1])} />)
    expect(slot(1).getBoundingClientRect().left).toBeCloseTo(before)
    expect(offset(slot(1))).not.toBe(0)
    vi.spyOn(motionPreferenceStore, 'getSnapshot').mockReturnValue(true)
    rerender(<QuickExecutionBar {...props} graph={graph([1])} />)
    expect(offset(slot(1))).toBe(0)
    vi.mocked(motionPreferenceStore.getSnapshot).mockReturnValue(false)
    rerender(<QuickExecutionBar {...props} graph={graph([1, 2, 3])} />)
    rerender(<QuickExecutionBar {...props} graph={{ ...graph([1]), workspaceId: 'other' }} />)
    expect(offset(slot(1))).toBe(0)
  })

  it('keeps the wider empty-state add button inside the right edge after the last removal', () => {
    const props = {
      onAdd: vi.fn(),
      onClear: vi.fn(),
      onFocus: vi.fn(),
      onExecute: vi.fn(),
      onReorder: vi.fn()
    }
    const { rerender } = render(<QuickExecutionBar {...props} graph={graph([1])} />)
    const add = document.querySelector<HTMLElement>('.quick-execution__add')!
    const right = add.getBoundingClientRect().right
    rerender(<QuickExecutionBar {...props} graph={graph([])} />)
    expect(add).toHaveTextContent('添加常用对象')
    expect(add.getBoundingClientRect().right).toBe(right)
    settle()
    expect(add.getBoundingClientRect().right).toBe(right)
  })

  function step() {
    now += 1000 / 60
    const callbacks = [...frames.values()]
    frames.clear()
    act(() => callbacks.forEach((callback) => callback(now)))
  }
  function settle() {
    for (let frame = 0; frame < 120 && frames.size; frame++) step()
  }
})

function slot(number: number): HTMLElement {
  return document.querySelector(
    `[data-quick-execution-slots="dock"] [data-quick-execution-slot="${number}"]`
  )!
}

function offset(element: HTMLElement): number {
  return Number.parseFloat(element.style.translate || '0')
}

function graph(numbers: readonly (1 | 2 | 3)[]): BlockGraphSnapshot {
  return {
    id: 'graph',
    projectId: 'project',
    workspaceId: 'workspace',
    viewport: { x: 0, y: 0, zoom: 1 },
    blocks: [],
    terminalGroups: [],
    connections: [],
    quickExecutionSlots: ([1, 2, 3, 4, 5] as const).map((number) => ({
      number,
      target: numbers.some((entry) => entry === number)
        ? { type: 'terminal', terminalBlockId: `terminal-${number}` }
        : null
    }))
  }
}
