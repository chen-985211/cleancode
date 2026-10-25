import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import type {
  BlockGraphSnapshot,
  QuickExecutionSlotNumber
} from '../../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { QuickExecutionBar } from '../../../../src/contexts/block-graph/presentation/components/QuickExecutionBar'

describe('quick execution disclosure', () => {
  it.each(
    ([[], [2], [2, 4], [1, 2, 3, 4, 5]] as QuickExecutionSlotNumber[][]).map((numbers) => ({
      numbers
    }))
  )('shows only bound tags and one add or manage entry for slots $numbers', ({ numbers }) => {
    mount(numbers)

    expect(visibleNumbers()).toEqual(numbers)
    expect(document.querySelector('.quick-execution__slot--reserved')).toBeNull()
    expect(
      screen.getByRole('button', {
        name: numbers.length === 5 ? '整理快捷位' : '添加画布对象'
      })
    ).toBeInTheDocument()
  })

  it.each([false, true])(
    'keeps bound tags focused on locating objects without slot actions (unavailable: %s)',
    (unavailable) => {
      const props = mount([2, 4])
      if (unavailable) {
        props.rerender(
          <QuickExecutionBar {...props.input} graph={{ ...props.input.graph, blocks: [] }} />
        )
      }

      const slot = document.querySelector<HTMLElement>('[data-quick-execution-slot="2"]')!
      const buttons = within(slot).getAllByRole('button')
      expect(buttons).toHaveLength(1)
      fireEvent.click(buttons[0]!)
      expect(props.input.onFocus).toHaveBeenCalledWith({
        type: 'terminal',
        terminalBlockId: 'worker'
      })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: '添加画布对象' }))
      fireEvent.click(screen.getByRole('button', { name: '整理快捷位' }))
      const arrangement = screen.getByRole('dialog', { name: '整理快捷位' })
      expect(
        within(arrangement.querySelector('[data-quick-execution-slot="2"]')!).getAllByRole('button')
      ).toHaveLength(1)
      expect(screen.queryByRole('button', { name: '重新绑定' })).not.toBeInTheDocument()
    }
  )

  it('expands all fixed positions from the add menu and collapses them when done', () => {
    mount([2, 4])
    fireEvent.click(screen.getByRole('button', { name: '添加画布对象' }))
    fireEvent.click(screen.getByRole('button', { name: '整理快捷位' }))

    expect(visibleNumbers()).toEqual([1, 2, 3, 4, 5])
    const arrangement = screen.getByRole('dialog', { name: '整理快捷位' })
    expect(within(arrangement).getByRole('button', { name: '完成整理' })).toBeInTheDocument()
    const compact = document.querySelector('[data-quick-execution-slots="dock"]')!
    expect(
      [...compact.querySelectorAll<HTMLElement>('[data-quick-execution-slot]')].map((slot) =>
        Number(slot.dataset.quickExecutionSlot)
      )
    ).toEqual([2, 4])
    const done = screen.getByRole('button', { name: '完成整理' })
    expect(done).toHaveFocus()
    fireEvent.click(done)

    expect(visibleNumbers()).toEqual([2, 4])
    expect(screen.getByRole('button', { name: '添加画布对象' })).toHaveFocus()
  })

  it('identifies the add picker and keeps candidate names separate from their type', () => {
    mount([2])
    fireEvent.click(screen.getByRole('button', { name: '添加画布对象' }))

    const picker = screen.getByRole('dialog', { name: '选择要绑定的画布对象' })
    expect(within(picker).getByRole('heading', { name: '添加常用对象' })).toBeInTheDocument()
    const candidate = within(picker).getByRole('button', { name: /Worker\s*终端/ })
    expect(within(candidate).getByText('Worker')).toBeInTheDocument()
    expect(within(candidate).getByText('终端')).toBeInTheDocument()
    fireEvent.click(candidate)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('identifies every arranged binding and vacant position without relying on icons', () => {
    mount([2, 4])
    fireEvent.click(screen.getByRole('button', { name: '添加画布对象' }))
    fireEvent.click(screen.getByRole('button', { name: '整理快捷位' }))

    const arrangement = screen.getByRole('dialog', { name: '整理快捷位' })
    expect(within(arrangement).getByRole('heading', { name: '整理快捷位' })).toBeInTheDocument()
    for (const number of [1, 2, 3, 4, 5]) {
      const slot = arrangement.querySelector(`[data-quick-execution-slot="${number}"]`)!
      if (number === 2 || number === 4) {
        expect(within(slot).getByText('Worker')).toBeInTheDocument()
        expect(within(slot).getByText('终端')).toBeInTheDocument()
      } else {
        expect(within(slot).getByText('空快捷位')).toBeInTheDocument()
        expect(within(slot).queryByRole('button')).not.toBeInTheDocument()
      }
    }
  })

  it('supports arrangement and Escape when all positions are occupied', () => {
    mount([1, 2, 3, 4, 5])
    fireEvent.click(screen.getByRole('button', { name: '整理快捷位' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '整理快捷位' }))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('button', { name: '完成整理' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '整理快捷位' })).toHaveFocus()
  })

  it('keeps the compact row unchanged while an external object is added automatically', () => {
    const props = mount([2, 4])
    props.rerender(<QuickExecutionBar {...props.input} isExternalDropTarget />)
    expect(visibleNumbers()).toEqual([2, 4])

    props.rerender(<QuickExecutionBar {...props.input} />)
    expect(visibleNumbers()).toEqual([2, 4])
  })

  it('swaps occupied entries directly without exposing vacant positions', async () => {
    const { input } = mount([2, 4])
    fireEvent.pointerDown(document.querySelector('[data-quick-execution-slot="4"]')!, {
      pointerId: 1,
      button: 0,
      clientX: 0,
      clientY: 0
    })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 5, clientY: 0 })
    await waitFor(() => expect(visibleNumbers()).toEqual([2, 4]))
    const destination = document.querySelector('[data-quick-execution-slot="2"]')!
    vi.spyOn(destination, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 38, 24))
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 110, clientY: 110 })

    expect(input.onReorder).toHaveBeenCalledWith(4, 2)
    await waitFor(() => expect(visibleNumbers()).toEqual([2, 4]))
  })

  it('resets arrangement when another bottom control takes over', () => {
    const props = mount([2, 4])
    fireEvent.click(screen.getByRole('button', { name: '添加画布对象' }))
    fireEvent.click(screen.getByRole('button', { name: '整理快捷位' }))
    props.rerender(<QuickExecutionBar {...props.input} open={false} />)
    props.rerender(<QuickExecutionBar {...props.input} open />)

    expect(visibleNumbers()).toEqual([2, 4])
    expect(screen.queryByRole('button', { name: '完成整理' })).not.toBeInTheDocument()
  })
})

