import { fireEvent, render, screen } from '@testing-library/react'

import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { QuickExecutionBar } from '../../../src/presentation/app-shell/QuickExecutionBar'

describe('quick execution bar', () => {
  it('adds a canvas object without asking the user to choose a slot', () => {
    const onAdd = vi.fn()
    render(
      <QuickExecutionBar
        graph={createGraph()}
        onAdd={onAdd}
        onBind={vi.fn()}
        onClear={vi.fn()}
        onReorder={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '添加画布对象' }))
    expect(screen.getByRole('dialog', { name: '选择要绑定的画布对象' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /API → Web/ }))

    expect(onAdd).toHaveBeenCalledWith({
      type: 'workflow',
      terminalBlockIds: ['api', 'web']
    })
  })

  it('does not execute a filled slot on click and keeps an invalid binding visible', () => {
    render(
      <QuickExecutionBar
        graph={createGraph()}
        onAdd={vi.fn()}
        onBind={vi.fn()}
        onClear={vi.fn()}
        onReorder={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText('Worker'))
    expect(screen.queryByRole('button', { name: '执行快捷位 2：Worker' })).not.toBeInTheDocument()

    expect(screen.getByText('removed-terminal')).toBeInTheDocument()
    expect(screen.getByText('不可用')).toBeInTheDocument()
  })

  it('reorders filled slots by dragging one shortcut assignment onto another', () => {
    const onReorder = vi.fn()
    render(
      <QuickExecutionBar
        graph={createGraph()}
        onAdd={vi.fn()}
        onBind={vi.fn()}
        onClear={vi.fn()}
        onReorder={onReorder}
      />
    )

    const source = document.querySelector<HTMLElement>('[data-quick-execution-slot="2"]')!
    const destination = document.querySelector<HTMLElement>('[data-quick-execution-slot="1"]')!
    fireEvent.dragStart(source)
    fireEvent.dragOver(destination)
    fireEvent.drop(destination)

    expect(onReorder).toHaveBeenCalledWith(2, 1)
  })

  it('offers separate rebind and clear actions for a filled slot', () => {
    const onClear = vi.fn()
    render(
      <QuickExecutionBar
        graph={createGraph()}
        onAdd={vi.fn()}
        onBind={vi.fn()}
        onClear={onClear}
        onReorder={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '打开快捷位 2 的操作' }))
    fireEvent.click(screen.getByRole('button', { name: '清空快捷位' }))

    expect(onClear).toHaveBeenCalledWith(2)
  })
})

function createGraph(): BlockGraphSnapshot {
  return {
    blocks: [createBlock('api', 'API'), createBlock('web', 'Web'), createBlock('worker', 'Worker')],
    connections: [{ id: 'api-before-web', sourceBlockId: 'api', targetBlockId: 'web' }],
    id: 'graph-1',
    projectId: 'project-1',
    quickExecutionSlots: [
      { number: 1, target: null },
      { number: 2, target: { type: 'terminal', terminalBlockId: 'worker' } },
      { number: 3, target: { type: 'terminal', terminalBlockId: 'removed-terminal' } },
      { number: 4, target: null },
      { number: 5, target: null }
    ],
    terminalGroups: [
      {
        id: 'development',
        isCollapsed: false,
        memberBlockIds: ['api', 'web', 'worker'],
        name: 'Development',
        position: { x: 0, y: 0 },
        size: { width: 1_200, height: 600 },
        type: 'terminal-group'
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
    workspaceId: 'main'
  }
}

function createBlock(id: string, name: string) {
  return {
    description: '',
    executionConfig: { mode: 'task' as const, successExitCodes: [0], timeoutMs: null },
    id,
    launchCommand: `pnpm ${id}`,
    name,
    position: { x: 0, y: 0 },
    size: { width: 720, height: 460 },
    type: 'terminal' as const
  }
}
