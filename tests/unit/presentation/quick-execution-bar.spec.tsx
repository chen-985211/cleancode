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

  it('dismisses the slot tooltip when a drag begins', async () => {
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

    const source = document.querySelector<HTMLElement>('[data-quick-execution-slot="2"]')!
    fireEvent.pointerMove(source, { pointerType: 'mouse' })
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()

    fireEvent.dragStart(source)

    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())

    fireEvent.dragEnd(source)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
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

  it('clears a filled slot while its intact proxy springs into the black hole', () => {
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
    const bar = document.querySelector<HTMLElement>('[data-quick-execution-bar]')!
    const hiddenBlackHole = document.querySelector<HTMLElement>('[data-quick-execution-trash]')!
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue(
      createDomRect({ height: 36, left: 100, top: 180, width: 440 })
    )
    vi.spyOn(source, 'getBoundingClientRect').mockReturnValue(
      createDomRect({ height: 36, left: 190, top: 180, width: 85 })
    )
    vi.spyOn(hiddenBlackHole, 'getBoundingClientRect').mockReturnValue(
      createDomRect({ height: 58, left: 568, top: 169, width: 112 })
    )
    const dataTransfer = {
      dropEffect: 'none',
      effectAllowed: 'none',
      setData: vi.fn(),
      setDragImage: vi.fn()
    }
    fireEvent.dragStart(source, { clientX: 230, clientY: 198, dataTransfer })
    const blackHole = screen.getByRole('region', { name: '拖到此处清空快捷位 2' })
    const dragProxy = document.querySelector<HTMLElement>('[data-quick-execution-drag-proxy]')!
    const nativeDragImage = document.querySelector<HTMLCanvasElement>(
      '[data-quick-execution-native-drag-image]'
    )!
    expect(source).toHaveClass('quick-execution__slot--dragging')
    expect(dragProxy).toBeInTheDocument()
    expect(dragProxy).toHaveStyle({
      height: '36px',
      transform: 'translate3d(90px, 0px, 0)',
      width: '85px'
    })
    expect(dragProxy).toHaveTextContent('2Worker')
    expect(dragProxy).not.toHaveClass('quick-execution__drag-proxy--near-black-hole')
    expect(dataTransfer.setData).toHaveBeenCalledWith(
      'application/x-cleancode-quick-execution-slot',
      '2'
    )
    expect(nativeDragImage).toBeInstanceOf(HTMLCanvasElement)
    expect(nativeDragImage).toHaveAttribute('width', '1')
    expect(nativeDragImage).toHaveAttribute('height', '1')
    expect(nativeDragImage).toBe(dataTransfer.setDragImage.mock.calls[0]?.[0])
    expect(dataTransfer.setDragImage).toHaveBeenCalledWith(nativeDragImage, 0, 0)
    expect(blackHole).toHaveAttribute('data-quick-execution-clear-target', 'black-hole')
    expect(blackHole.querySelector('[data-quick-execution-black-hole]')).toBeInTheDocument()
    const blackHoleMotion = blackHole.querySelector('[data-quick-execution-black-hole-motion]')
    expect(blackHoleMotion).toBeInstanceOf(HTMLVideoElement)
    expect(blackHoleMotion).toHaveProperty('autoplay', true)
    expect(blackHoleMotion).toHaveProperty('loop', true)
    expect(blackHoleMotion).toHaveProperty('muted', true)
    expect(blackHole.querySelector('[data-icon-role="delete"]')).not.toBeInTheDocument()

    fireEvent(source, new MouseEvent('drag', { bubbles: true, clientX: 520, clientY: 198 }))
    expect(dragProxy).toHaveStyle({ transform: 'translate3d(377.5px, 0px, 0)' })
    expect(dragProxy).toHaveClass('quick-execution__drag-proxy--near-black-hole')

    fireEvent(source, new MouseEvent('drag', { bubbles: true, clientX: 340, clientY: 198 }))
    expect(dragProxy).not.toHaveClass('quick-execution__drag-proxy--near-black-hole')

    fireEvent.dragEnter(blackHole, { clientX: 576, clientY: 198 })
    expect(blackHole).toHaveClass('quick-execution__black-hole--target')
    expect(dragProxy).toHaveClass('quick-execution__drag-proxy--near-black-hole')
    expect(screen.getByText('松开以清空 2 号快捷位')).toBeInTheDocument()

    fireEvent.dragLeave(blackHole)
    expect(blackHole).not.toHaveClass('quick-execution__black-hole--target')
    expect(screen.queryByText('松开以清空 2 号快捷位')).not.toBeInTheDocument()

    fireEvent(source, new MouseEvent('drag', { bubbles: true, clientX: 340, clientY: 198 }))
    expect(dragProxy).not.toHaveClass('quick-execution__drag-proxy--near-black-hole')

    fireEvent(source, new MouseEvent('drag', { bubbles: true, clientX: 576, clientY: 198 }))
    fireEvent.dragEnter(blackHole)
    fireEvent.drop(blackHole)

    expect(onClear).toHaveBeenCalledWith(2)
    expect(screen.queryByRole('region', { name: '拖到此处清空快捷位 2' })).not.toBeInTheDocument()
    expect(document.querySelector('[data-quick-execution-drag-proxy]')).not.toBeInTheDocument()
    const clearAnimation = document.querySelector<HTMLElement>(
      '[data-quick-execution-clear-animation]'
    )!
    expect(clearAnimation).toBeInTheDocument()
    expect(clearAnimation).toHaveClass(
      'workbench-object-motion--delete',
      'workbench-object-motion--spatial'
    )
    expect(clearAnimation).toHaveStyle({
      height: '36px',
      left: '481.5px',
      top: '0px',
      width: '85px'
    })
    expect(clearAnimation.style.getPropertyValue('--workbench-object-motion-x')).toBe('-48px')
    expect(clearAnimation.style.getPropertyValue('--workbench-object-motion-y')).toBe('0px')
    expect(clearAnimation.style.getPropertyValue('--workbench-object-motion-scale')).toBe('1')
    expect(clearAnimation).toHaveTextContent('2Worker')
    expect(blackHole).toHaveClass(
      'quick-execution__black-hole--visible',
      'quick-execution__black-hole--target',
      'quick-execution__black-hole--clearing'
    )
  })

  it('restores the source slot when a black-hole drag is cancelled', () => {
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

    const source = document.querySelector<HTMLElement>('[data-quick-execution-slot="2"]')!
    fireEvent.dragStart(source)
    expect(source).toHaveClass('quick-execution__slot--dragging')
    expect(screen.getByRole('region', { name: '拖到此处清空快捷位 2' })).toBeInTheDocument()

    fireEvent.dragEnd(source)

    expect(source).not.toHaveClass('quick-execution__slot--dragging')
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

function createDomRect({
  height,
  left,
  top,
  width
}: {
  readonly height: number
  readonly left: number
  readonly top: number
  readonly width: number
}): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    toJSON: () => ({}),
    top,
    width,
    x: left,
    y: top
  }
}
