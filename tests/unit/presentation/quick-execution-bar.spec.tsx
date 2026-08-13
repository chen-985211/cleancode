import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { QuickExecutionBar } from '../../../src/presentation/app-shell/QuickExecutionBar'

describe('quick execution bar', () => {
  it('keeps the bottom surface inert through exit and reuses it when the handoff reverses', () => {
    const props = {
      graph: createGraph(),
      onAdd: vi.fn(),
      onBind: vi.fn(),
      onClear: vi.fn(),
      onFocus: vi.fn(),
      onReorder: vi.fn()
    }
    const { rerender } = render(<QuickExecutionBar {...props} open />)
    const bar = document.querySelector<HTMLElement>('[data-quick-execution-bar]')!

    expect(bar).toHaveAttribute('data-surface-spring-preset', 'bottom-control')
    expect(bar).not.toHaveAttribute('aria-hidden')

    rerender(<QuickExecutionBar {...props} open={false} />)

    expect(document.querySelector('[data-quick-execution-bar]')).toBe(bar)
    expect(bar).toHaveAttribute('data-surface-motion-state', 'closing')
    expect(bar).toHaveAttribute('aria-hidden', 'true')
    expect(bar).toHaveAttribute('inert')

    rerender(<QuickExecutionBar {...props} open />)

    expect(document.querySelector('[data-quick-execution-bar]')).toBe(bar)
    expect(bar).toHaveAttribute('data-surface-motion-state', 'opening')
    expect(bar).not.toHaveAttribute('aria-hidden')
    expect(bar).not.toHaveAttribute('inert')
  })

  it('dismisses an open slot popover when arrangement controls take over', () => {
    const props = {
      graph: createGraph(),
      onAdd: vi.fn(),
      onBind: vi.fn(),
      onClear: vi.fn(),
      onFocus: vi.fn(),
      onReorder: vi.fn()
    }
    const { rerender } = render(<QuickExecutionBar {...props} open />)

    fireEvent.click(screen.getByRole('button', { name: '打开快捷位 2 的操作' }))
    expect(screen.getByRole('dialog', { name: '快捷位操作' })).toBeInTheDocument()

    rerender(<QuickExecutionBar {...props} open={false} />)
    rerender(<QuickExecutionBar {...props} open />)

    expect(screen.queryByRole('dialog', { name: '快捷位操作' })).not.toBeInTheDocument()
  })

  it('adds a canvas object without asking the user to choose a slot', () => {
    const onAdd = vi.fn()
    render(
      <QuickExecutionBar
        graph={createGraph()}
        onAdd={onAdd}
        onBind={vi.fn()}
        onClear={vi.fn()}
        onFocus={vi.fn()}
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

  it('focuses a filled slot on click and keeps an invalid binding visible', () => {
    const onFocus = vi.fn()
    render(
      <QuickExecutionBar
        graph={createGraph()}
        onAdd={vi.fn()}
        onBind={vi.fn()}
        onClear={vi.fn()}
        onFocus={onFocus}
        onReorder={vi.fn()}
      />
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: '快捷位 2：Worker，点击定位，仅支持快捷键执行'
      })
    )
    expect(onFocus).toHaveBeenCalledWith({
      type: 'terminal',
      terminalBlockId: 'worker'
    })

    expect(screen.getByText('removed-terminal')).toBeInTheDocument()
    expect(screen.getByText('不可用')).toBeInTheDocument()
  })

  it('uses shared tooltips to explain bound and empty slots without implying click execution', async () => {
    render(
      <QuickExecutionBar
        graph={createGraph()}
        onAdd={vi.fn()}
        onBind={vi.fn()}
        onClear={vi.fn()}
        onFocus={vi.fn()}
        onReorder={vi.fn()}
        shortcutPlatform="other"
        shortcutTooltips={{ quickExecution2: '执行快捷位 2 (Ctrl+2)' }}
      />
    )

    const boundSlot = document.querySelector<HTMLElement>('[data-quick-execution-slot="2"]')!
    expect(boundSlot.querySelector('[title]')).toBeNull()
    fireEvent.pointerMove(boundSlot, { pointerType: 'mouse' })
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      '已绑定终端「Worker」。执行快捷位 2 (Ctrl+2)；点击仅用于定位视图。'
    )

    fireEvent.pointerLeave(boundSlot)
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())

    const emptySlot = document.querySelector<HTMLElement>('[data-quick-execution-slot="1"]')!
    fireEvent.pointerMove(emptySlot, { pointerType: 'mouse' })
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      '快捷位 1 为空，可绑定当前画布中的对象。'
    )
  })

  it('falls back to a platform-appropriate shortcut when no configured label is provided', async () => {
    render(
      <QuickExecutionBar
        graph={createGraph()}
        onAdd={vi.fn()}
        onBind={vi.fn()}
        onClear={vi.fn()}
        onFocus={vi.fn()}
        onReorder={vi.fn()}
        shortcutPlatform="other"
      />
    )

    const boundSlot = document.querySelector<HTMLElement>('[data-quick-execution-slot="2"]')!
    fireEvent.pointerMove(boundSlot, { pointerType: 'mouse' })

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      '已绑定终端「Worker」。按 Ctrl+2 执行此快捷位；点击仅用于定位视图。'
    )
  })

  it('reorders filled slots by dragging one shortcut assignment onto another', () => {
    const onReorder = vi.fn()
    render(
      <QuickExecutionBar
        graph={createGraph()}
        onAdd={vi.fn()}
        onBind={vi.fn()}
        onClear={vi.fn()}
        onFocus={vi.fn()}
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

  it('keeps only rebind in the filled-slot menu', () => {
    render(
      <QuickExecutionBar
        graph={createGraph()}
        onAdd={vi.fn()}
        onBind={vi.fn()}
        onClear={vi.fn()}
        onFocus={vi.fn()}
        onReorder={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '打开快捷位 2 的操作' }))

    const rebindButton = screen.getByRole('button', { name: '重新绑定' })
    expect(rebindButton).toBeInTheDocument()
    expect(rebindButton.querySelector('[data-icon-role="restart"]')).toHaveAttribute(
      'data-icon-glyph',
      'arrow-clockwise'
    )
    expect(screen.queryByRole('button', { name: '向左移动' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '向右移动' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '清空快捷位' })).not.toBeInTheDocument()
  })

  it('keeps the popover DOM inert while closing and reuses it when opening reverses', () => {
    render(
      <QuickExecutionBar
        graph={createGraph()}
        onAdd={vi.fn()}
        onBind={vi.fn()}
        onClear={vi.fn()}
        onFocus={vi.fn()}
        onReorder={vi.fn()}
      />
    )

    const trigger = screen.getByRole('button', { name: '打开快捷位 2 的操作' })
    fireEvent.click(trigger)
    const popover = screen.getByRole('dialog', { name: '快捷位操作' })

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: '快捷位操作' })).not.toBeInTheDocument()
    expect(popover).toHaveAttribute('data-surface-motion-state', 'closing')
    expect(popover).toHaveAttribute('inert')

    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: '快捷位操作' })).toBe(popover)
  })

  it('clears a filled slot when it is dropped on the temporary trash target', () => {
    const onClear = vi.fn()
    render(
      <QuickExecutionBar
        graph={createGraph()}
        onAdd={vi.fn()}
        onBind={vi.fn()}
        onClear={onClear}
        onFocus={vi.fn()}
        onReorder={vi.fn()}
      />
    )

    expect(screen.queryByRole('region', { name: '拖到此处清空快捷位 2' })).not.toBeInTheDocument()

    const source = document.querySelector<HTMLElement>('[data-quick-execution-slot="2"]')!
    fireEvent.dragStart(source)
    const trash = screen.getByRole('region', { name: '拖到此处清空快捷位 2' })
    expect(trash).not.toHaveAttribute('data-state')
    expect(trash).not.toHaveAttribute('aria-describedby')
    expect(trash.querySelector('[data-trash-icon-variant="outline"]')).toBeInTheDocument()
    expect(trash.querySelector('[data-icon-role="delete"]')).toHaveAttribute(
      'data-icon-glyph',
      'trash'
    )
    fireEvent.dragOver(trash)
    expect(trash.querySelector('[data-trash-icon-variant="filled"]')).toBeInTheDocument()
    fireEvent.drop(trash)

    expect(onClear).toHaveBeenCalledWith(2)
    expect(screen.queryByRole('region', { name: '拖到此处清空快捷位 2' })).not.toBeInTheDocument()
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
