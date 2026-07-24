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
import { Box, FolderOpen } from 'lucide-react'

import {
  defaultCanvasViewport,
  maximumCanvasZoom,
  minimumCanvasZoom
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { CanvasMinimap, type MinimapViewportCenter } from './CanvasMinimap'
import { isolateWorkbenchNodeDragChanges } from './isolateWorkbenchNodeDragChanges'
import { filterMinimapNodes, type MinimapNodeInteractionContextValue } from './minimapInteraction'
import type { MinimapFlowNode, WorkbenchFlowNode, WorkbenchSnapshot } from './types'
import type { useTerminalWorkflow } from './useTerminalWorkflow'
import { WorkbenchToolbar } from './WorkbenchToolbar'
import type { ApplicationShortcutTooltipLabels } from './applicationShortcutTooltips'
import { createAgentApprovalIntentEdges } from './agentApprovalPresentation'
import { projectAgentConnectionApprovalsOntoWorkflowEdges } from './agentApprovalConnectionProjection'
import type { AgentToolApprovalViewState } from './agentToolApprovalTypes'
import type { TerminalRuntimeAvailabilitySnapshot } from '../../contexts/run/application/dto/TerminalRuntimeAvailability'
import { workbenchEdgeTypes } from './workbenchNodeTypes'
import { useI18n } from './i18n/useI18n'
import { useWorkbenchNodes, type WorkbenchNodeStore } from './workbenchNodeStore'
import type { CreatableAgentProviderSnapshot } from '../../contexts/agent/application/dto/AgentProviderDiscoverySnapshot'

type CurrentWorkspace = WorkbenchSnapshot['project']['workspaces'][number]

interface WorkbenchCanvasProps {
  readonly agentProviders?: readonly CreatableAgentProviderSnapshot[]
  readonly approvalIntents?: readonly AgentToolApprovalViewState[]
  readonly isDesktopRuntime: boolean
  readonly isCreatingAgent?: boolean
  readonly isAgentProviderDiscoveryPending?: boolean
  readonly defaultAgentProviderId?: string | null
  readonly terminalRuntimeAvailability: TerminalRuntimeAvailabilitySnapshot
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: CurrentWorkspace | undefined
  readonly nodeStore: WorkbenchNodeStore
  readonly nodeTypes: NodeTypes
  readonly canvasSizeRef?: MutableRefObject<{ width: number; height: number }>
  readonly reactFlowInstanceRef: MutableRefObject<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>
  readonly minimapNodeInteraction: MinimapNodeInteractionContextValue
  readonly terminalWorkflow?: ReturnType<typeof useTerminalWorkflow>
  readonly shortcutTooltips: ApplicationShortcutTooltipLabels
  readonly isMinimapCollapsed: boolean
  readonly onToggleMinimap: () => void
  readonly onZoomCanvasIn: () => void
  readonly onZoomCanvasOut: () => void
  readonly onFitCanvas: () => void
  readonly onOpenProject?: () => void
  readonly onCreateTerminalBlock: () => void
  readonly onCreateWorkspaceAgent: (providerId?: string) => void
  readonly onOpenAgentSettings?: () => void
  readonly onSelectDefaultAgentProvider?: (providerId: string) => void
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
  agentProviders = [],
  isDesktopRuntime,
  isCreatingAgent = false,
  isAgentProviderDiscoveryPending = false,
  defaultAgentProviderId = null,
  terminalRuntimeAvailability,
  currentWorkbench,
  currentWorkspace,
  nodeStore,
  nodeTypes,
  canvasSizeRef,
  reactFlowInstanceRef,
  minimapNodeInteraction,
  terminalWorkflow,
  shortcutTooltips,
  isMinimapCollapsed,
  onToggleMinimap,
  onZoomCanvasIn,
  onZoomCanvasOut,
  onFitCanvas,
  onOpenProject,
  onCreateTerminalBlock,
  onCreateWorkspaceAgent,
  onOpenAgentSettings,
  onSelectDefaultAgentProvider,
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
  const { t } = useI18n()
  const nodes = useWorkbenchNodes(nodeStore)
  const minimapNodes = useMemo(() => filterMinimapNodes(nodes), [nodes])
  const workflow = terminalWorkflow ?? inactiveTerminalWorkflowController
  const approvalEdges = useMemo(
    () => createAgentApprovalIntentEdges(approvalIntents, currentWorkbench?.graph ?? null, t),
    [approvalIntents, currentWorkbench?.graph, t]
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
  const [viewportZoom, setViewportZoom] = useState(1)
  const [canvasViewport, setCanvasViewport] = useState(defaultCanvasViewport)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const canvasSurfaceRef = useRef<HTMLDivElement | null>(null)
  const activeDraggedNodeRef = useRef<WorkbenchFlowNode | null>(null)
  const restoredGraphIdRef = useRef<string | null>(null)
  const isRestoringViewportRef = useRef(false)
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
      const nextCanvasSize = {
        width: canvasSurface.clientWidth,
        height: canvasSurface.clientHeight
      }
      setCanvasSize(nextCanvasSize)
      if (canvasSizeRef) {
        canvasSizeRef.current = nextCanvasSize
      }
    }

    updateCanvasSize()

    if (typeof ResizeObserver === 'undefined') {
      return undefined
    }

    const resizeObserver = new ResizeObserver(updateCanvasSize)

    resizeObserver.observe(canvasSurface)

    return () => resizeObserver.disconnect()
  }, [canvasSizeRef])

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
    <section className="app-shell__workspace" aria-label={t('canvas.label')}>
      <div ref={canvasSurfaceRef} className="canvas-surface">
        <WorkbenchToolbar
          agentProviders={agentProviders}
          defaultAgentProviderId={defaultAgentProviderId}
          shortcutTooltips={shortcutTooltips}
          isDesktopRuntime={isDesktopRuntime}
          isCreatingAgent={isCreatingAgent}
          isAgentProviderDiscoveryPending={isAgentProviderDiscoveryPending}
          hasWorkbench={Boolean(currentWorkbench)}
          isTerminalGroupSelectionMode={isTerminalGroupSelectionMode}
          selectedTerminalGroupCandidateCount={selectedTerminalGroupCandidateCount}
          canBeginTerminalGroupSelection={canBeginTerminalGroupSelection}
          canCreateTerminalGroup={canCreateTerminalGroup}
          onCreateTerminalBlock={onCreateTerminalBlock}
          onCreateWorkspaceAgent={onCreateWorkspaceAgent}
          onOpenAgentSettings={onOpenAgentSettings}
          onSelectDefaultAgentProvider={onSelectDefaultAgentProvider}
          onBeginTerminalGroupSelection={beginTerminalGroupSelection}
          onCreateTerminalGroup={onCreateTerminalGroup}
          onCancelTerminalGroupSelection={onCancelTerminalGroupSelection}
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
            onNodesChange(isolateWorkbenchNodeDragChanges(changes, activeDraggedNodeRef.current))
          }
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onNodeDragStart={(event, node) => {
            activeDraggedNodeRef.current = node
            canvasSurfaceRef.current?.classList.add('canvas-surface--dragging-terminal')
            onNodeDragStart(event, node)
          }}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={(event, node) => {
            try {
              canvasSurfaceRef.current?.classList.remove('canvas-surface--dragging-terminal')
              onNodeDragStop(event, node)
            } finally {
              activeDraggedNodeRef.current = null
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
              shortcutTooltips={shortcutTooltips}
              minimapNodeInteraction={minimapNodeInteraction}
              onToggleCollapsed={onToggleMinimap}
              onZoomOut={onZoomCanvasOut}
              onZoomIn={onZoomCanvasIn}
              onFitCanvas={onFitCanvas}
              onMinimapNodeClick={onMinimapNodeClick}
              onViewportCenterPreview={(center) => moveCanvasViewportToMinimapCenter(center, false)}
              onViewportCenterCommit={(center) => moveCanvasViewportToMinimapCenter(center, true)}
              getMiniMapNodeColor={getMiniMapNodeColor}
              getMiniMapNodeStrokeColor={getMiniMapNodeStrokeColor}
              getMiniMapNodeClassName={getMiniMapNodeClassName}
            />
          </Panel>
        </ReactFlow>
        {!currentWorkbench ? (
          <CanvasEmptyState isDesktopRuntime={isDesktopRuntime} onOpenProject={onOpenProject} />
        ) : null}
      </div>
      <CanvasStatusbar
        isDesktopRuntime={isDesktopRuntime}
        terminalRuntimeAvailability={terminalRuntimeAvailability}
        currentWorkbench={currentWorkbench}
        currentWorkspace={currentWorkspace}
      />
    </section>
  )
}

const inactiveTerminalWorkflowController = {
  activeRootBlockIds: [],
  connect: async () => undefined,
  deleteEdges: async () => undefined,
  edges: [],
  isActive: false,
  isStopping: false,
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

function CanvasEmptyState({
  isDesktopRuntime,
  onOpenProject
}: {
  readonly isDesktopRuntime: boolean
  readonly onOpenProject?: () => void
}) {
  const { t } = useI18n()

  return (
    <div className="canvas-empty">
      <span className="canvas-empty__icon" aria-hidden="true">
        <Box size={22} />
      </span>
      {isDesktopRuntime ? (
        <>
          <h2>{t('canvas.emptyTitle')}</h2>
          <p>{t('canvas.emptyDescription')}</p>
          <button className="canvas-empty__action" type="button" onClick={onOpenProject}>
            <FolderOpen size={15} aria-hidden="true" />
            {t('canvas.openProject')}
          </button>
        </>
      ) : (
        <p>{t('canvas.emptyPreview')}</p>
      )}
    </div>
  )
}

interface CanvasStatusbarProps {
  readonly isDesktopRuntime: boolean
  readonly terminalRuntimeAvailability: TerminalRuntimeAvailabilitySnapshot
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: CurrentWorkspace | undefined
}

function CanvasStatusbar({
  isDesktopRuntime,
  terminalRuntimeAvailability,
  currentWorkbench,
  currentWorkspace
}: CanvasStatusbarProps) {
  const { t } = useI18n()
  return (
    <footer className="app-shell__statusbar">
      <span
        className={`status-dot${terminalRuntimeAvailability.phase === 'ready' ? ' status-dot--running' : ''}`}
      />
      <span>
        {!isDesktopRuntime
          ? t('canvas.statusPreview')
          : terminalRuntimeAvailability.phase === 'initializing'
            ? t('canvas.statusRuntimeInitializing')
            : terminalRuntimeAvailability.phase === 'unavailable'
              ? t('canvas.statusRuntimeUnavailable')
              : currentWorkbench
                ? t('canvas.statusConnected')
                : t('canvas.statusWaiting')}
      </span>
      {currentWorkspace ? <span className="status-path">{currentWorkspace.directory}</span> : null}
    </footer>
  )
}
