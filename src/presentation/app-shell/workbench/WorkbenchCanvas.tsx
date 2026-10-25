import { useWorkbenchNodeDragSession } from './nodes/useWorkbenchNodeDragSession'
import { useTerminalObjectMotionWorkload } from '../context-adapters/run/useTerminalObjectMotionWorkload'
import { defaultReduceCanvasVisualNoise } from '../app-features/settings/canvasVisualNoisePreference'
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
import { workbenchEdgeTypes } from './nodes/workbenchNodeTypes'
import { useI18n } from '../../i18n/useI18n'
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
import { isTerminalConnectionAllowedInCanvasScope } from '../../../contexts/block-graph/presentation/view-models/terminalConnectionScope'
import { useCanvasConnectionInteraction } from './useCanvasConnectionInteraction'
import { cancelWorkbenchViewportMotion } from './viewport/workbenchViewportMotion'
import { cancelWorkbenchDirectZoom } from './viewport/workbenchDirectZoom'
import { workbenchDragAutoPanSpeed } from './viewport/workbenchDragAutoPan'
import { isApplyingWorkbenchViewport } from './viewport/workbenchViewportAdapter'
import { useWorkbenchDirectZoom } from './viewport/useWorkbenchDirectZoom'
import { useWorkbenchCanvasOrganization } from './viewport/useWorkbenchCanvasOrganization'
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
import { useWorkflowCanvasDragging } from './useWorkflowCanvasDragging'
import { useWorkbenchCanvasEdges } from './useWorkbenchCanvasEdges'
import { useWorkbenchCanvasLayers } from './useWorkbenchCanvasLayers'
import type { WorkbenchCanvasProps } from './workbenchCanvasProps'
import { ignoreAppNotifications } from '../../shared/notifications/appNotifications'
import {
  createWorkbenchCanvasViewportStore,
  useWorkbenchCanvasDetailLevel
} from './viewport/workbenchCanvasViewportStore'

