import '@xyflow/react/dist/style.css'
import '@xterm/xterm/css/xterm.css'
import './AppShell.css'
import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useCallback, useMemo, useRef, useState, type SetStateAction } from 'react'

import type { TerminalBlockSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { createMinimapNodeInteraction } from './minimapInteraction'
import { ProjectSidebar } from './ProjectSidebar'
import { updateGraphViewportInWorkbench } from './updateGraphViewportInWorkbench'
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
import { useI18n } from './i18n/useI18n'
import { TerminalSurfaceRegistryProvider } from './TerminalSurfaceRegistryProvider'
import { WorkbenchCanvas } from './WorkbenchCanvas'
import { createWorkbenchNodeLayoutCommitQueue } from './workbenchNodeLayoutCommitQueue'
import { workbenchNodeTypes } from './workbenchNodeTypes'
import { putWorkbenchFirst } from './workbenchListUpdates'
import { useAgentLayoutCoordination } from './useAgentLayoutCoordination'
import { ignoreAppNotifications, type AppNotificationController } from './appNotifications'
import { AgentProviderStateProvider } from './AgentProviderStateProvider'
import { resolveShortcutPlatform, type ShortcutPlatform } from './applicationShortcuts'
import { createApplicationShortcutTooltipLabels } from './applicationShortcutTooltips'
import { useApplicationShortcutPreference } from './useApplicationShortcutPreference'
import { useApplicationShortcuts } from './useApplicationShortcuts'
import { useApplicationShortcutNavigation } from './useApplicationShortcutNavigation'
import { useAppShellShortcutActions } from './useAppShellShortcutActions'
import { useWindowFullScreenState } from './useWindowFullScreenState'
import { useTerminalRuntimePreference } from './useTerminalRuntimePreference'
import { useTerminalWorkflowBuildPreference } from './useTerminalWorkflowBuildPreference'
import { useCanvasVisualNoisePreference } from './useCanvasVisualNoisePreference'
import { useTerminalRuntimeAvailability } from './useTerminalRuntimeAvailability'
import { toAgentFlowNodeId } from './agentConsoleFlowNode'
import { createWorkbenchNodeStore } from './workbenchNodeStore'
import { activateWorkbenchNodeInput } from './workbenchNodeInputActivation'
import { useAgentCreationProviders } from './useAgentCreationProviders'
import { useApplicationSettingsNavigation } from './useApplicationSettingsNavigation'
import { useWorkbenchNodeCreationActions } from './useWorkbenchNodeCreationActions'
import { useBlockTemplateActions } from './useBlockTemplateActions'
import { AppShellSettings } from './AppShellSettings'
import { useQuickExecutionActions } from './useQuickExecutionActions'
import { useAppShellBlockActions } from './useAppShellBlockActions'
import { useTerminalLaunchCommandRequest } from './useTerminalLaunchCommandRequest'
import { useAppShellNodeDragActions } from './useAppShellNodeDragActions'
import { useCanvasViewportActions } from './useCanvasViewportActions'
import { useCanvasSelectionViewport } from './useCanvasSelectionViewport'
import { ProjectSidebarToggle } from './ProjectSidebarToggle'

type AppShellProps = { readonly notifications?: AppNotificationController }
export function AppShell({ notifications = ignoreAppNotifications }: AppShellProps = {}) {
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
  const [isProjectSidebarCollapsed, setIsProjectSidebarCollapsed] = useState(false)
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
  const projectSidebarToggleRef = useRef<HTMLButtonElement | null>(null)
  const toggleProjectSidebar = useCallback((): void => {
    if (!isProjectSidebarCollapsed && document.activeElement?.closest('#project-sidebar')) {
      projectSidebarToggleRef.current?.focus()
    }
    setIsProjectSidebarCollapsed((collapsed) => !collapsed)
  }, [isProjectSidebarCollapsed])
  const revealProjectSidebar = useCallback((): void => setIsProjectSidebarCollapsed(false), [])
  const { currentWorkspace, graph, terminalBlocksById, terminalGroupsById } =
    useWorkbenchGraphIndex(currentWorkbench)
  const currentTerminalBlockIds = useMemo(() => graph?.blocks.map((block) => block.id), [graph])
  const setSelectedTerminalBlockId = useCallback((value: SetStateAction<string | null>) => {
    if (value === null) {
      setSelectedTerminalGroupId(null)
    }
    setSelectedTerminalBlockIds((currentIds) => {
      const currentId = currentIds[0] ?? null
      const nextId = typeof value === 'function' ? value(currentId) : value
      return nextId ? [nextId] : []
    })
  }, [])
  const {
    beginTerminalGroupSelection,
    canCreateTerminalGroup,
    cancelTerminalGroupSelection,
    completeTerminalGroupSelection,
    isTerminalGroupSelectionMode,
    selectTerminalBlock,
    selectTerminalGroup,
    selectedUngroupedTerminalBlockIds
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
  const activateWorkbenchNodeInputFromShortcut = useCallback(
    (node: WorkbenchFlowNode): void => {
      cancelPendingWorkbenchInputFocus()
      activateWorkbenchNodeInput(node)
    },
    [cancelPendingWorkbenchInputFocus]
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
    terminalStates,
    terminalSurfaceRegistry,
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
  const { changeTerminalScrollback, terminalScrollbackRows } =
    useTerminalRuntimePreference(terminalSurfaceRegistry)
  const { changeTerminalWorkflowBuildMode, terminalWorkflowBuildMode } =
    useTerminalWorkflowBuildPreference()
  const { changeReduceVisualNoise, reduceVisualNoise } = useCanvasVisualNoisePreference()
  const minimapAppearance = useTerminalMinimapAppearance({
    terminalStates,
    selectedTerminalBlockId: selectedTerminalBlockIds[0] ?? null,
    hoveredTerminalBlockId
  })
  const rememberWorkbench = useCallback((workbench: WorkbenchSnapshot): void => {
    setWorkbenches((entries) => putWorkbenchFirst(entries, workbench))
    setCurrentWorkbench(workbench)
  }, [])
  const replaceWorkbench = useCallback((workbench: WorkbenchSnapshot): void => {
    setWorkbenches((entries) =>
      entries.map((entry) => (entry.project.id === workbench.project.id ? workbench : entry))
    )
    setCurrentWorkbench(workbench)
  }, [])
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
    notifications,
    setCurrentGraph
  })
  const { start: startWorkflow, startTerminalCombination, stop: stopWorkflow } = terminalWorkflow
  const quickExecution = useQuickExecutionActions({
    currentWorkbench,
    currentWorkspace,
    notifications,
    quickLaunchTerminal,
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
    replaceWorkbench,
    setHoveredTerminalBlockId,
    setSelectedTerminalBlockId,
    terminateWorkspaceTerminalSessions,
    forgetWorkspaceTerminalStates
  })

  const {
    addProject,
    dismissProjectActionError,
    isReorderingProject,
    projectActionError,
    removeProject,
    reorderProject
  } = useProjectActions({
    rememberWorkbench,
    setCurrentWorkbench,
    setHoveredTerminalBlockId,
    setSelectedTerminalBlockIds,
    setSelectedTerminalGroupId,
    setWorkbenches,
    terminateWorkbenchTerminalSessions
  })
  const blockActions = useAppShellBlockActions({
    canCreateTerminalGroup,
    completeTerminalGroupSelection,
    currentWorkbench,
    currentWorkspace,
    defaultGroupName: t('group.defaultName'),
    firstGroupName: t('group.defaultFirstName'),
    notifications,
    selectedUngroupedTerminalBlockIds,
    setCurrentGraph,
    setSelectedTerminalGroupId,
    terminateTerminalSession
  })
  const { clearTerminalGroupDropPreview, moveWorkbenchNode, previewTerminalGroupDrop } =
    useTerminalGroupDragActions({
      currentWorkbench,
      currentWorkspace,
      getNodes: nodeStore.getNodes,
      graph,
      isTerminalGroupSelectionMode,
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
  const minimapNodeInteraction = useMemo(
    () =>
      createMinimapNodeInteraction({
        agents: currentWorkbench?.agents,
        setHoveredBlockId: setHoveredTerminalBlockId,
        terminalBlocksById,
        terminalGroupsById
      }),
    [currentWorkbench?.agents, terminalBlocksById, terminalGroupsById]
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
    restartTerminal,
    selectedTerminalBlockIds,
    selectedUngroupedTerminalBlockIds,
    setCurrentGraph,
    setSelectedTerminalBlockIds,
    setSelectedTerminalGroupId,
    startTerminalCombination,
    terminalBlocksById
  })
  const updateGraphViewport = useCallback(
    (viewport: WorkbenchSnapshot['graph']['viewport']) =>
      updateGraphViewportInWorkbench({
        currentWorkbench,
        currentWorkspace,
        viewport,
        setCurrentGraph
      }),
    [currentWorkbench, currentWorkspace, setCurrentGraph]
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
      onSelect: (block: TerminalBlockSnapshot, additive: boolean) =>
        selectTerminalFromTitle(block.id, additive),
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
    currentWorkbench,
    currentWorkspace,
    graph,
    handlers: terminalFlowNodeHandlers,
    hoveredTerminalBlockId,
    selectedAgentId,
    isTerminalGroupSelectionMode,
    selectedTerminalBlockIds,
    selectedTerminalGroupId,
    selectedUngroupedTerminalBlockIds,
    protectedLayoutNodeIds,
    terminalWorkflowBuildPresentation,
    onAgentGraphUpdated,
    setNodes: nodeStore.setNodes,
    terminalStates,
    activeWorkflowRootBlockIds: terminalWorkflow.activeRootBlockIds,
    isStoppingWorkflow: terminalWorkflow.isStopping,
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
  const hasMultipleWorkspaces =
    workbenches.reduce((count, workbench) => count + workbench.project.workspaces.length, 0) > 1
  const applicationShortcutActions = useAppShellShortcutActions({
    addProject,
    createAgent: createWorkspaceAgent,
    createBranchWorkspace: shortcutNavigation.requestBranchWorkspaceCreation,
    createTerminal: createTerminalBlock,
    executeQuickExecutionSlot: quickExecution.executeSlot,
    fitCanvas,
    groupTerminals: beginTerminalGroupSelection,
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
    <AgentProviderStateProvider>
      <TerminalSurfaceRegistryProvider registry={terminalSurfaceRegistry}>
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
            changeReduceVisualNoise={changeReduceVisualNoise}
            changeTerminalScrollback={changeTerminalScrollback}
            changeTerminalWorkflowBuildMode={changeTerminalWorkflowBuildMode}
            currentWorkbench={currentWorkbench}
            currentWorkspace={currentWorkspace}
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
              shortcutTooltip={shortcutTooltips.toggleSidebar}
              onToggle={toggleProjectSidebar}
            />
            <ProjectSidebar
              workbenches={workbenches}
              currentWorkbench={currentWorkbench}
              isCollapsed={isProjectSidebarCollapsed}
              isDesktopRuntime={isDesktopRuntime}
              intent={shortcutNavigation.projectSidebarIntent}
              shortcutTooltips={shortcutTooltips}
              actionError={projectActionError ?? branchWorkspaceActions.branchWorkspaceActionError}
              isReorderPending={isReorderingProject}
              onAddProject={addProject}
              onArchiveBranchWorkspace={branchWorkspaceActions.archiveBranchWorkspace}
              onCheckoutMainBranch={branchWorkspaceActions.checkoutMainBranch}
              onCreateBranchWorkspace={branchWorkspaceActions.createBranchWorkspace}
              onDismissActionError={() => {
                dismissProjectActionError()
                branchWorkspaceActions.dismissBranchWorkspaceActionError()
              }}
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
            nodeStore={nodeStore}
            nodeTypes={workbenchNodeTypes}
            canvasSizeRef={canvasSizeRef}
            reactFlowInstanceRef={reactFlowInstanceRef}
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
            onBeginTerminalGroupSelection={beginTerminalGroupSelection}
            onCreateTerminalGroup={blockActions.createTerminalGroup}
            onCancelTerminalGroupSelection={cancelTerminalGroupSelection}
            isTerminalGroupSelectionMode={isTerminalGroupSelectionMode}
            selectedTerminalGroupCandidateCount={selectedUngroupedTerminalBlockIds.length}
            canBeginTerminalGroupSelection={Boolean(currentWorkbench)}
            canCreateTerminalGroup={canCreateTerminalGroup}
            onNodesChange={workbenchNodeSelection.onNodesChange}
            onNodeClick={workbenchNodeSelection.selectWorkbenchNode}
            onPaneClick={workbenchNodeSelection.clearWorkbenchSelection}
            onNodeDrag={previewTerminalGroupDrop}
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={commitWorkbenchNodeDrag}
            onViewportChange={updateGraphViewport}
            onViewportInteractionStart={cancelLayoutFocus}
            onMinimapNodeClick={focusWorkbenchNode}
            getMiniMapNodeColor={minimapAppearance.getMiniMapNodeColor}
            getMiniMapNodeStrokeColor={minimapAppearance.getMiniMapNodeStrokeColor}
            getMiniMapNodeClassName={minimapAppearance.getMiniMapNodeClassName}
          />
        </main>
      </TerminalSurfaceRegistryProvider>
    </AgentProviderStateProvider>
  )
}
