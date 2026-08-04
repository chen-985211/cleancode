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
import { Star } from 'lucide-react'

import {
  defaultCanvasViewport,
  type BatchTerminalRemovalTargetSnapshot,
  maximumCanvasZoom,
  minimumCanvasZoom,
  type QuickExecutionSlotNumber,
  type QuickExecutionTargetSnapshot
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
import type { InitialWorkbenchLoadPhase } from './useInitialWorkbenchLoad'
import type { BlockTemplateSnapshot } from '../../contexts/block-graph/application/dto/BlockTemplateSnapshot'
import type { ShortcutPlatform } from './applicationShortcuts'
import { BlockTemplatePlacementPreview } from './BlockTemplatePlacementPreview'
import { useBlockTemplateCanvasInteraction } from './useBlockTemplateCanvasInteraction'
import { useCanvasObjectContextMenu } from './useCanvasObjectContextMenu'
import { QuickExecutionBar } from './QuickExecutionBar'
import { focusQuickExecutionTargetInCanvas } from './quickExecutionFocus'
import { toQuickExecutionTarget } from './quickExecutionTargets'
import { resolveCanvasObjectContextTarget } from './canvasObjectContextTarget'
import { CanvasInitialWorkbenchState, CanvasStatusbar } from './WorkbenchCanvasStates'
import { projectTerminalWorkflowBuildOntoEdges } from './terminalWorkflowBuildEdgePresentation'
import type { TerminalWorkflowBuildPresentation } from './useTerminalWorkflowBuildChoreography'
import { transitionWorkbenchViewport } from './workbenchViewportMotion'

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
  const edges = useMemo(() => [...workflowEdges, ...approvalEdges], [approvalEdges, workflowEdges])
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
  const [viewportZoom, setViewportZoom] = useState(1)
  const [canvasViewport, setCanvasViewport] = useState(defaultCanvasViewport)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const canvasSurfaceRef = useRef<HTMLDivElement | null>(null)
  const activeDraggedNodeRef = useRef<WorkbenchFlowNode | null>(null)
  const restoredGraphIdRef = useRef<string | null>(null)
  const isRestoringViewportRef = useRef(false)
  const templateInteraction = useBlockTemplateCanvasInteraction({
    graph: currentWorkbench?.graph ?? null,
    nodes,
    onCancelPlacement: onCancelBlockTemplatePlacement,
    onPlace: onPlaceBlockTemplate,
    placementTemplate,
    reactFlowInstanceRef,
    shortcutPlatform
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
  const beginTerminalGroupSelection = (): void => {
    onBeginTerminalGroupSelection()
    onFitCanvas()
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
      <div
        ref={canvasSurfaceRef}
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
          nodes={objectContextMenu.nodes}
          edges={objectContextMenu.edges}
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
          onNodeContextMenu={objectContextMenu.onNodeContextMenu}
          onPaneClick={() => {
            objectContextMenu.close()
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
              const target = resolveQuickExecutionNodeTarget(currentWorkbench?.graph ?? null, node)
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
          onMove={(_event, viewport) => {
            const canvasViewportSnapshot = toCanvasViewportSnapshot(viewport)

            setViewportZoom(canvasViewportSnapshot.zoom)
            setCanvasViewport(canvasViewportSnapshot)
          }}
          onMoveStart={(event) => {
            if (event) onViewportInteractionStart?.()
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
              <Star size={14} fill="currentColor" aria-hidden="true" />
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
    </section>
  )
}

function resolveQuickExecutionNodeTarget(
  graph: WorkbenchSnapshot['graph'] | null,
  node: WorkbenchFlowNode
): QuickExecutionTargetSnapshot | null {
  if (!graph || node.type === 'agentConsole') return null

  const contextTarget = resolveCanvasObjectContextTarget(graph, {
    nodeId: node.id,
    nodeType: node.type === 'terminalGroup' ? 'terminalGroup' : 'terminal'
  })

  return contextTarget ? toQuickExecutionTarget(contextTarget) : null
}

function resolveQuickExecutionDropTarget(
  surface: HTMLElement | null,
  event: globalThis.MouseEvent | TouchEvent
): boolean {
  const point = readClientPoint(event)
  const bar = surface?.querySelector<HTMLElement>('[data-quick-execution-bar]')
  if (!bar || !point) return false

  const rect = bar.getBoundingClientRect()
  return (
    point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  )
}

function readClientPoint(
  event: globalThis.MouseEvent | TouchEvent
): { readonly x: number; readonly y: number } | null {
  if ('clientX' in event) return { x: event.clientX, y: event.clientY }
  if (!('changedTouches' in event) || !('touches' in event)) return null

  const touch = event.changedTouches[0] ?? event.touches[0]
  return touch ? { x: touch.clientX, y: touch.clientY } : null
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
  startScope: async () => undefined,
  startTerminalCombination: async () => undefined,
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

  void transitionWorkbenchViewport(instance, {
    intent: { type: 'instant' },
    type: 'set-viewport',
    viewport
  }).finally(() => {
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
  void transitionWorkbenchViewport(instance, {
    intent: { type: 'instant' },
    type: 'set-viewport',
    viewport
  })

  if (persistViewport) {
    onViewportChange(viewport)
  }
}

function resolveCanvasDimension(value: number, fallback: number): number {
  return value > 0 ? value : fallback
}
