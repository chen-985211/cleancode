import { fireEvent, render, screen } from '@testing-library/react'

import { CanvasMinimap } from '../../../src/presentation/app-shell/CanvasMinimap'
import type { MinimapNodeInteractionContextValue } from '../../../src/presentation/app-shell/minimapInteraction'
import {
  createIdleTerminalState,
  type TerminalFlowNode,
  type TerminalGroupFlowNode
} from '../../../src/presentation/app-shell/types'

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
        canvasViewport={{ x: 0, y: 0, zoom: 1 }}
        canvasSize={{ width: 960, height: 640 }}
        viewportZoom={1.51}
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

    fireEvent.click(screen.getByRole('button', { name: '小地图放大' }))
    fireEvent.click(screen.getByRole('button', { name: '小地图缩小' }))
    fireEvent.click(screen.getByRole('button', { name: '小地图适应' }))
    fireEvent.click(screen.getByRole('button', { name: '聚焦终端 Terminal 1' }))
    fireEvent.click(screen.getByRole('button', { name: '收起小地图' }))

    expect(onZoomIn).toHaveBeenCalledTimes(1)
    expect(onZoomOut).toHaveBeenCalledTimes(1)
    expect(onFitCanvas).toHaveBeenCalledTimes(1)
    expect(minimapNodeInteraction.focusBlock).toHaveBeenCalledWith('terminal-1')
    expect(onMinimapNodeClick).toHaveBeenCalledWith('terminal-1')
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1)
  })

  it('keeps collapsed terminal groups visible as minimap nodes', () => {
    const onMinimapNodeClick = vi.fn()
    const minimapNodeInteraction = createMinimapNodeInteraction()

    const { container } = render(
      <CanvasMinimap
        isCollapsed={false}
        nodes={[createCollapsedTerminalGroupFlowNode()]}
        canvasViewport={{ x: 0, y: 0, zoom: 1 }}
        canvasSize={{ width: 960, height: 640 }}
        viewportZoom={1}
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
    expect(container.querySelector('.canvas-minimap__group-member')).toBeInTheDocument()
    expect(container.querySelector('.canvas-minimap__node-screen')).not.toBeInTheDocument()
    expect(minimapNodeInteraction.focusBlock).toHaveBeenCalledWith('development-group')
    expect(onMinimapNodeClick).toHaveBeenCalledWith('development-group')
  })

  it('emits preview and commit centers while panning the minimap viewport', () => {
    const onViewportCenterPreview = vi.fn()
    const onViewportCenterCommit = vi.fn()

    render(
      <CanvasMinimap
        isCollapsed={false}
        nodes={[createTerminalFlowNode()]}
        canvasViewport={{ x: -120, y: 48, zoom: 1.25 }}
        canvasSize={{ width: 960, height: 640 }}
        viewportZoom={1.25}
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
})

function createMinimapNodeInteraction(): MinimapNodeInteractionContextValue {
  return {
    getLabel: (blockId) =>
      blockId === 'terminal-1'
        ? 'Terminal 1'
        : blockId === 'development-group'
          ? '启动项目'
          : blockId,
    focusBlock: vi.fn(),
    setHoveredBlockId: vi.fn()
  }
}

function createTerminalFlowNode(): TerminalFlowNode {
  return {
    id: 'terminal-1',
    type: 'terminal',
    position: { x: 160, y: 220 },
    selected: true,
    data: {
      block: {
        id: 'terminal-1',
        type: 'terminal',
        name: 'Terminal 1',
        description: '本地终端',
        launchCommand: '',
        position: { x: 160, y: 220 },
        size: { width: 420, height: 306 }
      },
      session: createIdleTerminalState(),
      isSelected: true,
      isTerminalGroupSelectionMode: false,
      canSelectForTerminalGroup: true,
      isNavigationHighlighted: false,
      onStart: vi.fn(),
      onStop: vi.fn(),
      onQuickLaunch: vi.fn(),
      onRestart: vi.fn(),
      onDelete: vi.fn(),
      onUpdateMetadata: vi.fn(),
      onInput: vi.fn(),
      onResize: vi.fn(),
      onResizeBlock: vi.fn(),
      onToggleTerminalGroupCandidate: vi.fn()
    }
  } as TerminalFlowNode
}

function createCollapsedTerminalGroupFlowNode(): TerminalGroupFlowNode {
  return {
    id: 'development-group',
    type: 'terminalGroup',
    position: { x: 300, y: 180 },
    selected: true,
    style: {
      width: 360,
      height: 174
    },
    data: {
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
      isSelected: true,
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
