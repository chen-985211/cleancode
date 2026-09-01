import { act, fireEvent, render, screen, within } from '@testing-library/react'

import {
  CanvasMinimap,
  LiveCanvasMinimapViewportFrame
} from '../../../src/presentation/app-shell/workbench/minimap/CanvasMinimap'
import type { MinimapNodeInteractionContextValue } from '../../../src/presentation/app-shell/workbench/minimap/minimapInteraction'
import { createWorkbenchCanvasViewportStore } from '../../../src/presentation/app-shell/workbench/viewport/workbenchCanvasViewportStore'
import { createIdleTerminalState } from '../../../src/contexts/run/presentation/view-models/TerminalPresentationTypes'
import type { TerminalFlowNode } from '../../../src/presentation/app-shell/types/terminalFlowNode'
import type { TerminalGroupFlowNode } from '../../../src/presentation/app-shell/types/terminalGroupFlowNode'

describe('canvas minimap', () => {
  const restoreSvgGeometry = installSvgGeometryMocks()

  afterAll(() => {
    restoreSvgGeometry()
  })

  it('routes controls and terminal node activation through presentation callbacks', () => {
    const onToggleCollapsed = vi.fn()
    const onZoomIn = vi.fn()
    const onZoomOut = vi.fn()
    const onFitCanvas = vi.fn()
    const onMinimapNodeClick = vi.fn()
    const minimapNodeInteraction = createMinimapNodeInteraction()

    render(
      <CanvasMinimap
        isCollapsed={false}
        nodes={[createTerminalFlowNode()]}
        canvasSize={{ width: 960, height: 640 }}
        viewportStore={createWorkbenchCanvasViewportStore({ x: 0, y: 0, zoom: 1.51 })}
        shortcutTooltips={canvasShortcutTooltips}
        minimapNodeInteraction={minimapNodeInteraction}
        onToggleCollapsed={onToggleCollapsed}
        onZoomOut={onZoomOut}
        onZoomIn={onZoomIn}
        onFitCanvas={onFitCanvas}
        onMinimapNodeClick={onMinimapNodeClick}
        onViewportCenterPreview={vi.fn()}
        onViewportCenterCommit={vi.fn()}
        getMiniMapNodeColor={() => '#22c55e'}
        getMiniMapNodeStrokeColor={() => '#d3dbe8'}
        getMiniMapNodeClassName={() => 'canvas-minimap__node'}
      />
    )

    expect(screen.getByText('151%')).toBeInTheDocument()

    expect(
      screen
        .getByRole('button', { name: '适应画布' })
        .querySelector('[data-icon-role="fit-canvas"]')
    ).toHaveAttribute('data-icon-glyph', 'corners-out')
    expect(
      screen
        .getByRole('button', { name: '收起小地图' })
        .querySelector('[data-icon-role="disclosure"]')
    ).toHaveAttribute('data-icon-glyph', 'caret-down')

    fireEvent.click(screen.getByRole('button', { name: '放大画布' }))
    fireEvent.click(screen.getByRole('button', { name: '缩小画布' }))
    fireEvent.click(screen.getByRole('button', { name: '适应画布' }))
    fireEvent.click(screen.getByRole('button', { name: '聚焦终端 Terminal 1' }))
    fireEvent.click(screen.getByRole('button', { name: '收起小地图' }))

    expect(onZoomIn).toHaveBeenCalledTimes(1)
    expect(onZoomOut).toHaveBeenCalledTimes(1)
    expect(onFitCanvas).toHaveBeenCalledTimes(1)
    expect(onMinimapNodeClick).toHaveBeenCalledWith('terminal-1')
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1)
  })

  it('keeps the minimap framing stable when canvas selection changes', () => {
    const firstNode = createTerminalFlowNode({ selected: false })
    const secondNode = createTerminalFlowNode({
      id: 'terminal-2',
      name: 'Terminal 2',
      position: { x: 1480, y: 760 },
      selected: true
    })
    const props = createCanvasMinimapProps()
    const { rerender } = render(<CanvasMinimap {...props} nodes={[firstNode, secondNode]} />)
    const minimap = screen.getByRole('img', { name: '积木导航小地图' })
    const selectedViewBox = minimap.getAttribute('viewBox')

    rerender(
      <CanvasMinimap
        {...props}
        nodes={[
          firstNode,
          createTerminalFlowNode({
            id: 'terminal-2',
            name: 'Terminal 2',
            position: { x: 1480, y: 760 },
            selected: false
          })
        ]}
      />
    )

    expect(minimap).toHaveAttribute('viewBox', selectedViewBox)
  })

  it('updates the minimap framing when node geometry changes', () => {
    const firstNode = createTerminalFlowNode({ selected: false })
    const props = createCanvasMinimapProps()
    const { rerender } = render(
      <CanvasMinimap
        {...props}
        nodes={[
          firstNode,
          createTerminalFlowNode({
            id: 'terminal-2',
            name: 'Terminal 2',
            position: { x: 860, y: 420 },
            selected: false
          })
        ]}
      />
    )
    const minimap = screen.getByRole('img', { name: '积木导航小地图' })
    const originalViewBox = minimap.getAttribute('viewBox')

    rerender(
      <CanvasMinimap
        {...props}
        nodes={[
          firstNode,
          createTerminalFlowNode({
            id: 'terminal-2',
            name: 'Terminal 2',
            position: { x: 1480, y: 760 },
            selected: false
          })
        ]}
      />
    )

    expect(minimap.getAttribute('viewBox')).not.toBe(originalViewBox)
  })

  it('matches the minimap framing to the rendered map aspect ratio', () => {
    render(<CanvasMinimap {...createCanvasMinimapProps()} />)

    const viewBox = screen
      .getByRole('img', { name: '积木导航小地图' })
      .getAttribute('viewBox')
      ?.split(' ')
      .map(Number)

    expect(viewBox).toHaveLength(4)
    expect(viewBox![2]! / viewBox![3]!).toBeCloseTo(184 / 120, 6)
  })

  it('focuses a minimap node once for each pointer or keyboard activation', () => {
    const focusNode = vi.fn()

    render(<CanvasMinimap {...createCanvasMinimapProps()} onMinimapNodeClick={focusNode} />)

    const node = screen.getByRole('button', { name: '聚焦终端 Terminal 1' })

    fireEvent.mouseDown(node, { button: 0 })
    fireEvent.click(node, { button: 0 })

    expect(focusNode).toHaveBeenCalledTimes(1)

    focusNode.mockClear()
    fireEvent.keyDown(node, { key: 'Enter' })

    expect(focusNode).toHaveBeenCalledTimes(1)

    focusNode.mockClear()
    fireEvent.keyDown(node, { key: ' ' })

    expect(focusNode).toHaveBeenCalledTimes(1)

    focusNode.mockClear()
    fireEvent.keyDown(node, { key: ' ', repeat: false })
    fireEvent.keyDown(node, { key: ' ', repeat: true })

    expect(focusNode).toHaveBeenCalledTimes(1)
  })

  it('keeps keyboard focus on the minimap node after pointer activation', () => {
    render(<CanvasMinimap {...createCanvasMinimapProps()} />)

    const node = screen.getByRole('button', { name: '聚焦终端 Terminal 1' })

    fireEvent.click(node, { button: 0 })

    expect(node).toHaveFocus()
  })

  it('keeps one directional toggle to the right of the stable viewport controls', () => {
    const { container } = render(
      <CanvasMinimap
        {...createCanvasMinimapProps()}
        viewportStore={createWorkbenchCanvasViewportStore({ x: 0, y: 0, zoom: 0.7 })}
      />
    )

    const minimapControls = screen.getByRole('group', { name: '小地图控制' })
    const viewportControls = screen.getByRole('group', { name: '画布视图控制' })
    const navigationRow = container.querySelector('.canvas-minimap__navigation-row')!

    expect(Array.from(navigationRow.children)).toEqual([viewportControls, minimapControls])
    expect(within(minimapControls).getAllByRole('button')).toHaveLength(1)
    expect(within(minimapControls).getByRole('button', { name: '收起小地图' })).toBeInTheDocument()
    expect(
      container.querySelector('.canvas-minimap__panel .canvas-minimap__map-controls')
    ).toBeNull()
    expect(
      within(viewportControls)
        .getAllByRole('button')
        .map((control) => control.getAttribute('aria-label'))
    ).toEqual(['缩小画布', '放大画布', '适应画布'])
    expect(within(viewportControls).getByLabelText('画布缩放比例')).toHaveTextContent('70%')
  })

  it('keeps the zoom level synchronized with live viewport presentations', () => {
    const viewportStore = createWorkbenchCanvasViewportStore({ x: 0, y: 0, zoom: 1 })
    render(<CanvasMinimap {...createCanvasMinimapProps()} viewportStore={viewportStore} />)

    const zoomLevel = screen.getByLabelText('画布缩放比例')
    expect(zoomLevel).toHaveTextContent('100%')

    act(() => {
      viewportStore.setViewport({ x: -120, y: 48, zoom: 1.37 })
    })
    expect(zoomLevel).toHaveTextContent('137%')

    act(() => {
      viewportStore.setViewport({ x: -180, y: 72, zoom: 1.25 })
    })
    expect(zoomLevel).toHaveTextContent('125%')
  })

  it('updates live viewport leaves without reprojecting static minimap nodes', () => {
    const viewportStore = createWorkbenchCanvasViewportStore({ x: 0, y: 0, zoom: 1 })
    const getMiniMapNodeColor = vi.fn(() => '#22c55e')
    const getMiniMapNodeStrokeColor = vi.fn(() => '#d3dbe8')
    const getMiniMapNodeClassName = vi.fn(() => 'canvas-minimap__node')
    const props = {
      ...createCanvasMinimapProps(),
      viewportStore,
      getMiniMapNodeColor,
      getMiniMapNodeStrokeColor,
      getMiniMapNodeClassName
    }
    const { container, rerender } = render(<CanvasMinimap {...props} />)

    getMiniMapNodeColor.mockClear()
    getMiniMapNodeStrokeColor.mockClear()
    getMiniMapNodeClassName.mockClear()

    rerender(<CanvasMinimap {...props} />)

    act(() => {
      viewportStore.setViewport({ x: -120, y: 48, zoom: 1.25 })
    })

    expect(container.querySelector('.canvas-minimap__viewport-frame')).toHaveAttribute('x', '96')
    expect(screen.getByLabelText('画布缩放比例')).toHaveTextContent('125%')
    expect(getMiniMapNodeColor).not.toHaveBeenCalled()
    expect(getMiniMapNodeStrokeColor).not.toHaveBeenCalled()
    expect(getMiniMapNodeClassName).not.toHaveBeenCalled()
  })

  it('keeps the canvas viewport controls available while the minimap is collapsed', () => {
    const { container } = render(<CanvasMinimap {...createCanvasMinimapProps()} isCollapsed />)

    const minimapControls = screen.getByRole('group', { name: '小地图控制' })
    const viewportControls = screen.getByRole('group', { name: '画布视图控制' })
    const navigationRow = container.querySelector('.canvas-minimap__navigation-row')!

    expect(Array.from(navigationRow.children)).toEqual([viewportControls, minimapControls])
    expect(screen.queryByRole('img', { name: '积木导航小地图' })).not.toBeInTheDocument()
    expect(within(minimapControls).getAllByRole('button')).toHaveLength(1)
    expect(within(minimapControls).getByRole('button', { name: '展开小地图' })).toBeInTheDocument()
    expect(
      within(minimapControls)
        .getByRole('button', { name: '展开小地图' })
        .querySelector('[data-icon-role="disclosure"]')
    ).toHaveAttribute('data-icon-glyph', 'caret-down')
    expect(within(viewportControls).getAllByRole('button')).toHaveLength(3)
    expect(within(viewportControls).getByLabelText('画布缩放比例')).toHaveTextContent('100%')
  })

  it('keeps one inert panel through a spring exit and reverses it in place', () => {
    const props = createCanvasMinimapProps()
    const { container, rerender } = render(<CanvasMinimap {...props} />)
    const panel = container.querySelector<HTMLElement>('.canvas-minimap__panel')!

    expect(panel).toHaveAttribute('data-surface-motion-state', 'opening')

    rerender(<CanvasMinimap {...props} isCollapsed />)
    expect(container.querySelector('.canvas-minimap__panel')).toBe(panel)
    expect(panel).toHaveAttribute('data-surface-motion-state', 'closing')
    expect(panel).toHaveAttribute('aria-hidden', 'true')
    expect(panel).toHaveAttribute('inert')

    rerender(<CanvasMinimap {...props} />)
    expect(container.querySelector('.canvas-minimap__panel')).toBe(panel)
    expect(panel).toHaveAttribute('data-surface-motion-state', 'opening')
    expect(panel).not.toHaveAttribute('inert')
  })

  it('shows the configured canvas shortcuts in control tooltips', async () => {
    render(<CanvasMinimap {...createCanvasMinimapProps()} />)

    fireEvent.pointerMove(screen.getByRole('button', { name: '放大画布' }), {
      pointerType: 'mouse'
    })

    expect(await screen.findByRole('tooltip')).toHaveTextContent('放大画布 (⌘])')
  })

  it('shows the configured minimap toggle shortcut in both states', async () => {
    const props = createCanvasMinimapProps()
    const { rerender } = render(<CanvasMinimap {...props} />)

    fireEvent.pointerMove(screen.getByRole('button', { name: '收起小地图' }), {
      pointerType: 'mouse'
    })
    expect(await screen.findByRole('tooltip')).toHaveTextContent('收起或展开小地图 (⌘⇧M)')

    fireEvent.pointerLeave(screen.getByRole('button', { name: '收起小地图' }), {
      pointerType: 'mouse'
    })
    rerender(<CanvasMinimap {...props} isCollapsed />)
    fireEvent.pointerMove(screen.getByRole('button', { name: '展开小地图' }), {
      pointerType: 'mouse'
    })
    expect(await screen.findByRole('tooltip')).toHaveTextContent('收起或展开小地图 (⌘⇧M)')
  })

  it('keeps collapsed terminal groups visible as minimap nodes', () => {
    const onMinimapNodeClick = vi.fn()
    const minimapNodeInteraction = createMinimapNodeInteraction()

    const { container } = render(
      <CanvasMinimap
        isCollapsed={false}
        nodes={[createCollapsedTerminalGroupFlowNode()]}
        canvasSize={{ width: 960, height: 640 }}
        viewportStore={createWorkbenchCanvasViewportStore({ x: 0, y: 0, zoom: 1 })}
        shortcutTooltips={canvasShortcutTooltips}
        minimapNodeInteraction={minimapNodeInteraction}
        onToggleCollapsed={vi.fn()}
        onZoomOut={vi.fn()}
        onZoomIn={vi.fn()}
        onFitCanvas={vi.fn()}
        onMinimapNodeClick={onMinimapNodeClick}
        onViewportCenterPreview={vi.fn()}
        onViewportCenterCommit={vi.fn()}
        getMiniMapNodeColor={() => '#22c55e'}
        getMiniMapNodeStrokeColor={() => '#d3dbe8'}
        getMiniMapNodeClassName={() => 'canvas-minimap__node'}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '聚焦终端组合 启动项目' }))

    expect(container.querySelector('.canvas-minimap__node--terminal-group')).toBeInTheDocument()
    expect(container.querySelector('.canvas-minimap__group-ring')).toBeInTheDocument()
    expect(container.querySelector('.canvas-minimap__group-ring')).toHaveAttribute(
      'stroke',
      'var(--cc-primary)'
    )
    expect(container.querySelector('.canvas-minimap__group-ring')).toHaveAttribute(
      'opacity',
      '0.72'
    )
    expect(container.querySelector('.canvas-minimap__group-member')).toBeInTheDocument()
    expect(container.querySelector('.canvas-minimap__node-screen')).not.toBeInTheDocument()
    expect(onMinimapNodeClick).toHaveBeenCalledWith('development-group')
  })

  it('keeps the collapsed terminal group outer ring transparent until selected', () => {
    const { container } = render(
      <CanvasMinimap
        isCollapsed={false}
        nodes={[createCollapsedTerminalGroupFlowNode({ selected: false })]}
        canvasSize={{ width: 960, height: 640 }}
        viewportStore={createWorkbenchCanvasViewportStore({ x: 0, y: 0, zoom: 1 })}
        shortcutTooltips={canvasShortcutTooltips}
        minimapNodeInteraction={createMinimapNodeInteraction()}
        onToggleCollapsed={vi.fn()}
        onZoomOut={vi.fn()}
        onZoomIn={vi.fn()}
        onFitCanvas={vi.fn()}
        onMinimapNodeClick={vi.fn()}
        onViewportCenterPreview={vi.fn()}
        onViewportCenterCommit={vi.fn()}
        getMiniMapNodeColor={() => '#22c55e'}
        getMiniMapNodeStrokeColor={() => '#dbe3ef'}
        getMiniMapNodeClassName={() => 'canvas-minimap__node'}
      />
    )

    expect(container.querySelector('.canvas-minimap__group-ring')).toHaveAttribute('opacity', '0')
    expect(container.querySelector('.canvas-minimap__group-ring')).toHaveAttribute(
      'stroke',
      'transparent'
    )
  })

  it('emits preview and commit centers while panning the minimap viewport', () => {
    const onViewportCenterPreview = vi.fn()
    const onViewportCenterCommit = vi.fn()

    render(
      <CanvasMinimap
        isCollapsed={false}
        nodes={[createTerminalFlowNode()]}
        canvasSize={{ width: 960, height: 640 }}
        viewportStore={createWorkbenchCanvasViewportStore({
          x: -120,
          y: 48,
          zoom: 1.25
        })}
        shortcutTooltips={canvasShortcutTooltips}
        minimapNodeInteraction={createMinimapNodeInteraction()}
        onToggleCollapsed={vi.fn()}
        onZoomOut={vi.fn()}
        onZoomIn={vi.fn()}
        onFitCanvas={vi.fn()}
        onMinimapNodeClick={vi.fn()}
        onViewportCenterPreview={onViewportCenterPreview}
        onViewportCenterCommit={onViewportCenterCommit}
        getMiniMapNodeColor={() => '#22c55e'}
        getMiniMapNodeStrokeColor={() => '#d3dbe8'}
        getMiniMapNodeClassName={() => 'canvas-minimap__node'}
      />
    )

    const minimap = screen.getByRole('img', {
      name: '积木导航小地图'
    }) as unknown as SVGSVGElement

    installPointerCaptureStubs(minimap)
    fireEvent.pointerDown(minimap, { button: 0, pointerId: 1, clientX: 100, clientY: 120 })
    fireEvent.pointerMove(minimap, { pointerId: 1, clientX: 160, clientY: 180 })
    fireEvent.pointerUp(minimap, { pointerId: 1, clientX: 160, clientY: 180 })

    expect(onViewportCenterPreview).toHaveBeenNthCalledWith(1, { x: 100, y: 120 })
    expect(onViewportCenterPreview).toHaveBeenNthCalledWith(2, { x: 160, y: 180 })
    expect(onViewportCenterCommit).toHaveBeenCalledWith({ x: 160, y: 180 })
  })

  it('keeps the viewport frame synchronized with the live React Flow viewport', () => {
    const viewportStore = createWorkbenchCanvasViewportStore({ x: 0, y: 0, zoom: 1 })
    const { container } = render(
      <svg>
        <LiveCanvasMinimapViewportFrame
          canvasSize={{ width: 960, height: 640 }}
          viewportStore={viewportStore}
        />
      </svg>
    )

    const viewportFrame = container.querySelector('.canvas-minimap__viewport-frame')

    expect(viewportFrame).toHaveAttribute('x', '0')
    expect(viewportFrame).toHaveAttribute('y', '0')
    expect(viewportFrame).toHaveAttribute('width', '960')
    expect(viewportFrame).toHaveAttribute('height', '640')

    act(() => {
      viewportStore.setViewport({ x: -120, y: 48, zoom: 1.25 })
    })

    expect(viewportFrame).toHaveAttribute('x', '96')
    expect(viewportFrame).toHaveAttribute('y', '-38.4')
    expect(viewportFrame).toHaveAttribute('width', '768')
    expect(viewportFrame).toHaveAttribute('height', '512')

    act(() => {
      viewportStore.setViewport({ x: -240, y: 96, zoom: 1.5 })
    })

    expect(viewportFrame).toHaveAttribute('x', '160')
    expect(viewportFrame).toHaveAttribute('y', '-64')
    expect(viewportFrame).toHaveAttribute('width', '640')
    expect(viewportFrame).toHaveAttribute('height', `${640 / 1.5}`)
  })
})

