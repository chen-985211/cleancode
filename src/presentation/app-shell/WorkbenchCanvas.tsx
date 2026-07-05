import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  type Edge,
  type NodeChange,
  type NodeTypes,
  type ReactFlowInstance
} from '@xyflow/react'
import { Box, Map as MapIcon, Maximize2, Minimize2, Minus, Terminal, ZoomIn } from 'lucide-react'
import { useState, type MouseEvent, type MutableRefObject, type ReactNode } from 'react'

import {
  MinimapNodeInteractionContext,
  type MinimapNodeInteractionContextValue
} from './minimapInteraction'
import { MinimapTerminalNode } from './MinimapTerminalNode'
import type { TerminalFlowNode, WorkbenchSnapshot } from './types'

type CurrentWorkspace = WorkbenchSnapshot['project']['workspaces'][number]

interface WorkbenchCanvasProps {
  readonly isDesktopRuntime: boolean
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: CurrentWorkspace | undefined
  readonly nodes: TerminalFlowNode[]
  readonly nodeTypes: NodeTypes
  readonly reactFlowInstanceRef: MutableRefObject<ReactFlowInstance<TerminalFlowNode, Edge> | null>
  readonly minimapNodeInteraction: MinimapNodeInteractionContextValue
  readonly onCreateTerminalBlock: () => void
  readonly onNodesChange: (changes: NodeChange<TerminalFlowNode>[]) => void
  readonly onNodeClick: (event: MouseEvent, node: TerminalFlowNode) => void
  readonly onNodeDragStop: (
    event: globalThis.MouseEvent | TouchEvent,
    node: TerminalFlowNode
  ) => void
  readonly onMinimapNodeClick: (blockId: string) => void
  readonly getMiniMapNodeColor: (node: TerminalFlowNode) => string
  readonly getMiniMapNodeStrokeColor: (node: TerminalFlowNode) => string
  readonly getMiniMapNodeClassName: (node: TerminalFlowNode) => string
}

export function WorkbenchCanvas({
  isDesktopRuntime,
  currentWorkbench,
  currentWorkspace,
  nodes,
  nodeTypes,
  reactFlowInstanceRef,
  minimapNodeInteraction,
  onCreateTerminalBlock,
  onNodesChange,
  onNodeClick,
  onNodeDragStop,
  onMinimapNodeClick,
  getMiniMapNodeColor,
  getMiniMapNodeStrokeColor,
  getMiniMapNodeClassName
}: WorkbenchCanvasProps) {
  const [isMinimapCollapsed, setIsMinimapCollapsed] = useState(false)
  const [isDraggingTerminalNode, setIsDraggingTerminalNode] = useState(false)
  const [viewportZoom, setViewportZoom] = useState(1)
  const canvasSurfaceClassName = [
    'canvas-surface',
    isDraggingTerminalNode ? 'canvas-surface--dragging-terminal' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section className="app-shell__workspace" aria-label="积木画布">
      <header className="app-shell__toolbar" aria-label="工作台工具栏">
        <button
          className="toolbar-button toolbar-button--primary"
          type="button"
          onClick={onCreateTerminalBlock}
          disabled={!isDesktopRuntime || !currentWorkbench}
        >
          <Terminal size={16} aria-hidden="true" />
          新建终端积木
        </button>
      </header>
      <div className={canvasSurfaceClassName}>
        <ReactFlow<TerminalFlowNode, Edge>
          nodes={nodes}
          edges={[]}
          nodeTypes={nodeTypes}
          onInit={(instance) => {
            reactFlowInstanceRef.current = instance
            setViewportZoom(instance.getZoom())
          }}
          onNodesChange={onNodesChange}
          onNodeClick={onNodeClick}
          onNodeDragStart={() => setIsDraggingTerminalNode(true)}
          onNodeDragStop={(event, node) => {
            setIsDraggingTerminalNode(false)
            onNodeDragStop(event, node)
          }}
          onMove={(_event, viewport) => setViewportZoom(viewport.zoom)}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          minZoom={0.35}
          maxZoom={1.6}
        >
          <Background color="#d7deea" gap={20} size={1.2} />
          <Controls position="bottom-left" showInteractive={false} />
          <Panel className="canvas-minimap-panel" position="top-left">
            <CanvasMinimap
              isCollapsed={isMinimapCollapsed}
              viewportZoom={viewportZoom}
              minimapNodeInteraction={minimapNodeInteraction}
              onToggleCollapsed={() => setIsMinimapCollapsed((collapsed) => !collapsed)}
              onZoomOut={() => void reactFlowInstanceRef.current?.zoomOut({ duration: 160 })}
              onZoomIn={() => void reactFlowInstanceRef.current?.zoomIn({ duration: 160 })}
              onFitCanvas={() =>
                void reactFlowInstanceRef.current?.fitView({ padding: 0.22, duration: 180 })
              }
              onMinimapNodeClick={onMinimapNodeClick}
              getMiniMapNodeColor={getMiniMapNodeColor}
              getMiniMapNodeStrokeColor={getMiniMapNodeStrokeColor}
              getMiniMapNodeClassName={getMiniMapNodeClassName}
            />
          </Panel>
        </ReactFlow>
        {!currentWorkbench ? <CanvasEmptyState isDesktopRuntime={isDesktopRuntime} /> : null}
      </div>
      <CanvasStatusbar
        isDesktopRuntime={isDesktopRuntime}
        currentWorkbench={currentWorkbench}
        currentWorkspace={currentWorkspace}
      />
    </section>
  )
}

