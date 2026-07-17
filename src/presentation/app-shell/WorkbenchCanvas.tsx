import {
  Background,
  Panel,
  ReactFlow,
  type Edge,
  type NodeChange,
  type NodeTypes,
  type ReactFlowInstance,
  type Viewport
} from '@xyflow/react'
import { useEffect, useMemo, useRef, useState, type MouseEvent, type MutableRefObject } from 'react'
import { Box } from 'lucide-react'

import {
  defaultCanvasViewport,
  maximumCanvasZoom,
  minimumCanvasZoom
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { CanvasMinimap, type MinimapViewportCenter } from './CanvasMinimap'
import { isolateWorkbenchNodeDragChanges } from './isolateWorkbenchNodeDragChanges'
import type { MinimapNodeInteractionContextValue } from './minimapInteraction'
import type { MinimapFlowNode, WorkbenchFlowNode, WorkbenchSnapshot } from './types'
import type { useTerminalWorkflow } from './useTerminalWorkflow'
import { WorkbenchToolbar } from './WorkbenchToolbar'
import { createAgentApprovalIntentEdges } from './agentApprovalPresentation'
import { projectAgentConnectionApprovalsOntoWorkflowEdges } from './agentApprovalConnectionProjection'
import type { AgentToolApprovalViewState } from './agentToolApprovalTypes'
import { workbenchEdgeTypes } from './workbenchNodeTypes'

type CurrentWorkspace = WorkbenchSnapshot['project']['workspaces'][number]

interface WorkbenchCanvasProps {
  readonly approvalIntents?: readonly AgentToolApprovalViewState[]
  readonly isDesktopRuntime: boolean
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: CurrentWorkspace | undefined
  readonly nodes: WorkbenchFlowNode[]
  readonly minimapNodes: MinimapFlowNode[]
  readonly nodeTypes: NodeTypes
  readonly reactFlowInstanceRef: MutableRefObject<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>
  readonly minimapNodeInteraction: MinimapNodeInteractionContextValue
  readonly terminalWorkflow?: ReturnType<typeof useTerminalWorkflow>
  readonly onCreateTerminalBlock: () => void
  readonly onCreateWorkspaceAgent: () => void
  readonly onBeginTerminalGroupSelection: () => void
  readonly onCreateTerminalGroup: () => void
  readonly onCancelTerminalGroupSelection: () => void
  readonly isTerminalGroupSelectionMode: boolean
  readonly selectedTerminalGroupCandidateCount: number
  readonly canBeginTerminalGroupSelection: boolean
  readonly canCreateTerminalGroup: boolean
  readonly onNodesChange: (changes: NodeChange<WorkbenchFlowNode>[]) => void
  readonly onNodeClick: (event: MouseEvent, node: WorkbenchFlowNode) => void
  readonly onPaneClick: () => void
  readonly onNodeDrag: (event: globalThis.MouseEvent | TouchEvent, node: WorkbenchFlowNode) => void
  readonly onNodeDragStart: (
    event: globalThis.MouseEvent | TouchEvent,
    node: WorkbenchFlowNode
  ) => void
  readonly onNodeDragStop: (
    event: globalThis.MouseEvent | TouchEvent,
    node: WorkbenchFlowNode
  ) => void
  readonly onViewportChange: (viewport: WorkbenchSnapshot['graph']['viewport']) => void
  readonly onMinimapNodeClick: (blockId: string) => void
  readonly getMiniMapNodeColor: (node: MinimapFlowNode) => string
  readonly getMiniMapNodeStrokeColor: (node: MinimapFlowNode) => string
  readonly getMiniMapNodeClassName: (node: MinimapFlowNode) => string
}

export function WorkbenchCanvas({
  approvalIntents = [],
  isDesktopRuntime,
  currentWorkbench,
  currentWorkspace,
  nodes,
  minimapNodes,
  nodeTypes,
  reactFlowInstanceRef,
  minimapNodeInteraction,
  terminalWorkflow,
  onCreateTerminalBlock,
  onCreateWorkspaceAgent,
  onBeginTerminalGroupSelection,
  onCreateTerminalGroup,
  onCancelTerminalGroupSelection,
  isTerminalGroupSelectionMode,
  selectedTerminalGroupCandidateCount,
  canBeginTerminalGroupSelection,
  canCreateTerminalGroup,
  onNodesChange,
  onNodeClick,
  onPaneClick,
  onNodeDrag,
  onNodeDragStart,
  onNodeDragStop,
  onViewportChange,
  onMinimapNodeClick,
  getMiniMapNodeColor,
  getMiniMapNodeStrokeColor,
  getMiniMapNodeClassName
}: WorkbenchCanvasProps) {
  const workflow = terminalWorkflow ?? inactiveTerminalWorkflowController
  const approvalEdges = useMemo(
    () => createAgentApprovalIntentEdges(approvalIntents, currentWorkbench?.graph ?? null),
    [approvalIntents, currentWorkbench?.graph]
  )
  const workflowEdges = useMemo(
    () =>
      projectAgentConnectionApprovalsOntoWorkflowEdges(
        workflow.edges,
        approvalIntents,
        currentWorkbench?.graph ?? null
      ),
    [approvalIntents, currentWorkbench?.graph, workflow.edges]
  )
  const edges = useMemo(() => [...workflowEdges, ...approvalEdges], [approvalEdges, workflowEdges])
  const [isMinimapCollapsed, setIsMinimapCollapsed] = useState(false)
  const [isDraggingTerminalNode, setIsDraggingTerminalNode] = useState(false)
  const [viewportZoom, setViewportZoom] = useState(1)
  const [canvasViewport, setCanvasViewport] = useState(defaultCanvasViewport)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const canvasSurfaceRef = useRef<HTMLDivElement | null>(null)
  const activeDraggedNodeIdRef = useRef<string | null>(null)
  const restoredGraphIdRef = useRef<string | null>(null)
  const isRestoringViewportRef = useRef(false)
  const canvasSurfaceClassName = [
    'canvas-surface',
    isDraggingTerminalNode ? 'canvas-surface--dragging-terminal' : ''
  ]
    .filter(Boolean)
    .join(' ')
  const moveCanvasViewportToMinimapCenter = (
    center: MinimapViewportCenter,
    persistViewport: boolean
  ): void => {
    const instance = reactFlowInstanceRef.current

    if (!instance) {
      return
    }

    centerCanvasViewportOnMinimapPoint({
      center,
      canvasSize,
      instance,
      persistViewport,
      onViewportChange,
      setCanvasViewport,
      setViewportZoom
    })
  }
  const beginTerminalGroupSelection = (): void => {
    onBeginTerminalGroupSelection()
    void reactFlowInstanceRef.current?.fitView({ padding: 0.22, duration: 180 })
  }

  useEffect(() => {
    const canvasSurface = canvasSurfaceRef.current

    if (!canvasSurface) {
      return undefined
    }

    const updateCanvasSize = (): void => {
      setCanvasSize({
        width: canvasSurface.clientWidth,
        height: canvasSurface.clientHeight
      })
    }

    updateCanvasSize()

    if (typeof ResizeObserver === 'undefined') {
      return undefined
    }

    const resizeObserver = new ResizeObserver(updateCanvasSize)

    resizeObserver.observe(canvasSurface)

    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    const instance = reactFlowInstanceRef.current

    if (
      !instance ||
      !currentWorkbench ||
      restoredGraphIdRef.current === currentWorkbench.graph.id
    ) {
      return
    }

    restoreCanvasViewport({
      instance,
      viewport: currentWorkbench.graph.viewport,
      graphId: currentWorkbench.graph.id,
      restoredGraphIdRef,
      isRestoringViewportRef,
      setViewportZoom,
      setCanvasViewport
    })
  }, [currentWorkbench, reactFlowInstanceRef])

  return (
    <section className="app-shell__workspace" aria-label="积木画布">
      <div ref={canvasSurfaceRef} className={canvasSurfaceClassName}>
        <WorkbenchToolbar
          isDesktopRuntime={isDesktopRuntime}
          hasWorkbench={Boolean(currentWorkbench)}
          isWorkflowActive={workflow.isActive}
          workflowStatus={workflow.run?.status ?? null}
          workflowError={workflow.actionError}
          isTerminalGroupSelectionMode={isTerminalGroupSelectionMode}
          selectedTerminalGroupCandidateCount={selectedTerminalGroupCandidateCount}
          canBeginTerminalGroupSelection={canBeginTerminalGroupSelection}
          canCreateTerminalGroup={canCreateTerminalGroup}
          onCreateTerminalBlock={onCreateTerminalBlock}
          onCreateWorkspaceAgent={onCreateWorkspaceAgent}
          onBeginTerminalGroupSelection={beginTerminalGroupSelection}
          onCreateTerminalGroup={onCreateTerminalGroup}
          onCancelTerminalGroupSelection={onCancelTerminalGroupSelection}
          onStopWorkflow={() => void workflow.stop()}
        />
        <ReactFlow<WorkbenchFlowNode, Edge>
          nodes={nodes}
          edges={edges}
          edgeTypes={workbenchEdgeTypes}
          onConnect={(connection) => void workflow.connect(connection)}
          onEdgesDelete={(edges) =>
            void workflow.deleteEdges(edges.filter((edge) => !edge.id.startsWith('approval:')))
          }
          nodeTypes={nodeTypes}
          onInit={(instance) => {
            reactFlowInstanceRef.current = instance

            if (currentWorkbench) {
              restoreCanvasViewport({
                instance,
                viewport: currentWorkbench.graph.viewport,
                graphId: currentWorkbench.graph.id,
                restoredGraphIdRef,
                isRestoringViewportRef,
                setViewportZoom,
                setCanvasViewport
              })
              return
            }

            const viewport = instance.getViewport()

            setViewportZoom(viewport.zoom)
            setCanvasViewport(toCanvasViewportSnapshot(viewport))
          }}
          onNodesChange={(changes) =>
            onNodesChange(
              isolateWorkbenchNodeDragChanges(changes, nodes, activeDraggedNodeIdRef.current)
            )
          }
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onNodeDragStart={(event, node) => {
            activeDraggedNodeIdRef.current = node.id
            setIsDraggingTerminalNode(true)
            onNodeDragStart(event, node)
          }}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={(event, node) => {
            try {
              setIsDraggingTerminalNode(false)
              onNodeDragStop(event, node)
            } finally {
              activeDraggedNodeIdRef.current = null
            }
          }}
          onMove={(_event, viewport) => {
            const canvasViewportSnapshot = toCanvasViewportSnapshot(viewport)

            setViewportZoom(canvasViewportSnapshot.zoom)
            setCanvasViewport(canvasViewportSnapshot)
          }}
          onMoveEnd={(_event, viewport) => {
            if (!isRestoringViewportRef.current) {
              onViewportChange(toCanvasViewportSnapshot(viewport))
            }
          }}
          defaultViewport={currentWorkbench?.graph.viewport ?? defaultCanvasViewport}
          multiSelectionKeyCode={null}
          selectionKeyCode={null}
          minZoom={minimumCanvasZoom}
          maxZoom={maximumCanvasZoom}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="var(--cc-border-strong)" gap={24} size={1} />
          <Panel className="canvas-minimap-panel" position="top-left">
            <CanvasMinimap
              isCollapsed={isMinimapCollapsed}
              nodes={minimapNodes}
              canvasViewport={canvasViewport}
              canvasSize={canvasSize}
              viewportZoom={viewportZoom}
              minimapNodeInteraction={minimapNodeInteraction}
              onToggleCollapsed={() => setIsMinimapCollapsed((collapsed) => !collapsed)}
              onZoomOut={() => void reactFlowInstanceRef.current?.zoomOut({ duration: 160 })}
              onZoomIn={() => void reactFlowInstanceRef.current?.zoomIn({ duration: 160 })}
              onFitCanvas={() =>
                void reactFlowInstanceRef.current?.fitView({ padding: 0.22, duration: 180 })
              }
              onMinimapNodeClick={onMinimapNodeClick}
              onViewportCenterPreview={(center) => moveCanvasViewportToMinimapCenter(center, false)}
              onViewportCenterCommit={(center) => moveCanvasViewportToMinimapCenter(center, true)}
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

const inactiveTerminalWorkflowController = {
  actionError: null,
  clearActionError: () => undefined,
  connect: async () => undefined,
  deleteEdges: async () => undefined,
  edges: [],
  isActive: false,
  nodeStatuses: {},
  run: null,
  start: async () => undefined,
  stop: async () => undefined,
  updateExecutionConfig: async () => undefined
} satisfies ReturnType<typeof useTerminalWorkflow>

interface RestoreCanvasViewportInput {
  readonly instance: ReactFlowInstance<WorkbenchFlowNode, Edge>
  readonly viewport: WorkbenchSnapshot['graph']['viewport']
  readonly graphId: string
  readonly restoredGraphIdRef: MutableRefObject<string | null>
  readonly isRestoringViewportRef: MutableRefObject<boolean>
  readonly setViewportZoom: (zoom: number) => void
  readonly setCanvasViewport: (viewport: WorkbenchSnapshot['graph']['viewport']) => void
}

function restoreCanvasViewport({
  instance,
  viewport,
  graphId,
  restoredGraphIdRef,
  isRestoringViewportRef,
  setViewportZoom,
  setCanvasViewport
}: RestoreCanvasViewportInput): void {
  restoredGraphIdRef.current = graphId
  isRestoringViewportRef.current = true
  setViewportZoom(viewport.zoom)
  setCanvasViewport(viewport)

  void instance.setViewport(viewport, { duration: 0 }).finally(() => {
    window.setTimeout(() => {
      isRestoringViewportRef.current = false
    }, 0)
  })
}

function toCanvasViewportSnapshot(viewport: Viewport): WorkbenchSnapshot['graph']['viewport'] {
  return {
    x: viewport.x,
    y: viewport.y,
    zoom: viewport.zoom
  }
}

interface CenterCanvasViewportOnMinimapPointInput {
  readonly center: MinimapViewportCenter
  readonly canvasSize: { readonly width: number; readonly height: number }
  readonly instance: ReactFlowInstance<WorkbenchFlowNode, Edge>
  readonly persistViewport: boolean
  readonly onViewportChange: (viewport: WorkbenchSnapshot['graph']['viewport']) => void
  readonly setCanvasViewport: (viewport: WorkbenchSnapshot['graph']['viewport']) => void
  readonly setViewportZoom: (zoom: number) => void
}

function centerCanvasViewportOnMinimapPoint({
  center,
  canvasSize,
  instance,
  persistViewport,
  onViewportChange,
  setCanvasViewport,
  setViewportZoom
}: CenterCanvasViewportOnMinimapPointInput): void {
  const zoom = instance.getZoom()
  const viewport = {
    x: resolveCanvasDimension(canvasSize.width, 960) / 2 - center.x * zoom,
    y: resolveCanvasDimension(canvasSize.height, 640) / 2 - center.y * zoom,
    zoom
  }

  setViewportZoom(zoom)
  setCanvasViewport(viewport)
  void instance.setViewport(viewport, { duration: 0 })

  if (persistViewport) {
    onViewportChange(viewport)
  }
}

function resolveCanvasDimension(value: number, fallback: number): number {
  return value > 0 ? value : fallback
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