// Share a screen-space tolerance so small pointer movements remain clicks instead of being lost.
const nodeGestureThresholdPixels = 5

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
  reduceVisualNoise = defaultReduceCanvasVisualNoise,
  terminalWorkflow,
  terminalWorkflowBuildPresentation = null,
  shortcutTooltips,
  shortcutPlatform = 'mac',
  shortcutBindings,
  placementTemplate,
  onPlaceBlockTemplate,
  onCancelBlockTemplatePlacement,
  onRequestSaveBlockTemplate,
  isCanvasArrangementPending = false,
  onArrangeCanvasSelection,
  onOrganizeCanvas,
  onMoveCanvasStack,
  onSaveCanvasLayerOrder,
  onDeleteTerminalScope,
  onAddQuickExecutionTarget,
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
  const nodes = useWorkbenchNodes(nodeStore)
  useTerminalObjectMotionWorkload(nodes, terminalZoomRasterCoordinator)
  const minimapNodes = useMemo(() => filterMinimapNodes(nodes), [nodes])
  const workflow = terminalWorkflow ?? inactiveTerminalWorkflowController
  const edges = useWorkbenchCanvasEdges({
    approvalIntents,
    currentWorkbench,
    terminalWorkflowBuildPresentation,
    workflow,
    nodes
  })
  const layers = useWorkbenchCanvasLayers({
    currentWorkbench,
    nodes,
    edges,
    onNodeDragStart,
    onNodeDragStop,
    onCancelNodeDrag,
    onMoveCanvasStack,
    onSaveCanvasLayerOrder
  })
  const [isQuickExecutionDropTarget, setIsQuickExecutionDropTarget] = useState(false)
  const [quickExecutionContainer, setQuickExecutionContainer] = useState<HTMLDivElement | null>(
    null
  )
  const canvasArrangement = useWorkbenchCanvasArrangement({
    currentWorkbench,
    currentWorkspace,
    nodeStore,
    nodes,
    onCancelNodeDrag,
    onMoveCanvasStack: layers.onMoveCanvasStack,
    onNodeDragStart: layers.onNodeDragStart
  })
  const objectContextMenu = useCanvasObjectContextMenu({
    edges: layers.edges,
    graph: currentWorkbench?.graph ?? null,
    nodes: layers.nodes,
    onRequestSaveBlockTemplate,
    onRequestDeleteTerminalScope: onDeleteTerminalScope,
    onRequestQuickExecutionBinding: onAddQuickExecutionTarget
      ? (target) => void onAddQuickExecutionTarget(toQuickExecutionTarget(target))
      : undefined
  })
  const canvasOrganization = useWorkbenchCanvasOrganization({
    items: canvasArrangement.items,
    currentWorkbench,
    currentWorkspace,
    editingTerminalGroupId,
    isDesktopRuntime,
    isCanvasArrangementPending,
    isTerminalGroupSelectionMode,
    placementTemplate,
    shortcutBindings,
    shortcutPlatform,
    onOrganizeCanvas,
    onUserAction: onViewportInteractionStart,
    onFailure: () =>
      notifications.notify({
        kind: 'error',
        title: t('canvas.arrangement.failedTitle'),
        message: t('canvas.arrangement.failed')
      }),
    reactFlowInstanceRef
  })
  const paneContextMenu = useCanvasPaneContextMenu({
    canCreateTerminal: isDesktopRuntime && Boolean(currentWorkbench),
    canGroupTerminals: isDesktopRuntime && Boolean(currentWorkbench) && !editingTerminalGroupId,
    canOrganizeCanvas: canvasOrganization.canOrganizeCanvas,
    onOrganizeCanvas: () => {
      void canvasOrganization.organize()
    },
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
  const connectionInteraction = useCanvasConnectionInteraction({
    edges: objectContextMenu.edges,
    graph: currentWorkbench?.graph ?? null,
    editingTerminalGroupId,
    isBlocked: Boolean(placementTemplate) || isTerminalGroupSelectionMode,
    onBeforeOpen: () => {
      objectContextMenu.close()
      paneContextMenu.close()
    },
    onDeleteEdges: workflow.deleteEdges,
    onNodeClick
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
  const nodeDragSession = useWorkbenchNodeDragSession({
    instanceRef: reactFlowInstanceRef,
    nodeStore,
    surfaceRef: canvasSurfaceRef,
    onCancel: layers.onCancelNodeDrag
  })
  const activeDraggedNodeRef = nodeDragSession.activeRef
  const cancelledDragIdRef = nodeDragSession.cancelledRef
  const workflowDragging = useWorkflowCanvasDragging({
    instanceRef: reactFlowInstanceRef,
    surfaceRef: canvasSurfaceRef,
    nodeStore,
    onStart: (event, node, ids) => {
      cancelWorkbenchViewportMotion(reactFlowInstanceRef.current ?? undefined)
      cancelWorkbenchDirectZoom(reactFlowInstanceRef.current ?? undefined)
      onViewportInteractionStart?.()
      layers.onNodeDragStart(event, node, ids)
    },
    onPreview: onNodeDrag,
    onCommit: layers.onNodeDragStop,
    onViewportChange,
    onCancel: layers.onCancelNodeDrag
  })
  const restoredGraphIdRef = useRef<string | null>(null)
  const isRestoringViewportRef = useRef(false)
  const onViewportChangeRef = useRef(onViewportChange)
  const terminalZoomRasterCoordinatorRef = useRef(terminalZoomRasterCoordinator)
  const viewportMoveCompletionRef = useRef<'controller' | 'node-drag' | null>(null)
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
    onViewportInteractionStart: () => {
      canvasOrganization.cancelFocus()
      onViewportInteractionStart?.()
    },
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
    terminalZoomRasterCoordinatorRef.current = terminalZoomRasterCoordinator
  }, [onViewportChange, terminalZoomRasterCoordinator])

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
          data-reduce-visual-noise={reduceVisualNoise ? 'true' : 'false'}
          className={['canvas-surface', placementTemplate ? 'canvas-surface--placing-template' : '']
            .filter(Boolean)
            .join(' ')}
          onKeyDownCapture={(event) => {
            workflowDragging.keyDown(event)
            connectionInteraction.onKeyDown(event)
          }}
          onPointerDownCapture={(event) => {
            if (!workflowDragging.begin(event)) templateInteraction.beginSelection(event)
          }}
          onPointerMoveCapture={(event) => {
            if (!workflowDragging.preview(event)) templateInteraction.continueInteraction(event)
          }}
          onPointerUpCapture={(event) => {
            if (!workflowDragging.commit(event)) templateInteraction.completeSelection(event)
          }}
          onPointerCancelCapture={templateInteraction.cancelSelection}
          onClickCapture={(event) => {
            if (!workflowDragging.suppressClick(event))
              templateInteraction.placeFromCanvasClick(event)
          }}
          onDragStartCapture={workflowDragging.preventNativeDrag}
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
              {...connectionInteraction.flowProps}
              zIndexMode="manual"
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
              nodeTypes={nodeTypes}
              nodesDraggable={!isCanvasArrangementPending}
              nodeClickDistance={nodeGestureThresholdPixels}
              nodeDragThreshold={nodeGestureThresholdPixels}
              autoPanSpeed={workbenchDragAutoPanSpeed}
              onInit={(instance) => {
                reactFlowInstanceRef.current = instance
                setViewportMotionInstance((currentInstance) => currentInstance ?? instance)
                unsubscribeViewportMotionRef.current?.()
                unsubscribeViewportMotionRef.current = subscribeCanvasViewportMotionCompletion({
                  instance,
                  onRasterInteractionEnd: (zoom) =>
                    terminalZoomRasterCoordinatorRef.current?.endInteraction(zoom),
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
                  isolateWorkbenchNodeDragChanges(
                    nodeDragSession.projectChanges(changes),
                    activeDraggedNodeRef.current
                  )
                )
              }
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
                connectionInteraction.clearSelection()
                objectContextMenu.close()
                paneContextMenu.close()
                if (placementTemplate) return
                templateInteraction.clearSelection()
                onPaneClick()
              }}
              onNodeDragStart={(event, node) => {
                cancelledDragIdRef.current = null
                cancelWorkbenchViewportMotion(reactFlowInstanceRef.current ?? undefined)
                cancelWorkbenchDirectZoom(reactFlowInstanceRef.current ?? undefined)
                onViewportInteractionStart?.()
                setIsQuickExecutionDropTarget(false)
                if (viewportMoveCompletionRef.current === 'node-drag') {
                  viewportMoveCompletionRef.current = null
                }
                const presentedNode = nodeDragSession.begin(node)
                canvasSurfaceRef.current?.classList.add('canvas-surface--dragging-terminal')
                canvasArrangement.dragging.begin(event, presentedNode)
              }}
              onNodeDrag={(event, node) => {
                if (cancelledDragIdRef.current === node.id) return
                if (canvasArrangement.dragging.preview(nodeDragSession.projectNode(node))) return
                const target = resolveQuickExecutionNodeTarget(
                  currentWorkbench?.graph ?? null,
                  node
                )
                const isDropTarget = Boolean(
                  target && resolveQuickExecutionDropTarget(quickExecutionContainer, event)
                )
                setIsQuickExecutionDropTarget(isDropTarget)
                if (isDropTarget) {
                  onQuickExecutionDragPreview?.()
                  return
                }
                onNodeDrag(event, nodeDragSession.projectNode(node))
              }}
              onNodeDragStop={(event, node) => {
                try {
                  if (cancelledDragIdRef.current === node.id) return
                  canvasSurfaceRef.current?.classList.remove('canvas-surface--dragging-terminal')
                  if (canvasArrangement.dragging.commit(nodeDragSession.projectNode(node))) {
                    setIsQuickExecutionDropTarget(false)
                    return
                  }
                  const target = resolveQuickExecutionNodeTarget(
                    currentWorkbench?.graph ?? null,
                    node
                  )
                  const isDropTarget = Boolean(
                    target && resolveQuickExecutionDropTarget(quickExecutionContainer, event)
                  )
                  setIsQuickExecutionDropTarget(false)
                  if (isDropTarget && target && onQuickExecutionNodeDrop) {
                    layers.cancelDrag()
                    void onQuickExecutionNodeDrop(target, node)
                    return
                  }
                  void layers.onNodeDragStop(event, nodeDragSession.projectNode(node))
                } finally {
                  activeDraggedNodeRef.current = null
                  if (viewportMoveCompletionRef.current === 'node-drag') {
                    terminalZoomRasterCoordinator?.endInteraction(
                      reactFlowInstanceRef.current?.getZoom()
                    )
                  } else {
                    terminalZoomRasterCoordinator?.requestRasterAlignment()
                  }
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
                viewportMoveCompletionRef.current =
                  !event && isApplyingWorkbenchViewport(reactFlowInstanceRef.current)
                    ? 'controller'
                    : activeDraggedNodeRef.current !== null
                      ? 'node-drag'
                      : null
                terminalZoomRasterCoordinator?.beginInteraction()
                if (event) {
                  canvasOrganization.cancelFocus()
                  cancelWorkbenchViewportMotion(reactFlowInstanceRef.current ?? undefined)
                  cancelWorkbenchDirectZoom(reactFlowInstanceRef.current ?? undefined)
                  onViewportInteractionStart?.()
                }
              }}
              onMoveEnd={(event, viewport) =>
                persistCanvasViewportFromMoveEnd({
                  event,
                  isManagedViewportMove: viewportMoveCompletionRef.current !== null,
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
              <Panel className="canvas-minimap-panel" position="bottom-right">
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
              quickExecutionContainer={quickExecutionContainer}
              arrangement={canvasArrangement.arrangement}
              currentWorkbench={currentWorkbench}
              isArrangementPending={isCanvasArrangementPending}
              isQuickExecutionDropTarget={isQuickExecutionDropTarget}
              onAddQuickExecutionTarget={onAddQuickExecutionTarget}
              onArrange={onArrangeCanvasSelection}
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
          {connectionInteraction.menu}
        </div>
        <CanvasStatusbar
          quickExecutionRef={setQuickExecutionContainer}
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
