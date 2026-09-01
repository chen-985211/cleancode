import {
  Background,
  Panel,
  ReactFlow,
  type Edge,
  type Connection,
  type ReactFlowInstance
} from '@xyflow/react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import {
  defaultCanvasViewport,
  maximumCanvasZoom,
  minimumCanvasZoom
} from '../../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { CanvasMinimap, type MinimapViewportCenter } from './minimap/CanvasMinimap'
import { isolateWorkbenchNodeDragChanges } from './nodes/isolateWorkbenchNodeDragChanges'
import { filterMinimapNodes } from './minimap/minimapInteraction'
import type { WorkbenchFlowNode } from '../types/workbenchFlowNode'
import { inactiveTerminalWorkflowController } from '../coordinators/inactiveTerminalWorkflowController'
import { WorkbenchToolbar } from './toolbar/WorkbenchToolbar'
import { createAgentApprovalIntentEdges } from '../projections/agentApprovalPresentation'
import { projectAgentConnectionApprovalsOntoWorkflowEdges } from '../projections/agentApprovalConnectionProjection'
import { workbenchEdgeTypes } from './nodes/workbenchNodeTypes'
import { useI18n } from '../../i18n/useI18n'
import { createWorkbenchObjectMotionEdgeProjector } from '../projections/workbenchObjectMotion'
import { useWorkbenchNodes } from './nodes/workbenchNodeStore'
import { LiveBlockTemplatePlacementPreview } from './creation/LiveBlockTemplatePlacementPreview'
import { useBlockTemplateCanvasInteraction } from './creation/useBlockTemplateCanvasInteraction'
import { CanvasArrangementSelectionOverlay } from '../../../contexts/canvas-arrangement/presentation/components/CanvasArrangementOverlay'
import { projectCanvasArrangementSelectionOntoNodes } from '../projections/workbenchCanvasArrangementSelection'
import { useWorkbenchCanvasArrangement } from '../context-adapters/canvas-arrangement/useWorkbenchCanvasArrangement'
import { useCanvasObjectContextMenu } from './menus/useCanvasObjectContextMenu'
import { WorkbenchCanvasBottomControls } from './WorkbenchCanvasBottomControls'
import { toQuickExecutionTarget } from '../../../contexts/block-graph/presentation/view-models/quickExecutionProjection'
import { CanvasInitialWorkbenchState, CanvasStatusbar } from './WorkbenchCanvasStates'
import { CanvasMenuMotionProvider } from './menus/CanvasMenuMotionProvider'
import { useCanvasPaneContextMenu } from './menus/useCanvasPaneContextMenu'
import { projectTerminalWorkflowBuildOntoEdges } from '../projections/terminalWorkflowBuildEdgePresentation'
import {
  isTerminalConnectionAllowedInCanvasScope,
  isTerminalConnectionEditableInCanvasScope
} from '../../../contexts/block-graph/presentation/view-models/terminalConnectionScope'
import { cancelWorkbenchViewportMotion } from './viewport/workbenchViewportMotion'
import { cancelWorkbenchDirectZoom } from './viewport/workbenchDirectZoom'
import { useWorkbenchDirectZoom } from './viewport/useWorkbenchDirectZoom'
import {
  centerCanvasViewportOnMinimapPoint,
  persistCanvasViewportFromMoveEnd,
  restoreCanvasViewport,
  subscribeCanvasViewportMotionCompletion,
  synchronizeCanvasViewportFromMove
} from './viewport/workbenchCanvasViewport'
import {
  resolveQuickExecutionDropTarget,
  resolveQuickExecutionNodeTarget,
  resolveTerminalCreationGroupId,
  toWorkbenchFlowPosition
} from './workbenchCanvasInteractionTargets'
import { useWorkbenchCanvasViewportRestoration } from './viewport/useWorkbenchCanvasViewportRestoration'
import type { WorkbenchCanvasProps } from './workbenchCanvasProps'
import { ignoreAppNotifications } from '../../shared/notifications/appNotifications'
import {
  createWorkbenchCanvasViewportStore,
  useWorkbenchCanvasDetailLevel
} from './viewport/workbenchCanvasViewportStore'