function createCanvasMinimapProps() {
  return {
    isCollapsed: false,
    nodes: [createTerminalFlowNode()],
    canvasSize: { width: 960, height: 640 },
    viewportStore: createWorkbenchCanvasViewportStore({ x: 0, y: 0, zoom: 1 }),
    shortcutTooltips: canvasShortcutTooltips,
    minimapNodeInteraction: createMinimapNodeInteraction(),
    onToggleCollapsed: vi.fn(),
    onZoomOut: vi.fn(),
    onZoomIn: vi.fn(),
    onFitCanvas: vi.fn(),
    onMinimapNodeClick: vi.fn(),
    onViewportCenterPreview: vi.fn(),
    onViewportCenterCommit: vi.fn(),
    getMiniMapNodeColor: () => '#22c55e',
    getMiniMapNodeStrokeColor: () => '#d3dbe8',
    getMiniMapNodeClassName: () => 'canvas-minimap__node'
  } satisfies Parameters<typeof CanvasMinimap>[0]
}

const canvasShortcutTooltips = {
  fitCanvas: '适应画布 (⌘1)',
  toggleMinimap: '收起或展开小地图 (⌘⇧M)',
  zoomCanvasIn: '放大画布 (⌘])',
  zoomCanvasOut: '缩小画布 (⌘[)'
} as const

