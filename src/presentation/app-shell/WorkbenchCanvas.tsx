import {
  Background,
  Panel,
  ReactFlow,
  type Edge,
  type Connection,
  type NodeChange,
  type NodeTypes,
  type ReactFlowInstance
} from '@xyflow/react'
import { useEffect, useMemo, useRef, useState, type MouseEvent, type MutableRefObject } from 'react'

import {
  defaultCanvasViewport,
  type BatchTerminalRemovalTargetSnapshot,
  maximumCanvasZoom,
  minimumCanvasZoom,
  type QuickExecutionSlotNumber,
  type QuickExecutionTargetSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import {
  CanvasMinimap,
  LiveCanvasMinimapViewportFrame,
  type MinimapViewportCenter
} from './CanvasMinimap'
import { isolateWorkbenchNodeDragChanges } from './isolateWorkbenchNodeDragChanges'
import { filterMinimapNodes, type MinimapNodeInteractionContextValue } from './minimapInteraction'
import type { MinimapFlowNode, WorkbenchFlowNode, WorkbenchSnapshot } from './types'
import type { useTerminalWorkflow } from './useTerminalWorkflow'
import { inactiveTerminalWorkflowController } from './inactiveTerminalWorkflowController'
import { WorkbenchToolbar } from './WorkbenchToolbar'
import { WorkbenchIcon } from './WorkbenchIcons'
import type { ApplicationShortcutTooltipLabels } from './applicationShortcutTooltips'
import { createAgentApprovalIntentEdges } from './agentApprovalPresentation'
import { projectAgentConnectionApprovalsOntoWorkflowEdges } from './agentApprovalConnectionProjection'
import type { AgentToolApprovalViewState } from './agentToolApprovalTypes'
import type { TerminalRuntimeAvailabilitySnapshot } from '../../contexts/run/application/dto/TerminalRuntimeAvailability'
import { workbenchEdgeTypes } from './workbenchNodeTypes'
import { useI18n } from './i18n/useI18n'
import {
  projectWorkbenchObjectMotionOntoEdges,
  resolveWorkbenchCanvasDetailLevel
} from './workbenchObjectMotion'
import { useWorkbenchNodes, type WorkbenchNodeStore } from './workbenchNodeStore'
import type { CreatableAgentProviderSnapshot } from '../../contexts/agent/application/dto/AgentProviderDiscoverySnapshot'
import type { InitialWorkbenchLoadPhase } from './useInitialWorkbenchLoad'
import type { BlockTemplateSnapshot } from '../../contexts/block-graph/application/dto/BlockTemplateSnapshot'
import type { ShortcutPlatform } from './applicationShortcuts'
import { BlockTemplatePlacementPreview } from './BlockTemplatePlacementPreview'
import { useBlockTemplateCanvasInteraction } from './useBlockTemplateCanvasInteraction'
import { useCanvasObjectContextMenu } from './useCanvasObjectContextMenu'
import { QuickExecutionBar } from './QuickExecutionBar'
import { focusQuickExecutionTargetInCanvas } from './quickExecutionFocus'
import { toQuickExecutionTarget } from './quickExecutionTargets'
import { CanvasInitialWorkbenchState, CanvasStatusbar } from './WorkbenchCanvasStates'
import { CanvasMenuMotionProvider } from './CanvasMenuMotionProvider'
import { useCanvasPaneContextMenu } from './useCanvasPaneContextMenu'
import { projectTerminalWorkflowBuildOntoEdges } from './terminalWorkflowBuildEdgePresentation'
import {
  isTerminalConnectionAllowedInCanvasScope,
  isTerminalConnectionEditableInCanvasScope
} from './terminalConnectionScope'
import type { TerminalWorkflowBuildPresentation } from './useTerminalWorkflowBuildChoreography'
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

type CurrentWorkspace = WorkbenchSnapshot['project']['workspaces'][number]

interface WorkbenchCanvasProps {
  readonly agentProviders?: readonly CreatableAgentProviderSnapshot[]
  readonly approvalIntents?: readonly AgentToolApprovalViewState[]
  readonly isDesktopRuntime: boolean
  readonly initialWorkbenchLoadPhase?: InitialWorkbenchLoadPhase
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
  readonly reduceVisualNoise?: boolean
  readonly terminalWorkflow?: ReturnType<typeof useTerminalWorkflow>
  readonly terminalWorkflowBuildPresentation?: TerminalWorkflowBuildPresentation | null
  readonly shortcutTooltips: Partial<ApplicationShortcutTooltipLabels> &
    Pick<
      ApplicationShortcutTooltipLabels,
      | 'createAgent'
      | 'createTerminal'
      | 'fitCanvas'
      | 'groupTerminals'
      | 'toggleMinimap'
      | 'zoomCanvasIn'
      | 'zoomCanvasOut'
    >
  readonly shortcutPlatform?: ShortcutPlatform
  readonly placementTemplate?: BlockTemplateSnapshot
  readonly onPlaceBlockTemplate?: (origin: {
    readonly x: number
    readonly y: number
  }) => Promise<void> | void
  readonly onCancelBlockTemplatePlacement?: () => void
  readonly onRequestSaveBlockTemplate?: (blockIds: readonly string[]) => void
  readonly onDeleteTerminalScope?: (
    target: BatchTerminalRemovalTargetSnapshot
  ) => Promise<void> | void
  readonly onAddQuickExecutionTarget?: (
    target: QuickExecutionTargetSnapshot
  ) => Promise<void> | void
  readonly onBindQuickExecutionSlot?: (
    number: QuickExecutionSlotNumber,
    target: QuickExecutionTargetSnapshot
  ) => Promise<void> | void
  readonly onClearQuickExecutionSlot?: (number: QuickExecutionSlotNumber) => Promise<void> | void
  readonly onReorderQuickExecutionSlots?: (
    sourceNumber: QuickExecutionSlotNumber,
    destinationNumber: QuickExecutionSlotNumber
  ) => Promise<void> | void
  readonly onQuickExecutionNodeDrop?: (
    target: QuickExecutionTargetSnapshot,
    node: WorkbenchFlowNode
  ) => Promise<void> | void
  readonly onQuickExecutionDragPreview?: () => void
  readonly isMinimapCollapsed: boolean
  readonly onToggleMinimap: () => void
  readonly onZoomCanvasIn: () => void
  readonly onZoomCanvasOut: () => void
  readonly onFitCanvas: () => void
  readonly onOpenProject?: () => void
  readonly onRetryInitialWorkbenchLoad?: () => void
  readonly onCreateTerminalBlock: (options?: {
    readonly position?: { readonly x: number; readonly y: number }
    readonly terminalGroupId?: string
  }) => void
  readonly onCreateWorkspaceAgent: (providerId?: string) => void
  readonly onOpenAgentSettings?: () => void
  readonly onSelectDefaultAgentProvider?: (providerId: string) => void
  readonly onCreateTerminalGroup: (position: { readonly x: number; readonly y: number }) => void
  readonly onBeginTerminalGroupSelection?: () => void
  readonly onCancelTerminalGroupSelection: () => void
  readonly editingTerminalGroupId?: string | null
  readonly isTerminalGroupSelectionMode: boolean
  readonly selectedTerminalGroupCandidateCount: number
  readonly canBeginTerminalGroupSelection?: boolean
  readonly canCreateTerminalGroup?: boolean
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
  readonly onViewportInteractionStart?: () => void
  readonly onMinimapNodeClick: (blockId: string) => void
  readonly getMiniMapNodeColor: (node: MinimapFlowNode) => string
  readonly getMiniMapNodeStrokeColor: (node: MinimapFlowNode) => string
  readonly getMiniMapNodeClassName: (node: MinimapFlowNode) => string
}

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
  reactFlowInstanceRef,
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
  onNodeDragStop,
  onViewportChange,
  onViewportInteractionStart,
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
  useEffect(() => {
    onViewportChangeRef.current = onViewportChange
  }, [onViewportChange])

  useEffect(() => {
    return () => unsubscribeViewportMotionRef.current?.()
  }, [])

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
          <ReactFlow<WorkbenchFlowNode, Edge>
            nodes={objectContextMenu.nodes}
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
              onNodeDragStart(event, node)
            }}
            onNodeDrag={(event, node) => {
              const target = resolveQuickExecutionNodeTarget(currentWorkbench?.graph ?? null, node)
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
                viewport,
                setCanvasViewport,
                setViewportZoom
              })
            }
            onMoveStart={(event) => {
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
                onViewportCenterCommit={(center) => moveCanvasViewportToMinimapCenter(center, true)}
                getMiniMapNodeColor={getMiniMapNodeColor}
                getMiniMapNodeStrokeColor={getMiniMapNodeStrokeColor}
                getMiniMapNodeClassName={getMiniMapNodeClassName}
              />
            </Panel>
          </ReactFlow>
          {currentWorkbench &&
          onAddQuickExecutionTarget &&
          onBindQuickExecutionSlot &&
          onClearQuickExecutionSlot &&
          onReorderQuickExecutionSlots ? (
            <QuickExecutionBar
              isExternalDropTarget={isQuickExecutionDropTarget}
              graph={currentWorkbench.graph}
              onAdd={onAddQuickExecutionTarget}
              onBind={onBindQuickExecutionSlot}
              onClear={onClearQuickExecutionSlot}
              onFocus={(target) =>
                focusQuickExecutionTargetInCanvas({
                  instance: reactFlowInstanceRef.current,
                  target
                })
              }
              onReorder={onReorderQuickExecutionSlots}
              shortcutPlatform={shortcutPlatform}
              shortcutTooltips={shortcutTooltips}
            />
          ) : null}
          {objectContextMenu.menu}
          {paneContextMenu.menu}
          {templateInteraction.templateSelection ? (
            <div
              className="block-template-selection"
              style={{
                left: templateInteraction.templateSelection.rect.x,
                top: templateInteraction.templateSelection.rect.y,
                width: templateInteraction.templateSelection.rect.width,
                height: templateInteraction.templateSelection.rect.height
              }}
            >
              <button
                type="button"
                onClick={() => {
                  onRequestSaveBlockTemplate?.(templateInteraction.templateSelection!.blockIds)
                  templateInteraction.clearSelection()
                }}
              >
                <WorkbenchIcon active role="favorite" size={14} />
                {t('templates.saveSelection')}
              </button>
            </div>
          ) : null}
          {placementTemplate && templateInteraction.placementOrigin ? (
            <BlockTemplatePlacementPreview
              origin={templateInteraction.placementOrigin}
              template={placementTemplate}
              viewport={canvasViewport}
            />
          ) : null}
          {!currentWorkbench ? (
            <CanvasInitialWorkbenchState
              isDesktopRuntime={isDesktopRuntime}
              phase={initialWorkbenchLoadPhase}
              onOpenProject={onOpenProject}
              onRetry={onRetryInitialWorkbenchLoad}
            />
          ) : null}
        </div>
        <CanvasStatusbar
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