function visibleNumbers(): number[] {
  const surface =
    screen.queryByRole('dialog', { name: '整理快捷位' }) ??
    document.querySelector('[data-quick-execution-slots="dock"]')!
  return [...surface.querySelectorAll<HTMLElement>('[data-quick-execution-slot]')].map((slot) =>
    Number(slot.dataset.quickExecutionSlot)
  )
}

function mount(numbers: readonly QuickExecutionSlotNumber[]) {
  const graph: BlockGraphSnapshot = {
    id: 'graph',
    projectId: 'project',
    workspaceId: 'workspace',
    viewport: { x: 0, y: 0, zoom: 1 },
    connections: [],
    terminalGroups: [],
    blocks: [
      {
        id: 'worker',
        name: 'Worker',
        type: 'terminal',
        description: '',
        launchCommand: 'pnpm worker',
        position: { x: 0, y: 0 },
        size: { width: 720, height: 460 },
        executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null }
      }
    ],
    quickExecutionSlots: ([1, 2, 3, 4, 5] as const).map((number) => ({
      number,
      target: numbers.includes(number) ? { type: 'terminal', terminalBlockId: 'worker' } : null
    }))
  }
  const input = {
    graph,
    onAdd: vi.fn(),
    onClear: vi.fn(),
    onFocus: vi.fn(),
    onReorder: vi.fn()
  }
  return { ...render(<QuickExecutionBar {...input} />), input }
}
