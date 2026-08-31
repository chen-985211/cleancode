import '@xyflow/react/dist/style.css'
import '@xterm/xterm/css/xterm.css'
import './AppShell.css'
import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useMemo, useRef, useState } from 'react'
import type { TerminalBlockSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import * as derived from './appShellDerived'
import { ProjectSidebar } from '../../contexts/project/presentation/components/ProjectSidebar'
import { useBranchWorkspaceActions } from './useBranchWorkspaceActions'
import { useTerminalGroupActions } from './useTerminalGroupActions'
import { useTerminalGroupDragActions } from './useTerminalGroupDragActions'
import { useTerminalGroupSelectionMode } from './useTerminalGroupSelectionMode'
import { useTerminalBlockResizeAction } from './useTerminalBlockResizeAction'
import { useInitialWorkbenchLoad } from './useInitialWorkbenchLoad'
import { useMinimapNodeFocus } from './useMinimapNodeFocus'
import { useProjectGitStateSynchronization } from './useProjectGitStateSynchronization'
import { useProjectActions } from './useProjectActions'
import { useTerminalWorkspaceSynchronization } from './useTerminalWorkspaceSynchronization'
import { useTerminalMinimapAppearance } from './useTerminalMinimapAppearance'
import { useTerminalSessions } from './useTerminalSessions'
import { useTerminalServiceActions } from './useTerminalServiceActions'
import { useTerminalWorkflow } from './useTerminalWorkflow'
import { useCurrentGraphState } from './useCurrentGraphState'
import { useWorkbenchFlowNodes } from './useWorkbenchFlowNodes'
import { useWorkbenchGraphIndex } from './useWorkbenchGraphIndex'
import { useWorkbenchNodeSelection } from './useWorkbenchNodeSelection'
import { useWorkspaceAgentActions } from './useWorkspaceAgentActions'
import { useAgentToolApprovals } from './useAgentToolApprovals'
import type { WorkbenchFlowNode, WorkbenchSnapshot } from './types'
import { useI18n } from '../i18n/useI18n'
import { WorkbenchCanvas } from './WorkbenchCanvas'
import { createWorkbenchNodeLayoutCommitQueue } from './workbenchNodeLayoutCommitQueue'
import { workbenchNodeTypes } from './workbenchNodeTypes'
import { useAgentLayoutCoordination } from './useAgentLayoutCoordination'
import { ignoreAppNotifications } from '../shared/notifications/appNotifications'
import { resolveShortcutPlatform, type ShortcutPlatform } from './applicationShortcuts'
import { createApplicationShortcutTooltipLabels } from './applicationShortcutTooltips'
import { useApplicationShortcutPreference } from './useApplicationShortcutPreference'
import { useApplicationShortcuts } from './useApplicationShortcuts'
import { useApplicationShortcutNavigation } from './useApplicationShortcutNavigation'
import { useAppShellShortcutActions } from './useAppShellShortcutActions'
import { useWindowFullScreenState } from './useWindowFullScreenState'
import { useTerminalRuntimePreference } from '../../contexts/run/presentation/view-models/useTerminalRuntimePreference'
import { useTerminalWorkflowBuildPreference } from './useTerminalWorkflowBuildPreference'
import { useCanvasVisualNoisePreference } from './useCanvasVisualNoisePreference'
import { useTerminalRuntimeAvailability } from '../../contexts/run/presentation/view-models/useTerminalRuntimeAvailability'
import { toAgentFlowNodeId } from './agentConsoleFlowNode'
import { createWorkbenchNodeStore } from './workbenchNodeStore'
import { useAgentCreationProviders } from '../../contexts/agent/presentation/view-models/useAgentCreationProviders'
import { useApplicationSettingsNavigation } from './useApplicationSettingsNavigation'
import { useWorkbenchNodeCreationActions } from './useWorkbenchNodeCreationActions'
import { useBlockTemplateActions } from './useBlockTemplateActions'
import { AppShellSettings } from './AppShellSettings'
import { AppShellProviders } from './AppShellProviders'
import { useQuickExecutionActions } from './useQuickExecutionActions'
import { useAppShellBlockActions } from './useAppShellBlockActions'
import { useTerminalLaunchCommandRequest } from './useTerminalLaunchCommandRequest'
import { useAppShellNodeDragActions } from './useAppShellNodeDragActions'
import { useCanvasViewportActions } from './useCanvasViewportActions'
import { useCanvasSelectionViewport } from './useCanvasSelectionViewport'
import { ProjectSidebarToggle } from './ProjectSidebarToggle'
import { ignoreAgentActivityNavigationHandled, type AppShellProps } from './appShellTypes'
import { useAgentActivityNotificationNavigation } from './useAgentActivityNotificationNavigation'
import { useProjectSidebarVisibility } from './useProjectSidebarVisibility'
import { useProjectSidebarMotion } from './useProjectSidebarMotion'
import { projectSidebarExpandedWidth } from './projectSidebarMotion'
import { useAppShellCanvasArrangement } from './useAppShellCanvasArrangement'
import {
  useAppShellGraphViewportUpdate,
  useSingleTerminalBlockSelectionBridge,
  useWorkbenchListUpdates
} from './useAppShellWorkbenchStateAdapters'
export function AppShell({
  agentActivityNavigationRequest = null,
  notifications = ignoreAppNotifications,
  onAgentActivityNavigate,
  onAgentActivityNavigationHandled = ignoreAgentActivityNavigationHandled
}: AppShellProps = {}) {
  const isDesktopRuntime = Boolean(window.cleancode)
  const { t } = useI18n()
  const [workbenches, setWorkbenches] = useState<WorkbenchSnapshot[]>([])
  const [currentWorkbench, setCurrentWorkbench] = useState<WorkbenchSnapshot | null>(null)
  const [nodeStore] = useState(() => createWorkbenchNodeStore())
  const [selectedTerminalBlockIds, setSelectedTerminalBlockIds] = useState<string[]>([])
  const [selectedTerminalGroupId, setSelectedTerminalGroupId] = useState<string | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [hoveredTerminalBlockId, setHoveredTerminalBlockId] = useState<string | null>(null)
  const applicationSettings = useApplicationSettingsNavigation()
  const {
    isProjectSidebarCollapsed,
    projectSidebarToggleRef,
    revealProjectSidebar,
    toggleProjectSidebar
  } = useProjectSidebarVisibility()
  const [shortcutPlatform] = useState<ShortcutPlatform>(() => resolveShortcutPlatform())
  const isWindowFullScreen = useWindowFullScreenState()
  const terminalRuntimeAvailability = useTerminalRuntimeAvailability(notifications)
  const { bindings, changeBinding, resetAllBindings } = useApplicationShortcutPreference()
  const agentCreation = useAgentCreationProviders()
  const {
    changePreferredProvider,
    creatableAgentProviders,
    effectiveAgentProviderId,
    enabledCreatableAgentProviders
  } = agentCreation
  const shortcutTooltips = createApplicationShortcutTooltipLabels(bindings, shortcutPlatform, t)
  const [layoutCommitQueue] = useState(createWorkbenchNodeLayoutCommitQueue)
  const reactFlowInstanceRef = useRef<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>(null)
  const canvasSizeRef = useRef({ width: 0, height: 0 })
  const { currentWorkspace, graph, terminalBlocksById, terminalGroupsById } =
    useWorkbenchGraphIndex(currentWorkbench)
  const currentTerminalBlockIds = useMemo(() => graph?.blocks.map((block) => block.id), [graph])
  const setSelectedTerminalBlockId = useSingleTerminalBlockSelectionBridge(
    setSelectedTerminalBlockIds,
    setSelectedTerminalGroupId
  )
  const {
    beginTerminalGroupSelection,
    cancelTerminalGroupSelection,
    editingTerminalGroupId,
    isTerminalGroupSelectionMode,
    selectTerminalBlock,
    selectTerminalGroup
  } = useTerminalGroupSelectionMode({
    graph,
    selectedTerminalBlockIds,
    setSelectedTerminalBlockIds,
    setSelectedTerminalGroupId
  })
  const initialWorkbenchLoad = useInitialWorkbenchLoad({
    setCurrentWorkbench,
    setWorkbenches
  })
  const {
    cancelPendingWorkbenchInputFocus,
    focusAgentConsole,
    focusCreatedTerminalBlock,
    focusTerminalBlock,
    focusWorkbenchNode
  } = useMinimapNodeFocus({
    terminalBlocksById,
    terminalGroupsById,
    reactFlowInstanceRef,
    setSelectedAgentId,
    setHoveredTerminalBlockId,
    setSelectedTerminalBlockId,
    setSelectedTerminalBlockIds,
    setSelectedTerminalGroupId
  })
  const activateWorkbenchNodeInputFromShortcut = derived.createNodeInputActivator(
    cancelPendingWorkbenchInputFocus
  )
  const { launchCommandEditRequest, requestTerminalLaunchCommand } =
    useTerminalLaunchCommandRequest({
      currentWorkspace,
      focusTerminalBlock
    })
  const {
    dismissPortConflict,
    findTerminalBlockIdForSession,
    forgetWorkspaceTerminalStates,
    interruptTerminal,
    moveTerminalSessionToWorkspace,
    quickLaunchTerminal,
    reconcileStaleTerminalView,
    resizeTerminal,
    restartTerminal,
    runningSessionIds,
    startTerminal,
    terminalStateProjection,
    terminalSurfaceRegistry,
    terminalZoomRasterCoordinator: terminalRendering,
    terminateTerminalSession,
    toggleTerminalRetention,
    terminateWorkbenchTerminalSessions,
    terminateWorkspaceTerminalSessions,
    writeTerminal,
    writeTerminalImmediately
  } = useTerminalSessions({
    currentProject: currentWorkbench?.project,
    currentWorkspace,
    currentTerminalBlockIds,
    focusTerminalBlock,
    notify: notifications.notify,
    runtimeAvailability: terminalRuntimeAvailability
  })
  const projectSidebarMotion = useProjectSidebarMotion(isProjectSidebarCollapsed, terminalRendering)
  const { changeTerminalScrollback, terminalScrollbackRows } =
    useTerminalRuntimePreference(terminalSurfaceRegistry)
  const { changeTerminalWorkflowBuildMode, terminalWorkflowBuildMode } =
    useTerminalWorkflowBuildPreference()
  const { changeReduceVisualNoise, reduceVisualNoise } = useCanvasVisualNoisePreference()
  const minimapAppearance = useTerminalMinimapAppearance({
    terminalStates: terminalStateProjection.states,
    selectedTerminalBlockId: selectedTerminalBlockIds[0] ?? null,
    hoveredTerminalBlockId
  })
  const { rememberWorkbench, replaceWorkbench } = useWorkbenchListUpdates(
    setCurrentWorkbench,
    setWorkbenches
  )
  const setCurrentGraph = useCurrentGraphState({
    currentWorkbench,
    setCurrentWorkbench,
    setWorkbenches,
    setSelectedTerminalBlockIds,
    setSelectedTerminalGroupId,
    setHoveredTerminalBlockId
  })
  const { createTerminalBlock, nodeCreationCoordinator, reserveWorkbenchNodeCreation } =
    useWorkbenchNodeCreationActions({
      currentWorkbench,
      currentWorkspace,
      focusCreatedTerminalBlock,
      nodeStore,
      reactFlowInstanceRef,
      setCurrentGraph
    })
  const {
    createWorkspaceAgent,
    isCreatingAgent,
    moveWorkspaceAgent,
    removeWorkspaceAgent,
    renameWorkspaceAgent,
    resizeWorkspaceAgent,
    updateWorkspaceAgentMcpCapability
  } = useWorkspaceAgentActions({
    currentWorkbench,
    currentWorkspace,
    defaultProviderId: effectiveAgentProviderId,
    layoutCommitQueue,
    nodeCreationCoordinator,
    notify: notifications.notify,
    onConfigureAgentProviders: applicationSettings.openAgents,
    onWorkspaceAgentCreated: focusAgentConsole,
    reserveWorkbenchNodeCreation,
    setCurrentWorkbench,
    setSelectedAgentId,
    setWorkbenches
  })
  const canvasArrangement = useAppShellCanvasArrangement({
    currentWorkbench,
    currentWorkspace,
    moveWorkspaceAgent,
    notify: notifications.notify,
    setCurrentGraph,
    setCurrentWorkbench,
    setWorkbenches
  })
  useProjectGitStateSynchronization({ currentWorkbench, replaceWorkbench })
  useTerminalWorkspaceSynchronization({
    currentWorkbench,
    findTerminalBlockIdForSession,
    moveTerminalSessionToWorkspace,
    replaceWorkbench,
    runningSessionIds
  })
  const agentToolApprovals = useAgentToolApprovals({
    graph,
    projectDirectory: currentWorkbench?.project.directory ?? null,
    reactFlowInstanceRef,
    setCurrentGraph,
    workspaceId: currentWorkspace?.workspaceId ?? null
  })
  const terminalWorkflow = useTerminalWorkflow({
    currentWorkbench,
    currentWorkspace,
    focusWorkbenchNode,
    notifications,
    setCurrentGraph
  })
  const { start: startWorkflow, startTerminalCombination, stop: stopWorkflow } = terminalWorkflow
  const quickExecution = useQuickExecutionActions({
    currentWorkbench,
    currentWorkspace,
    notifications,
    quickLaunchTerminal,
    reactFlowInstanceRef,
    requestTerminalLaunchCommand,
    setCurrentGraph,
    startScope: terminalWorkflow.startScope,
    startTerminalCombination
  })
  const {
    copyServiceEndpoint,
    locateManagedServiceOwner,
    openServiceEndpoint,
    updateTerminalDefinition
  } = useTerminalServiceActions({
    currentWorkbench,
    currentWorkspace,
    focusTerminalBlock,
    rememberWorkbench,
    setCurrentGraph,
    workbenches
  })
  const branchWorkspaceActions = useBranchWorkspaceActions({
    currentWorkbench,
    notifications,
    replaceWorkbench,
    setHoveredTerminalBlockId,
    setSelectedTerminalBlockId,
    terminateWorkspaceTerminalSessions,
    forgetWorkspaceTerminalStates
  })
  const { addProject, isReorderingProject, removeProject, reorderProject } = useProjectActions({
    notifications,
    rememberWorkbench,
    setCurrentWorkbench,
    setHoveredTerminalBlockId,
    setSelectedTerminalBlockIds,
    setSelectedTerminalGroupId,
    setWorkbenches,
    terminateWorkbenchTerminalSessions
  })
  const blockActions = useAppShellBlockActions({
    beginTerminalGroupSelection,
    currentWorkbench,
    currentWorkspace,
    notifications,
    setCurrentGraph,
    terminateTerminalSession
  })
  const { clearTerminalGroupDropPreview, moveWorkbenchNode, previewTerminalGroupDrop } =
    useTerminalGroupDragActions({
      currentWorkbench,
      currentWorkspace,
      editingTerminalGroupId,
      getNodes: nodeStore.getNodes,
      graph,
      layoutCommitQueue,
      setCurrentGraph,
      setNodes: nodeStore.setNodes
    })
  const {
    cancelNodeDrag,
    cancelLayoutFocus,
    onAgentGraphUpdated,
    onNodeDragStart,
    onNodeDragStop,
    protectedLayoutNodeIds,
    terminalWorkflowBuildPresentation
  } = useAgentLayoutCoordination({
    clearTerminalGroupDropPreview,
    currentProjectId: currentWorkbench?.project.id ?? null,
    currentWorkspaceId: currentWorkspace?.workspaceId ?? null,
    moveWorkbenchNode,
    moveWorkspaceAgent,
    nodeStore,
    onCancelLayoutFocus: cancelPendingWorkbenchInputFocus,
    reactFlowInstanceRef,
    setCurrentGraph,
    terminalWorkflowBuildMode
  })
  const selectionViewport = useCanvasSelectionViewport({
    canvasSizeRef,
    onUserAction: cancelLayoutFocus,
    reactFlowInstanceRef
  })
  const workbenchNodeSelection = useWorkbenchNodeSelection({
    focusSelectedWorkbenchNode: selectionViewport.focusSelectedWorkbenchNode,
    isTerminalGroupSelectionMode,
    returnToGlobalCanvasView: selectionViewport.returnToGlobalCanvasView,
    selectTerminalBlock,
    selectTerminalGroup,
    selectedAgentId,
    selectedTerminalBlockIds,
    selectedTerminalGroupId,
    setNodes: nodeStore.setNodes,
    setSelectedAgentId,
    setSelectedTerminalBlockIds,
    setSelectedTerminalGroupId
  })
  const selectedWorkbenchNodeId = selectedAgentId
    ? toAgentFlowNodeId(selectedAgentId)
    : (selectedTerminalGroupId ?? selectedTerminalBlockIds[0] ?? null)
  const shortcutNavigation = useApplicationShortcutNavigation({
    activateWorkbenchNodeInput: activateWorkbenchNodeInputFromShortcut,
    canvasSizeRef,
    currentWorkbench,
    getNodes: nodeStore.getNodes,
    onSelectWorkspace: branchWorkspaceActions.selectWorkspace,
    reactFlowInstanceRef,
    revealProjectSidebar,
    selectedNodeId: selectedWorkbenchNodeId,
    selectWorkbenchNode: workbenchNodeSelection.selectWorkbenchNodeFromShortcut,
    workbenches
  })
  const { selectTerminalFromTitle } = workbenchNodeSelection
  const { fitCanvas, zoomCanvasIn, zoomCanvasOut } = useCanvasViewportActions({
    onUserAction: cancelLayoutFocus,
    reactFlowInstanceRef
  })
  const minimapNodeInteraction = derived.useMinimapNodeInteraction(
    currentWorkbench?.agents,
    setHoveredTerminalBlockId,
    terminalBlocksById,
    terminalGroupsById
  )
  const resizeTerminalBlock = useTerminalBlockResizeAction({
    currentWorkbench,
    currentWorkspace,
    layoutCommitQueue,
    setCurrentGraph
  })
  const terminalGroupActions = useTerminalGroupActions({
    currentWorkbench,
    currentWorkspace,
    interruptTerminal,
    onEditGroup: beginTerminalGroupSelection,
    restartTerminal,
    setCurrentGraph,
    setSelectedTerminalGroupId,
    startTerminalCombination,
    terminalBlocksById
  })
  const updateGraphViewport = useAppShellGraphViewportUpdate(
    currentWorkbench,
    currentWorkspace,
    setCurrentGraph
  )
  const terminalFlowNodeHandlers = useMemo(
    () => ({
      onStart: startTerminal,
      onStop: interruptTerminal,
      onQuickLaunch: quickLaunchTerminal,
      onRestart: restartTerminal,
      onToggleRetention: toggleTerminalRetention,
      onDelete: blockActions.deleteTerminalBlock,
      onUpdateDefinition: updateTerminalDefinition,
      onCopyServiceEndpoint: copyServiceEndpoint,
      onOpenServiceEndpoint: openServiceEndpoint,
      onLocateManagedServiceOwner: locateManagedServiceOwner,
      onDismissPortConflict: dismissPortConflict,
      onRunFromHere: (block: TerminalBlockSnapshot) => startWorkflow(block.id),
      onStopWorkflow: stopWorkflow,
      onViewIdentityStale: reconcileStaleTerminalView,
      onInput: writeTerminal,
      onPaste: writeTerminalImmediately,
      onResize: resizeTerminal,
      onResizeBlock: resizeTerminalBlock,
      onSelect: (block: TerminalBlockSnapshot) => selectTerminalFromTitle(block.id),
      onToggleTerminalGroupCandidate: (block: TerminalBlockSnapshot) =>
        selectTerminalBlock(block.id, true),
      ...terminalGroupActions
    }),
    [
      blockActions.deleteTerminalBlock,
      copyServiceEndpoint,
      dismissPortConflict,
      interruptTerminal,
      quickLaunchTerminal,
      reconcileStaleTerminalView,
      resizeTerminal,
      resizeTerminalBlock,
      restartTerminal,
      toggleTerminalRetention,
      locateManagedServiceOwner,
      openServiceEndpoint,
      selectTerminalFromTitle,
      selectTerminalBlock,
      startTerminal,
      terminalGroupActions,
      startWorkflow,
      stopWorkflow,
      updateTerminalDefinition,
      writeTerminal,
      writeTerminalImmediately
    ]
  )
  useWorkbenchFlowNodes({
    agentToolApprovals,
    canvasArrangementMotion: canvasArrangement.motionChoreography,
    currentWorkbench,
    currentWorkspace,
    graph,
    handlers: terminalFlowNodeHandlers,
    hoveredTerminalBlockId,
    selectedAgentId,
    editingTerminalGroupId,
    isTerminalGroupSelectionMode,
    selectedTerminalBlockIds,
    selectedTerminalGroupId,
    protectedLayoutNodeIds,
    terminalWorkflowBuildPresentation,
    onAgentGraphUpdated,
    setNodes: nodeStore.setNodes,
    terminalStateStore: terminalStateProjection.store,
    activeWorkflowRunIdByRootBlockId: terminalWorkflow.activeRunIdByRootBlockId,
    stoppingWorkflowRunIds: terminalWorkflow.stoppingRunIds,
    launchCommandEditRequest:
      launchCommandEditRequest?.workspaceId === currentWorkspace?.workspaceId
        ? launchCommandEditRequest
        : null,
    workflowNodeStatuses: terminalWorkflow.nodeStatuses,
    onRemoveAgent: removeWorkspaceAgent,
    onMcpCapabilityChange: updateWorkspaceAgentMcpCapability,
    onRenameAgent: renameWorkspaceAgent,
    onResizeAgent: resizeWorkspaceAgent,
    onSelectAgent: workbenchNodeSelection.selectAgentFromTitle
  })
  useAgentActivityNotificationNavigation({
    currentWorkbench,
    focusWorkbenchNode,
    nodeStore,
    onHandled: onAgentActivityNavigationHandled,
    reactFlowInstanceRef,
    request: agentActivityNavigationRequest,
    selectWorkspace: branchWorkspaceActions.selectWorkspaceWithResult,
    workbenches
  })
  const blockTemplates = useBlockTemplateActions({
    currentWorkbench,
    currentWorkspace,
    nodeStore,
    notifications,
    protectedNodeIds: protectedLayoutNodeIds,
    reactFlowInstanceRef,
    setCurrentGraph,
    terminalWorkflow
  })
  const hasMultipleWorkspaces = derived.hasMultipleWorkspaces(workbenches)
  const applicationShortcutActions = useAppShellShortcutActions({
    addProject,
    createAgent: createWorkspaceAgent,
    createBranchWorkspace: shortcutNavigation.requestBranchWorkspaceCreation,
    createTerminal: createTerminalBlock,
    executeQuickExecutionSlot: quickExecution.executeSlot,
    fitCanvas,
    groupTerminals: () =>
      derived.createGroupAtWindowCenter(
        reactFlowInstanceRef.current,
        blockActions.createTerminalGroup
      ),
    hasMultipleWorkspaces,
    hasWorkbench: Boolean(currentWorkbench),
    isDesktopRuntime,
    isGroupSelectionMode: isTerminalGroupSelectionMode,
    isSettingsOpen: applicationSettings.isOpen,
    navigateWorkspace: shortcutNavigation.navigateWorkspace,
    openSettings: applicationSettings.open,
    selectCanvasNode: shortcutNavigation.selectCanvasNode,
    toggleMinimap: shortcutNavigation.toggleMinimap,
    toggleSidebar: toggleProjectSidebar,
    zoomCanvasIn,
    zoomCanvasOut
  })
  useApplicationShortcuts({
    actions: applicationShortcutActions,
    bindings,
    platform: shortcutPlatform
  })
  const { bindQuickExecutionFromNodeDrop, commitWorkbenchNodeDrag } = useAppShellNodeDragActions({
    addQuickExecutionTarget: quickExecution.addTarget,
    cancelNodeDrag,
    graph,
    layoutSaveFailedMessage: t('canvas.layoutSaveFailed'),
    layoutSaveFailedTitle: t('canvas.layoutSaveFailedTitle'),
    nodeStore,
    notify: notifications.notify,
    onNodeDragStop
  })
  return (
    <AppShellProviders {...{ notifications, onAgentActivityNavigate, terminalSurfaceRegistry }}>
      <>
        <main
          className={[
            'app-shell',
            shortcutPlatform === 'mac' ? 'app-shell--mac' : '',
            isWindowFullScreen ? 'app-shell--window-full-screen' : '',
            isProjectSidebarCollapsed ? 'app-shell--sidebar-collapsed' : ''
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label={t('app.workspace')}
        >
          <AppShellSettings
            agentCreation={agentCreation}
            applicationSettings={applicationSettings}
            bindings={bindings}
            blockTemplates={blockTemplates}
            changeBinding={changeBinding}
            changeFollowQuickExecutionTarget={quickExecution.changeFollowQuickExecutionTarget}
            changeReduceVisualNoise={changeReduceVisualNoise}
            changeTerminalScrollback={changeTerminalScrollback}
            changeTerminalWorkflowBuildMode={changeTerminalWorkflowBuildMode}
            currentWorkbench={currentWorkbench}
            followQuickExecutionTarget={quickExecution.followQuickExecutionTarget}
            isDesktopRuntime={isDesktopRuntime}
            resetAllBindings={resetAllBindings}
            reduceVisualNoise={reduceVisualNoise}
            shortcutPlatform={shortcutPlatform}
            terminalScrollbackRows={terminalScrollbackRows}
            terminalWorkflowBuildMode={terminalWorkflowBuildMode}
          />
          <div className="project-sidebar-column">
            <ProjectSidebarToggle
              buttonRef={projectSidebarToggleRef}
              isCollapsed={isProjectSidebarCollapsed}
              motionSurfaceRef={projectSidebarMotion.titlebarRef}
              shortcutTooltip={shortcutTooltips.toggleSidebar}
              onToggle={toggleProjectSidebar}
            />
            <ProjectSidebar
              workbenches={workbenches}
              currentWorkbench={currentWorkbench}
              isCollapsed={isProjectSidebarCollapsed}
              isDesktopRuntime={isDesktopRuntime}
              motionSurfaceRef={projectSidebarMotion.sidebarRef}
              intent={shortcutNavigation.projectSidebarIntent}
              shortcutTooltips={shortcutTooltips}
              isReorderPending={isReorderingProject}
              onAddProject={addProject}
              onArchiveBranchWorkspace={branchWorkspaceActions.archiveBranchWorkspace}
              onCheckoutMainBranch={branchWorkspaceActions.checkoutMainBranch}
              onCreateBranchWorkspace={branchWorkspaceActions.createBranchWorkspace}
              onRemoveProject={removeProject}
              onReorderProject={reorderProject}
              onSelectWorkspace={branchWorkspaceActions.selectWorkspace}
            />
          </div>
          <WorkbenchCanvas
            approvalIntents={agentToolApprovals.approvals}
            agentProviders={enabledCreatableAgentProviders}
            defaultAgentProviderId={effectiveAgentProviderId}
            isDesktopRuntime={isDesktopRuntime}
            initialWorkbenchLoadPhase={initialWorkbenchLoad.phase}
            isCreatingAgent={isCreatingAgent}
            isAgentProviderDiscoveryPending={creatableAgentProviders.state.status === 'loading'}
            terminalRuntimeAvailability={terminalRuntimeAvailability}
            currentWorkbench={currentWorkbench}
            currentWorkspace={currentWorkspace}
            notifications={notifications}
            nodeStore={nodeStore}
            nodeTypes={workbenchNodeTypes}
            canvasSizeRef={canvasSizeRef}
            canvasLeftInset={isProjectSidebarCollapsed ? 0 : projectSidebarExpandedWidth}
            centerMotionRef={projectSidebarMotion.centerRef}
            reactFlowInstanceRef={reactFlowInstanceRef}
            spatialMotionRef={projectSidebarMotion.spatialRef}
            statusbarMotionRef={projectSidebarMotion.statusbarRef}
            minimapNodeInteraction={minimapNodeInteraction}
            reduceVisualNoise={reduceVisualNoise}
            terminalWorkflow={terminalWorkflow}
            terminalWorkflowBuildPresentation={terminalWorkflowBuildPresentation}
            shortcutTooltips={shortcutTooltips}
            shortcutPlatform={shortcutPlatform}
            placementTemplate={blockTemplates.placementTemplate}
            onCancelBlockTemplatePlacement={blockTemplates.cancelPlacement}
            onPlaceBlockTemplate={blockTemplates.place}
            onRequestSaveBlockTemplate={blockTemplates.requestSave}
            isCanvasArrangementPending={canvasArrangement.isPending}
            onArrangeCanvasSelection={canvasArrangement.arrange}
            onMoveCanvasStack={canvasArrangement.moveStack}
            onDeleteTerminalScope={blockActions.deleteTerminalScope}
            onAddQuickExecutionTarget={quickExecution.addTarget}
            onBindQuickExecutionSlot={quickExecution.bindSlot}
            onClearQuickExecutionSlot={quickExecution.clearSlot}
            onReorderQuickExecutionSlots={quickExecution.reorderSlots}
            onQuickExecutionNodeDrop={bindQuickExecutionFromNodeDrop}
            onQuickExecutionDragPreview={clearTerminalGroupDropPreview}
            isMinimapCollapsed={shortcutNavigation.isMinimapCollapsed}
            onToggleMinimap={shortcutNavigation.toggleMinimap}
            onZoomCanvasIn={zoomCanvasIn}
            onZoomCanvasOut={zoomCanvasOut}
            onFitCanvas={fitCanvas}
            onOpenProject={addProject}
            onRetryInitialWorkbenchLoad={initialWorkbenchLoad.retry}
            onCreateTerminalBlock={createTerminalBlock}
            onCreateWorkspaceAgent={createWorkspaceAgent}
            onOpenAgentSettings={applicationSettings.openAgents}
            onSelectDefaultAgentProvider={changePreferredProvider}
            onCreateTerminalGroup={blockActions.createTerminalGroup}
            onCancelTerminalGroupSelection={cancelTerminalGroupSelection}
            isTerminalGroupSelectionMode={isTerminalGroupSelectionMode}
            editingTerminalGroupId={editingTerminalGroupId}
            selectedTerminalGroupCandidateCount={
              graph?.terminalGroups.find((group) => group.id === editingTerminalGroupId)
                ?.memberBlockIds.length ?? 0
            }
            onNodesChange={workbenchNodeSelection.onNodesChange}
            onNodeClick={workbenchNodeSelection.selectWorkbenchNode}
            onPaneClick={workbenchNodeSelection.clearWorkbenchSelection}
            onNodeDrag={previewTerminalGroupDrop}
            onNodeDragStart={onNodeDragStart}
            onCancelNodeDrag={cancelNodeDrag}
            onNodeDragStop={commitWorkbenchNodeDrag}
            onViewportChange={updateGraphViewport}
            onViewportInteractionStart={cancelLayoutFocus}
            terminalZoomRasterCoordinator={terminalRendering}
            onMinimapNodeClick={focusWorkbenchNode}
            getMiniMapNodeColor={minimapAppearance.getMiniMapNodeColor}
            getMiniMapNodeStrokeColor={minimapAppearance.getMiniMapNodeStrokeColor}
            getMiniMapNodeClassName={minimapAppearance.getMiniMapNodeClassName}
          />
        </main>
      </>
    </AppShellProviders>
  )
}