function createMinimapNodeInteraction(): MinimapNodeInteractionContextValue {
  return {
    getLabel: (blockId) =>
      blockId === 'terminal-1'
        ? 'Terminal 1'
        : blockId === 'development-group'
          ? '启动项目'
          : blockId,
    setHoveredBlockId: vi.fn()
  }
}

function createTerminalFlowNode(
  input: {
    readonly id?: string
    readonly name?: string
    readonly position?: { readonly x: number; readonly y: number }
    readonly selected?: boolean
  } = {}
): TerminalFlowNode {
  const id = input.id ?? 'terminal-1'
  const name = input.name ?? 'Terminal 1'
  const position = input.position ?? { x: 160, y: 220 }
  const selected = input.selected ?? true

  return {
    id,
    type: 'terminal',
    position,
    selected,
    data: {
      identity: {
        projectId: 'project-1',
        workspaceId: 'main',
        objectKind: 'terminal',
        objectId: id
      },
      block: {
        id,
        type: 'terminal',
        name,
        description: '本地终端',
        launchCommand: '',
        position,
        size: { width: 420, height: 306 }
      },
      session: createIdleTerminalState(),
      isSelected: selected,
      isTerminalGroupSelectionMode: false,
      canSelectForTerminalGroup: true,
      isNavigationHighlighted: false,
      onStart: vi.fn(),
      onStop: vi.fn(),
      onQuickLaunch: vi.fn(),
      onRestart: vi.fn(),
      onDelete: vi.fn(),
      onUpdateDefinition: vi.fn(),
      onInput: vi.fn(),
      onResize: vi.fn(),
      onResizeBlock: vi.fn(),
      onToggleTerminalGroupCandidate: vi.fn()
    }
  } as TerminalFlowNode
}