interface CanvasMinimapProps {
  readonly isCollapsed: boolean
  readonly viewportZoom: number
  readonly minimapNodeInteraction: MinimapNodeInteractionContextValue
  readonly onToggleCollapsed: () => void
  readonly onZoomOut: () => void
  readonly onZoomIn: () => void
  readonly onFitCanvas: () => void
  readonly onMinimapNodeClick: (blockId: string) => void
  readonly getMiniMapNodeColor: (node: TerminalFlowNode) => string
  readonly getMiniMapNodeStrokeColor: (node: TerminalFlowNode) => string
  readonly getMiniMapNodeClassName: (node: TerminalFlowNode) => string
}

function CanvasMinimap({
  isCollapsed,
  viewportZoom,
  minimapNodeInteraction,
  onToggleCollapsed,
  onZoomOut,
  onZoomIn,
  onFitCanvas,
  onMinimapNodeClick,
  getMiniMapNodeColor,
  getMiniMapNodeStrokeColor,
  getMiniMapNodeClassName
}: CanvasMinimapProps) {
  return (
    <div className="canvas-minimap">
      <div className="canvas-minimap__header">
        <span>小地图</span>
        <button
          className="icon-button icon-button--small"
          type="button"
          aria-label={isCollapsed ? '展开小地图' : '收起小地图'}
          title={isCollapsed ? '展开小地图' : '收起小地图'}
          onClick={onToggleCollapsed}
        >
          {isCollapsed ? (
            <Maximize2 size={13} aria-hidden="true" />
          ) : (
            <Minimize2 size={13} aria-hidden="true" />
          )}
        </button>
      </div>
      {!isCollapsed ? (
        <>
          <MinimapNodeInteractionContext.Provider value={minimapNodeInteraction}>
            <MiniMap<TerminalFlowNode>
              pannable
              zoomable
              ariaLabel="积木导航小地图"
              nodeComponent={MinimapTerminalNode}
              nodeColor={getMiniMapNodeColor}
              nodeStrokeColor={getMiniMapNodeStrokeColor}
              nodeClassName={getMiniMapNodeClassName}
              nodeBorderRadius={8}
              nodeStrokeWidth={3}
              maskColor="rgb(37 99 235 / 0.08)"
              maskStrokeColor="rgb(37 99 235 / 0.28)"
              maskStrokeWidth={1.5}
              onNodeClick={(event, node) => {
                event.stopPropagation()
                onMinimapNodeClick(node.id)
              }}
            />
          </MinimapNodeInteractionContext.Provider>
          <div className="canvas-minimap__controls">
            <MinimapControlButton label="小地图缩小" title="缩小画布" onClick={onZoomOut}>
              <Minus size={13} aria-hidden="true" />
            </MinimapControlButton>
            <span>{Math.round(viewportZoom * 100)}%</span>
            <MinimapControlButton label="小地图放大" title="放大画布" onClick={onZoomIn}>
              <ZoomIn size={13} aria-hidden="true" />
            </MinimapControlButton>
            <MinimapControlButton label="小地图适应" title="适应画布" onClick={onFitCanvas}>
              <MapIcon size={13} aria-hidden="true" />
            </MinimapControlButton>
          </div>
        </>
      ) : null}
    </div>
  )
}

interface MinimapControlButtonProps {
  readonly label: string
  readonly title: string
  readonly onClick: () => void
  readonly children: ReactNode
}

function MinimapControlButton({ label, title, onClick, children }: MinimapControlButtonProps) {
  return (
    <button
      className="icon-button icon-button--small"
      type="button"
      aria-label={label}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function CanvasEmptyState({ isDesktopRuntime }: { readonly isDesktopRuntime: boolean }) {
  return (
    <div className="canvas-empty">
      <Box size={24} aria-hidden="true" />
      <span>
        {isDesktopRuntime
          ? '选择或添加项目后进入 main 工作区'
          : '当前是浏览器预览模式，真实项目和终端功能请在 Electron 桌面应用中使用'}
      </span>
    </div>
  )
}

interface CanvasStatusbarProps {
  readonly isDesktopRuntime: boolean
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: CurrentWorkspace | undefined
}

function CanvasStatusbar({
  isDesktopRuntime,
  currentWorkbench,
  currentWorkspace
}: CanvasStatusbarProps) {
  return (
    <footer className="app-shell__statusbar">
      <span className="status-dot status-dot--running" />
      <span>
        {!isDesktopRuntime ? '浏览器预览模式' : currentWorkbench ? '已连接本地运行时' : '等待项目'}
      </span>
      {currentWorkspace ? <span className="status-path">{currentWorkspace.directory}</span> : null}
    </footer>
  )
}
