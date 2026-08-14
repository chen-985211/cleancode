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
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import {
  CanvasMinimap,
  LiveCanvasMinimapViewportFrame,
  type MinimapViewportCenter
} from './CanvasMinimap'
import { isolateWorkbenchNodeDragChanges } from './isolateWorkbenchNodeDragChanges'
import { filterMinimapNodes } from './minimapInteraction'
import type { WorkbenchFlowNode } from './types'
import { inactiveTerminalWorkflowController } from './inactiveTerminalWorkflowController'
import { WorkbenchToolbar } from './WorkbenchToolbar'
import { createAgentApprovalIntentEdges } from './agentApprovalPresentation'
import { projectAgentConnectionApprovalsOntoWorkflowEdges } from './agentApprovalConnectionProjection'
import { workbenchEdgeTypes } from './workbenchNodeTypes'
import { useI18n } from './i18n/useI18n'
import {
  projectWorkbenchObjectMotionOntoEdges,
  resolveWorkbenchCanvasDetailLevel
} from './workbenchObjectMotion'
import { useWorkbenchNodes } from './workbenchNodeStore'
import { BlockTemplatePlacementPreview } from './BlockTemplatePlacementPreview'
import { useBlockTemplateCanvasInteraction } from './useBlockTemplateCanvasInteraction'
import { projectCanvasArrangementSelectionOntoNodes } from './canvasArrangementSelection'
import { CanvasArrangementSelectionOverlay } from './CanvasArrangementOverlay'
import { useWorkbenchCanvasArrangement } from './useCanvasStackDragging'
import { useCanvasObjectContextMenu } from './useCanvasObjectContextMenu'
import { WorkbenchCanvasBottomControls } from './WorkbenchCanvasBottomControls'
import { toQuickExecutionTarget } from './quickExecutionTargets'
import { CanvasInitialWorkbenchState, CanvasStatusbar } from './WorkbenchCanvasStates'
import { CanvasMenuMotionProvider } from './CanvasMenuMotionProvider'
import { useCanvasPaneContextMenu } from './useCanvasPaneContextMenu'
import { projectTerminalWorkflowBuildOntoEdges } from './terminalWorkflowBuildEdgePresentation'
import {
  isTerminalConnectionAllowedInCanvasScope,
  isTerminalConnectionEditableInCanvasScope
} from './terminalConnectionScope'
import { cancelWorkbenchViewportMotion } from './workbenchViewportMotion'
import { cancelWorkbenchDirectZoom } from './workbenchDirectZoom'
import { useWorkbenchDirectZoom } from './useWorkbenchDirectZoom'
import {
  centerCanvasViewportOnMinimapPoint,
  persistCanvasViewportFromMoveEnd,
  restoreCanvasViewport,
  subscribeCanvasViewportMotionCompletion,
  synchronizeCanvasViewportFromMove,
  toCanvasViewportSnapshot
} from './workbenchCanvasViewport'
import {
  resolveQuickExecutionDropTarget,
  resolveQuickExecutionNodeTarget,
  resolveTerminalCreationGroupId,
  toWorkbenchFlowPosition
} from './workbenchCanvasInteractionTargets'
import { useWorkbenchCanvasViewportRestoration } from './useWorkbenchCanvasViewportRestoration'
import type { WorkbenchCanvasProps } from './workbenchCanvasProps'

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
    () => projectWorkbenchObjectMotionOntoEdges(baseEdges, nodes),
    [baseEdges, nodes]
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
  const [viewportZoom, setViewportZoom] = useState(1)
  const canvasDetailLevel = resolveWorkbenchCanvasDetailLevel(viewportZoom, reduceVisualNoise)
  const [canvasViewport, setCanvasViewport] = useState(defaultCanvasViewport)
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
      setCanvasViewport,
      setViewportZoom
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
    setCanvasViewport,
    setViewportZoom,
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
                  setCanvasViewport,
                  setViewportZoom
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
                    setViewportZoom,
                    setCanvasViewport
                  })
                  return
                }

                const viewport = instance.getViewport()

                terminalZoomRasterCoordinator?.updateCanvasZoom(viewport.zoom)
                setViewportZoom(viewport.zoom)
                setCanvasViewport(toCanvasViewportSnapshot(viewport))
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
              onMove={(event, viewport) =>
                synchronizeCanvasViewportFromMove({
                  event,
                  onRasterZoomChange: (zoom) =>
                    terminalZoomRasterCoordinator?.updateCanvasZoom(zoom),
                  viewport,
                  setCanvasViewport,
                  setViewportZoom
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
                  canvasViewport={canvasViewport}
                  canvasSize={canvasSize}
                  viewportFrame={
                    <LiveCanvasMinimapViewportFrame
                      canvasSize={canvasSize}
                      fallbackViewport={canvasViewport}
                      instance={viewportMotionInstance}
                    />
                  }
                  viewportMotionInstance={viewportMotionInstance}
                  viewportZoom={viewportZoom}
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
              <BlockTemplatePlacementPreview
                origin={templateInteraction.placementOrigin}
                template={placementTemplate}
                viewport={canvasViewport}
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
        />
      </CanvasMenuMotionProvider>
    </section>
  )
}