export function WorkbenchCanvas({
  approvalIntents = [],
  agentProviders = [],
  isDesktopRuntime,
  initialWorkbenchLoadPhase = 'ready',
  isCreatingAgent = false,
  isAgentProviderDiscoveryPending = false,
  defaultAgentProviderId = null,
  terminalRuntimeAvailability,
  currentWorkbench,
  currentWorkspace,
  notifications = ignoreAppNotifications,
  nodeStore,
  nodeTypes,
  canvasSizeRef,
  canvasLeftInset = 0,
  centerMotionRef,
  reactFlowInstanceRef,
  spatialMotionRef,
  statusbarMotionRef,
  minimapNodeInteraction,
  reduceVisualNoise = true,
  terminalWorkflow,
  terminalWorkflowBuildPresentation = null,
  shortcutTooltips,
  shortcutPlatform = 'mac',
  placementTemplate,
  onPlaceBlockTemplate,
  onCancelBlockTemplatePlacement,
  onRequestSaveBlockTemplate,
  isCanvasArrangementPending = false,
  onArrangeCanvasSelection,
  onMoveCanvasStack,
  onDeleteTerminalScope,
  onAddQuickExecutionTarget,
  onBindQuickExecutionSlot,
  onClearQuickExecutionSlot,
  onReorderQuickExecutionSlots,
  onQuickExecutionNodeDrop,
  onQuickExecutionDragPreview,
  isMinimapCollapsed,
  onToggleMinimap,
  onZoomCanvasIn,
  onZoomCanvasOut,
  onFitCanvas,
  onOpenProject,
  onRetryInitialWorkbenchLoad,
  onCreateTerminalBlock,
  onCreateWorkspaceAgent,
  onOpenAgentSettings,
  onSelectDefaultAgentProvider,
  onCreateTerminalGroup,
  onCancelTerminalGroupSelection,
  editingTerminalGroupId = null,
  isTerminalGroupSelectionMode,
  selectedTerminalGroupCandidateCount,
  onNodesChange,
  onNodeClick,
  onPaneClick,
  onNodeDrag,
  onNodeDragStart,
  onCancelNodeDrag,
  onNodeDragStop,
  onViewportChange,
  onViewportInteractionStart,
  terminalZoomRasterCoordinator,
  onMinimapNodeClick,
  getMiniMapNodeColor,
  getMiniMapNodeStrokeColor,
  getMiniMapNodeClassName
}: WorkbenchCanvasProps) {
  const { t } = useI18n()
  const motionEdgeProjectorRef = useRef<ReturnType<
    typeof createWorkbenchObjectMotionEdgeProjector
  > | null>(null)
  const motionEdgeProjector = (motionEdgeProjectorRef.current ??=
    createWorkbenchObjectMotionEdgeProjector())
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
        projectTerminalWorkflowBuildOntoEdges(workflow.edges, terminalWorkflowBuildPresentation),
        approvalIntents,
        currentWorkbench?.graph ?? null
      ),
    [approvalIntents, currentWorkbench?.graph, terminalWorkflowBuildPresentation, workflow.edges]
  )
  const baseEdges = useMemo(
    () => [...workflowEdges, ...approvalEdges],
    [approvalEdges, workflowEdges]
  )
  const edges = useMemo(
    () => motionEdgeProjector.project(baseEdges, nodes),
    [baseEdges, motionEdgeProjector, nodes]
  )
  const [isQuickExecutionDropTarget, setIsQuickExecutionDropTarget] = useState(false)
  const canvasArrangement = useWorkbenchCanvasArrangement({
    currentWorkbench,
    currentWorkspace,
    nodeStore,
    nodes,
    onCancelNodeDrag,
    onMoveCanvasStack,
    onNodeDragStart
  })
  const objectContextMenu = useCanvasObjectContextMenu({
    edges,
    graph: currentWorkbench?.graph ?? null,
    nodes,
    onRequestSaveBlockTemplate,
    onRequestDeleteTerminalScope: onDeleteTerminalScope,
    onRequestQuickExecutionBinding: onAddQuickExecutionTarget
      ? (target) => void onAddQuickExecutionTarget(toQuickExecutionTarget(target))
      : undefined
  })
  const paneContextMenu = useCanvasPaneContextMenu({
    canCreateTerminal: isDesktopRuntime && Boolean(currentWorkbench),
    canGroupTerminals: isDesktopRuntime && Boolean(currentWorkbench) && !editingTerminalGroupId,
    graphId: currentWorkbench?.graph.id ?? null,
    isBlocked: Boolean(placementTemplate),
    shortcutTooltips,
    onBeforeOpen: objectContextMenu.close,
    onCreateTerminal: (screenPosition) => {
      const position = toWorkbenchFlowPosition(reactFlowInstanceRef.current, screenPosition)
      onCreateTerminalBlock({
        position,
        terminalGroupId: resolveTerminalCreationGroupId(
          currentWorkbench?.graph ?? null,
          editingTerminalGroupId,
          position
        )
      })
    },
    onCreateTerminalGroup: (screenPosition) => {
      onCreateTerminalGroup(toWorkbenchFlowPosition(reactFlowInstanceRef.current, screenPosition))
    }
  })
  const [viewportStore] = useState(() =>
    createWorkbenchCanvasViewportStore(currentWorkbench?.graph.viewport ?? defaultCanvasViewport)
  )
  const canvasDetailLevel = useWorkbenchCanvasDetailLevel(viewportStore, reduceVisualNoise)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const [viewportMotionInstance, setViewportMotionInstance] = useState<ReactFlowInstance<
    WorkbenchFlowNode,
    Edge
  > | null>(null)
  const canvasSurfaceRef = useRef<HTMLDivElement | null>(null)
  const activeDraggedNodeRef = useRef<WorkbenchFlowNode | null>(null)
  const restoredGraphIdRef = useRef<string | null>(null)
  const isRestoringViewportRef = useRef(false)
  const onViewportChangeRef = useRef(onViewportChange)
  const unsubscribeViewportMotionRef = useRef<(() => void) | null>(null)
  const templateInteraction = useBlockTemplateCanvasInteraction({
    arrangement: canvasArrangement.arrangement,
    graph: currentWorkbench?.graph ?? null,
    nodes,
    onCancelPlacement: onCancelBlockTemplatePlacement,
    onPlace: onPlaceBlockTemplate,
    placementTemplate,
    reactFlowInstanceRef,
    shortcutPlatform
  })
  useWorkbenchDirectZoom({
    canvasSurfaceRef,
    onViewportInteractionStart,
    reactFlowInstanceRef,
    viewportMotionInstance
  })
  const moveCanvasViewportToMinimapCenter = (
    center: MinimapViewportCenter,
    persistViewport: boolean
  ): void => {
    const instance = reactFlowInstanceRef.current

    if (!instance) return

    centerCanvasViewportOnMinimapPoint({
      center,
      canvasSize,
      instance,
      persistViewport,
      onViewportChange,
      projectCanvasViewport: viewportStore.setViewport
    })
  }
  useEffect(() => {
    onViewportChangeRef.current = onViewportChange
  }, [onViewportChange])

  useEffect(() => {
    return () => unsubscribeViewportMotionRef.current?.()
  }, [])

  useEffect(() => {
    const canvasSurface = canvasSurfaceRef.current

    if (!canvasSurface) return undefined

    const updateCanvasSize = (): void => {
      const nextCanvasSize = {
        width: Math.max(0, canvasSurface.clientWidth - canvasLeftInset),
        height: canvasSurface.clientHeight
      }
      setCanvasSize((currentCanvasSize) =>
        currentCanvasSize.width === nextCanvasSize.width &&
        currentCanvasSize.height === nextCanvasSize.height
          ? currentCanvasSize
          : nextCanvasSize
      )
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
  }, [canvasLeftInset, canvasSizeRef])

  useWorkbenchCanvasViewportRestoration({
    currentWorkbench,
    isRestoringViewportRef,
    reactFlowInstanceRef,
    restoredGraphIdRef,
    projectCanvasViewport: viewportStore.setViewport,
    terminalZoomRasterCoordinator
  })

  return (
    <section
      className="app-shell__workspace"
      aria-label={t('canvas.label')}
      style={{ '--cc-canvas-sidebar-inset': `${canvasLeftInset}px` } as CSSProperties}
    >
      <CanvasMenuMotionProvider resetKey={currentWorkbench?.graph.id ?? null}>
        <div
          ref={canvasSurfaceRef}
          tabIndex={-1}
          data-canvas-detail={canvasDetailLevel}
          className={['canvas-surface', placementTemplate ? 'canvas-surface--placing-template' : '']
            .filter(Boolean)
            .join(' ')}
          onPointerDownCapture={templateInteraction.beginSelection}
          onPointerMoveCapture={templateInteraction.continueInteraction}
          onPointerUpCapture={templateInteraction.completeSelection}
          onPointerCancelCapture={templateInteraction.cancelSelection}
          onClickCapture={templateInteraction.placeFromCanvasClick}
        >
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
            onCreateWorkspaceAgent={onCreateWorkspaceAgent}
            onOpenAgentSettings={onOpenAgentSettings}
            onSelectDefaultAgentProvider={onSelectDefaultAgentProvider}
            onCancelTerminalGroupSelection={onCancelTerminalGroupSelection}
          />
          <div ref={spatialMotionRef} className="workbench-canvas__spatial-motion-surface">
            <ReactFlow<WorkbenchFlowNode, Edge>
              nodes={projectCanvasArrangementSelectionOntoNodes(
                objectContextMenu.nodes,
                templateInteraction.canvasSelection?.items ?? [],
                canvasArrangement.arrangement
              )}
              edges={objectContextMenu.edges}
              edgeTypes={workbenchEdgeTypes}
              isValidConnection={(connection: Connection | Edge) =>
                isTerminalConnectionAllowedInCanvasScope(
                  currentWorkbench?.graph ?? null,
                  connection.source,
                  connection.target,
                  editingTerminalGroupId
                )
              }
              onConnect={(connection) => void workflow.connect(connection)}
              onEdgesDelete={(edges) =>
                void workflow.deleteEdges(
                  edges.filter(
                    (edge) =>
                      !edge.id.startsWith('approval:') &&
                      isTerminalConnectionEditableInCanvasScope(
                        currentWorkbench?.graph ?? null,
                        edge.source,
                        edge.target,
                        editingTerminalGroupId
                      )
                  )
                )
              }
              nodeTypes={nodeTypes}
              nodesDraggable={!isCanvasArrangementPending}
              onInit={(instance) => {
                reactFlowInstanceRef.current = instance
                setViewportMotionInstance((currentInstance) => currentInstance ?? instance)
                unsubscribeViewportMotionRef.current?.()
                unsubscribeViewportMotionRef.current = subscribeCanvasViewportMotionCompletion({
                  instance,
                  onViewportChangeRef,
                  projectCanvasViewport: viewportStore.setViewport
                })

                if (currentWorkbench) {
                  terminalZoomRasterCoordinator?.updateCanvasZoom(
                    currentWorkbench.graph.viewport.zoom
                  )
                  restoreCanvasViewport({
                    instance,
                    viewport: currentWorkbench.graph.viewport,
                    graphId: currentWorkbench.graph.id,
                    restoredGraphIdRef,
                    isRestoringViewportRef,
                    projectCanvasViewport: viewportStore.setViewport
                  })
                  return
                }

                const viewport = instance.getViewport()

                terminalZoomRasterCoordinator?.updateCanvasZoom(viewport.zoom)
                viewportStore.setViewport(viewport)
              }}
              onNodesChange={(changes) =>
                onNodesChange(
                  isolateWorkbenchNodeDragChanges(changes, activeDraggedNodeRef.current)
                )
              }
              onNodeClick={onNodeClick}
              onNodeContextMenu={(event, node) => {
                if (node.type === 'terminalGroup' && node.id === editingTerminalGroupId) {
                  objectContextMenu.close()
                  paneContextMenu.open(event)
                  return
                }
                paneContextMenu.close()
                objectContextMenu.onNodeContextMenu(event, node)
              }}
              onPaneContextMenu={paneContextMenu.open}
              onPaneClick={() => {
                objectContextMenu.close()
                paneContextMenu.close()
                if (placementTemplate) return
                templateInteraction.clearSelection()
                onPaneClick()
              }}
              onNodeDragStart={(event, node) => {
                setIsQuickExecutionDropTarget(false)
                activeDraggedNodeRef.current = node
                canvasSurfaceRef.current?.classList.add('canvas-surface--dragging-terminal')
                canvasArrangement.dragging.begin(event, node)
              }}
              onNodeDrag={(event, node) => {
                if (canvasArrangement.dragging.preview(node)) return
                const target = resolveQuickExecutionNodeTarget(
                  currentWorkbench?.graph ?? null,
                  node
                )
                const isDropTarget = Boolean(
                  target && resolveQuickExecutionDropTarget(canvasSurfaceRef.current, event)
                )
                setIsQuickExecutionDropTarget(isDropTarget)
                if (isDropTarget) {
                  onQuickExecutionDragPreview?.()
                  return
                }
                onNodeDrag(event, node)
              }}
              onNodeDragStop={(event, node) => {
                try {
                  canvasSurfaceRef.current?.classList.remove('canvas-surface--dragging-terminal')
                  if (canvasArrangement.dragging.commit(node)) {
                    setIsQuickExecutionDropTarget(false)
                    return
                  }
                  const target = resolveQuickExecutionNodeTarget(
                    currentWorkbench?.graph ?? null,
                    node
                  )
                  const isDropTarget = Boolean(
                    target && resolveQuickExecutionDropTarget(canvasSurfaceRef.current, event)
                  )
                  setIsQuickExecutionDropTarget(false)
                  if (isDropTarget && target && onQuickExecutionNodeDrop) {
                    void onQuickExecutionNodeDrop(target, node)
                    return
                  }
                  onNodeDragStop(event, node)
                } finally {
                  activeDraggedNodeRef.current = null
                }
              }}
              onMove={(_event, viewport) =>
                synchronizeCanvasViewportFromMove({
                  onRasterZoomChange: (zoom) =>
                    terminalZoomRasterCoordinator?.updateCanvasZoom(zoom),
                  viewport,
                  projectCanvasViewport: viewportStore.setViewport
                })
              }
              onMoveStart={(event) => {
                terminalZoomRasterCoordinator?.beginInteraction()
                if (event) {
                  cancelWorkbenchViewportMotion(reactFlowInstanceRef.current ?? undefined)
                  cancelWorkbenchDirectZoom(reactFlowInstanceRef.current ?? undefined)
                  onViewportInteractionStart?.()
                }
              }}
              onMoveEnd={(event, viewport) =>
                persistCanvasViewportFromMoveEnd({
                  event,
                  isRestoringViewport: isRestoringViewportRef.current,
                  onRasterInteractionEnd: (zoom) =>
                    terminalZoomRasterCoordinator?.endInteraction(zoom),
                  onViewportChange,
                  viewport
                })
              }
              defaultViewport={currentWorkbench?.graph.viewport ?? defaultCanvasViewport}
              multiSelectionKeyCode={null}
              selectionKeyCode={null}
              minZoom={minimumCanvasZoom}
              maxZoom={maximumCanvasZoom}
              zoomOnScroll={false}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="var(--cc-border-strong)" gap={24} size={1} />
              <Panel className="canvas-minimap-panel" position="top-left">
                <CanvasMinimap
                  isCollapsed={isMinimapCollapsed}
                  nodes={minimapNodes}
                  canvasSize={canvasSize}
                  viewportStore={viewportStore}
                  shortcutTooltips={shortcutTooltips}
                  minimapNodeInteraction={minimapNodeInteraction}
                  onToggleCollapsed={onToggleMinimap}
                  onZoomOut={onZoomCanvasOut}
                  onZoomIn={onZoomCanvasIn}
                  onFitCanvas={onFitCanvas}
                  onMinimapNodeClick={onMinimapNodeClick}
                  onViewportCenterPreview={(center) =>
                    moveCanvasViewportToMinimapCenter(center, false)
                  }
                  onViewportCenterCommit={(center) =>
                    moveCanvasViewportToMinimapCenter(center, true)
                  }
                  getMiniMapNodeColor={getMiniMapNodeColor}
                  getMiniMapNodeStrokeColor={getMiniMapNodeStrokeColor}
                  getMiniMapNodeClassName={getMiniMapNodeClassName}
                />
              </Panel>
            </ReactFlow>
            {placementTemplate && templateInteraction.placementOrigin ? (
              <LiveBlockTemplatePlacementPreview
                origin={templateInteraction.placementOrigin}
                template={placementTemplate}
                viewportStore={viewportStore}
              />
            ) : null}
            <CanvasArrangementSelectionOverlay selection={templateInteraction.canvasSelection} />
          </div>
          <div ref={centerMotionRef} className="workbench-canvas__center-motion-surface">
            <WorkbenchCanvasBottomControls
              arrangement={canvasArrangement.arrangement}
              currentWorkbench={currentWorkbench}
              isArrangementPending={isCanvasArrangementPending}
              isQuickExecutionDropTarget={isQuickExecutionDropTarget}
              onAddQuickExecutionTarget={onAddQuickExecutionTarget}
              onArrange={onArrangeCanvasSelection}
              onBindQuickExecutionSlot={onBindQuickExecutionSlot}
              onClearQuickExecutionSlot={onClearQuickExecutionSlot}
              onReorderQuickExecutionSlots={onReorderQuickExecutionSlots}
              reactFlowInstanceRef={reactFlowInstanceRef}
              selection={templateInteraction.canvasSelection}
              shortcutPlatform={shortcutPlatform}
              shortcutTooltips={shortcutTooltips}
              showArrangementSelection={false}
            />
            {!currentWorkbench ? (
              <CanvasInitialWorkbenchState
                isDesktopRuntime={isDesktopRuntime}
                phase={initialWorkbenchLoadPhase}
                onOpenProject={onOpenProject}
                onRetry={onRetryInitialWorkbenchLoad}
              />
            ) : null}
          </div>
          {objectContextMenu.menu}
          {paneContextMenu.menu}
        </div>
        <CanvasStatusbar
          motionRef={statusbarMotionRef}
          isDesktopRuntime={isDesktopRuntime}
          terminalRuntimeAvailability={terminalRuntimeAvailability}
          initialWorkbenchLoadPhase={initialWorkbenchLoadPhase}
          currentWorkbench={currentWorkbench}
          currentWorkspace={currentWorkspace}
          notifications={notifications}
        />
      </CanvasMenuMotionProvider>
    </section>
  )
}