function createCollapsedTerminalGroupFlowNode(
  input: { readonly selected?: boolean } = {}
): TerminalGroupFlowNode {
  const selected = input.selected ?? true

  return {
    id: 'development-group',
    type: 'terminalGroup',
    position: { x: 300, y: 180 },
    selected,
    style: {
      width: 360,
      height: 174
    },
    data: {
      identity: {
        projectId: 'project-1',
        workspaceId: 'main',
        objectKind: 'terminal-group',
        objectId: 'development-group'
      },
      group: {
        id: 'development-group',
        type: 'terminal-group',
        name: '启动项目',
        memberBlockIds: ['terminal-1', 'terminal-2'],
        position: { x: 300, y: 180 },
        size: { width: 984, height: 458 },
        isCollapsed: true
      },
      memberBlocks: [],
      memberStates: {},
      selectedUngroupedTerminalBlockIds: [],
      selectedMemberBlockIds: [],
      isSelected: selected,
      dropFeedback: null,
      onStartGroup: vi.fn(),
      onStopGroup: vi.fn(),
      onRestartGroup: vi.fn(),
      onUpdateGroupMetadata: vi.fn(),
      onToggleGroupCollapsed: vi.fn(),
      onAddSelectedTerminalsToGroup: vi.fn(),
      onRemoveSelectedTerminalsFromGroup: vi.fn(),
      onRemoveTerminalFromGroup: vi.fn(),
      onDissolveGroup: vi.fn()
    }
  } as TerminalGroupFlowNode
}

function installPointerCaptureStubs(element: SVGSVGElement): void {
  element.setPointerCapture = vi.fn()
  element.releasePointerCapture = vi.fn()
  element.hasPointerCapture = vi.fn(() => true)
}

function installSvgGeometryMocks(): () => void {
  const originalCreateSvgPoint = SVGSVGElement.prototype.createSVGPoint
  const originalGetScreenCtm = SVGSVGElement.prototype.getScreenCTM

  Object.defineProperty(SVGSVGElement.prototype, 'createSVGPoint', {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      matrixTransform() {
        return { x: this.x, y: this.y }
      }
    })
  })
  Object.defineProperty(SVGSVGElement.prototype, 'getScreenCTM', {
    configurable: true,
    value: () => ({
      inverse: () => ({})
    })
  })

  return () => {
    Object.defineProperty(SVGSVGElement.prototype, 'createSVGPoint', {
      configurable: true,
      value: originalCreateSvgPoint
    })
    Object.defineProperty(SVGSVGElement.prototype, 'getScreenCTM', {
      configurable: true,
      value: originalGetScreenCtm
    })
  }
}
