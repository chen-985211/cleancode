import { fireEvent, render, screen, within } from '@testing-library/react'

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
      expect(within(slot).getAllByRole('button')).toHaveLength(1)
      expect(screen.queryByRole('button', { name: '重新绑定' })).not.toBeInTheDocument()
    }
  )

  it('expands all fixed positions from the add menu and collapses them when done', () => {
    mount([2, 4])
    fireEvent.click(screen.getByRole('button', { name: '添加画布对象' }))
    fireEvent.click(screen.getByRole('button', { name: '整理快捷位' }))

    expect(visibleNumbers()).toEqual([1, 2, 3, 4, 5])
    const done = screen.getByRole('button', { name: '完成整理' })
    expect(done).toHaveFocus()
    fireEvent.click(done)

    expect(visibleNumbers()).toEqual([2, 4])
    expect(screen.getByRole('button', { name: '添加画布对象' })).toHaveFocus()
  })

  it('supports arrangement and Escape when all positions are occupied', () => {
    mount([1, 2, 3, 4, 5])
    fireEvent.click(screen.getByRole('button', { name: '整理快捷位' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '整理快捷位' }))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('button', { name: '完成整理' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '整理快捷位' })).toHaveFocus()
  })

  it('expands for external dragging and collapses after the target is left', () => {
    const props = mount([2, 4])
    props.rerender(<QuickExecutionBar {...props.input} isExternalDropTarget />)
    expect(visibleNumbers()).toEqual([1, 2, 3, 4, 5])

    props.rerender(<QuickExecutionBar {...props.input} />)
    expect(visibleNumbers()).toEqual([2, 4])
  })

  it('reveals vacant positions during an internal drag without renumbering the bindings', () => {
    const { input } = mount([2, 4])
    fireEvent.dragStart(document.querySelector('[data-quick-execution-slot="4"]')!)
    expect(visibleNumbers()).toEqual([1, 2, 3, 4, 5])
    const destination = document.querySelector('[data-quick-execution-slot="1"]')!
    fireEvent.drop(destination)

    expect(input.onReorder).toHaveBeenCalledWith(4, 1)
    expect(visibleNumbers()).toEqual([2, 4])
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
  return [...document.querySelectorAll<HTMLElement>('[data-quick-execution-slot]')].map((slot) =>
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
