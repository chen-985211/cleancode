import '@xyflow/react/dist/style.css'
import '@xterm/xterm/css/xterm.css'
import './AppShell.css'
import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { PanelLeft } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react'

import type { TerminalBlockSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { createMinimapNodeInteraction } from './minimapInteraction'
import { ProjectSidebar } from './ProjectSidebar'
import { resolveNewTerminalBlockPosition } from './terminalBlockPlacement'
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
import { ThemeSettingsRoot } from './ThemeSettingsRoot'
import { TooltipLabel } from './Tooltip'
import { LanguageSettingsRoot } from './LanguageSettingsRoot'
import { useI18n } from './i18n/useI18n'
import { TerminalSurfaceRegistryProvider } from './TerminalSurfaceRegistryProvider'
import { WorkbenchCanvas } from './WorkbenchCanvas'
import { createWorkbenchNodeLayoutCommitQueue } from './workbenchNodeLayoutCommitQueue'
import { workbenchNodeTypes } from './workbenchNodeTypes'
import { putWorkbenchFirst } from './workbenchListUpdates'
import { useAgentLayoutCoordination } from './useAgentLayoutCoordination'
import { ignoreAppNotifications, type AppNotificationController } from './appNotifications'
import { CodexCliStateProvider } from './CodexCliStateProvider'
import { AgentTerminalEventProvider } from './AgentTerminalEventProvider'
import { createAgentTerminalEventStore } from './agentTerminalEventState'
import { ApplicationSettingsRoot } from './ApplicationSettingsRoot'
import { resolveShortcutPlatform, type ShortcutPlatform } from './applicationShortcuts'
import { createApplicationShortcutTooltipLabels } from './applicationShortcutTooltips'
import { useApplicationShortcutPreference } from './useApplicationShortcutPreference'
import { useApplicationShortcuts } from './useApplicationShortcuts'
import { useApplicationShortcutNavigation } from './useApplicationShortcutNavigation'
import { useAppShellShortcutActions } from './useAppShellShortcutActions'
import { useWindowFullScreenState } from './useWindowFullScreenState'
import { useTerminalRuntimePreference } from './useTerminalRuntimePreference'
import { useTerminalRuntimeAvailability } from './useTerminalRuntimeAvailability'
import { toAgentFlowNodeId } from './agentConsoleFlowNode'
import { createWorkbenchNodeStore } from './workbenchNodeStore'

export function AppShell({
  notifications = ignoreAppNotifications
}: { readonly notifications?: AppNotificationController } = {}) {
  const isDesktopRuntime = Boolean(window.cleancode)
  const { t } = useI18n()
  const [workbenches, setWorkbenches] = useState<WorkbenchSnapshot[]>([])
  const [currentWorkbench, setCurrentWorkbench] = useState<WorkbenchSnapshot | null>(null)
  const [nodeStore] = useState(() => createWorkbenchNodeStore())
  const [selectedTerminalBlockIds, setSelectedTerminalBlockIds] = useState<string[]>([])
  const [selectedTerminalGroupId, setSelectedTerminalGroupId] = useState<string | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [hoveredTerminalBlockId, setHoveredTerminalBlockId] = useState<string | null>(null)
  const [isApplicationSettingsOpen, setIsApplicationSettingsOpen] = useState(false)
  const [isProjectSidebarCollapsed, setIsProjectSidebarCollapsed] = useState(false)
  const [shortcutPlatform] = useState<ShortcutPlatform>(() => resolveShortcutPlatform())
  const isWindowFullScreen = useWindowFullScreenState()
  const terminalRuntimeAvailability = useTerminalRuntimeAvailability(notifications)
  const { bindings, changeBinding, resetAllBindings } = useApplicationShortcutPreference()
  const shortcutTooltips = createApplicationShortcutTooltipLabels(bindings, shortcutPlatform, t)
  const [layoutCommitQueue] = useState(createWorkbenchNodeLayoutCommitQueue)
  const [agentTerminalEvents] = useState(createAgentTerminalEventStore)
  const reactFlowInstanceRef = useRef<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>(null)
  const canvasSizeRef = useRef({ width: 0, height: 0 })
  const zoomCanvasIn = useCallback((): void => {
    void reactFlowInstanceRef.current?.zoomIn({ duration: 160 })
  }, [])
  const zoomCanvasOut = useCallback((): void => {
    void reactFlowInstanceRef.current?.zoomOut({ duration: 160 })
  }, [])
  const fitCanvas = useCallback((): void => {
    void reactFlowInstanceRef.current?.fitView({ padding: 0.22, duration: 180 })
  }, [])
  const projectSidebarToggleRef = useRef<HTMLButtonElement | null>(null)
  const toggleProjectSidebar = useCallback((): void => {
    if (!isProjectSidebarCollapsed && document.activeElement?.closest('#project-sidebar')) {
      projectSidebarToggleRef.current?.focus()
    }

    setIsProjectSidebarCollapsed((collapsed) => !collapsed)
  }, [isProjectSidebarCollapsed])
  const revealProjectSidebar = useCallback((): void => setIsProjectSidebarCollapsed(false), [])
  const openApplicationSettings = useCallback((): void => setIsApplicationSettingsOpen(true), [])
  useEffect(
    () => () => agentTerminalEvents.surfaceRegistry.disposeAll(),
    [agentTerminalEvents.surfaceRegistry]
  )
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
  useInitialWorkbenchLoad({ setCurrentWorkbench, setWorkbenches })

  const { focusAgentConsole, focusTerminalBlock, focusWorkbenchNode } = useMinimapNodeFocus({
    terminalBlocksById,
    terminalGroupsById,
    reactFlowInstanceRef,
    setSelectedAgentId,
    setHoveredTerminalBlockId,
    setSelectedTerminalBlockId,
    setSelectedTerminalBlockIds,
    setSelectedTerminalGroupId
  })
  const {
    dismissPortConflict,
    findTerminalBlockIdForSession,
    forgetWorkspaceTerminalStates,
    interruptTerminal,
    moveTerminalSessionToWorkspace,
    quickLaunchTerminal,
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
  const {
    createWorkspaceAgent,
    moveWorkspaceAgent,
    removeWorkspaceAgent,
    renameWorkspaceAgent,
    resizeWorkspaceAgent,
    updateWorkspaceAgentMcpCapability
  } = useWorkspaceAgentActions({
    agentTerminalSurfaceRegistry: agentTerminalEvents.surfaceRegistry,
    currentWorkbench,
    currentWorkspace,
    layoutCommitQueue,
    onWorkspaceAgentCreated: focusAgentConsole,
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
  const setCurrentGraph = useCurrentGraphState({
    currentWorkbench,
    setCurrentWorkbench,
    setWorkbenches,
    setSelectedTerminalBlockIds,
    setSelectedTerminalGroupId,
    setHoveredTerminalBlockId
  })
  const agentToolApprovals = useAgentToolApprovals({
    graph,
    projectDirectory: currentWorkbench?.project.directory ?? null,
    reactFlowInstanceRef,
    setCurrentGraph,
    workspaceName: currentWorkspace?.name ?? null
  })
  const terminalWorkflow = useTerminalWorkflow({
    currentWorkbench,
    currentWorkspace,
    notifications,
    setCurrentGraph
  })
  const { start: startWorkflow, stop: stopWorkflow } = terminalWorkflow
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
    agentTerminalSurfaceRegistry: agentTerminalEvents.surfaceRegistry,
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
    agentTerminalSurfaceRegistry: agentTerminalEvents.surfaceRegistry,
    rememberWorkbench,
    setCurrentWorkbench,
    setHoveredTerminalBlockId,
    setSelectedTerminalBlockIds,
    setSelectedTerminalGroupId,
    setWorkbenches,
    terminateWorkbenchTerminalSessions
  })
  const createTerminalBlock = useCallback(async () => {
    if (!currentWorkbench || !currentWorkspace) {
      return
    }

    const existingBlockIds = new Set(currentWorkbench.graph.blocks.map((block) => block.id))
    const graphSnapshot = await window.cleancode?.createTerminalBlock({
      projectDirectory: currentWorkbench.project.directory,
      workspaceName: currentWorkspace.name,
      name: t('terminal.defaultName', { index: currentWorkbench.graph.blocks.length + 1 }),
      description: t('terminal.defaultDescription'),
      position: resolveNewTerminalBlockPosition(currentWorkbench.graph.blocks)
    })

    if (graphSnapshot) {
      setCurrentGraph(graphSnapshot)
      const createdBlock = graphSnapshot.blocks.find((block) => !existingBlockIds.has(block.id))

      if (createdBlock) {
        focusTerminalBlock(createdBlock.id, 220, createdBlock)
      }
    }
  }, [currentWorkbench, currentWorkspace, focusTerminalBlock, setCurrentGraph, t])

  const createTerminalGroup = useCallback(async () => {
    if (!currentWorkbench || !currentWorkspace || selectedUngroupedTerminalBlockIds.length < 2) {
      return
    }

    const existingGroupIds = new Set(currentWorkbench.graph.terminalGroups.map((group) => group.id))
    const graphSnapshot = await window.cleancode?.createTerminalGroup({
      projectDirectory: currentWorkbench.project.directory,
      workspaceName: currentWorkspace.name,
      name:
        currentWorkbench.graph.terminalGroups.length === 0
          ? t('group.defaultFirstName')
          : t('group.defaultName'),
      memberBlockIds: selectedUngroupedTerminalBlockIds
    })

    if (graphSnapshot) {
      setCurrentGraph(graphSnapshot)
      completeTerminalGroupSelection()
      setSelectedTerminalGroupId(
        graphSnapshot.terminalGroups.find((group) => !existingGroupIds.has(group.id))?.id ?? null
      )
    }
  }, [
    currentWorkbench,
    currentWorkspace,
    completeTerminalGroupSelection,
    selectedUngroupedTerminalBlockIds,
    setCurrentGraph,
    t
  ])

  const workbenchNodeSelection = useWorkbenchNodeSelection({
    isTerminalGroupSelectionMode,
    selectTerminalBlock,
    selectTerminalGroup,
    setNodes: nodeStore.setNodes,
    setSelectedAgentId,
    setSelectedTerminalBlockIds,
    setSelectedTerminalGroupId
  })
  const selectedWorkbenchNodeId = selectedAgentId
    ? toAgentFlowNodeId(selectedAgentId)
    : (selectedTerminalGroupId ?? selectedTerminalBlockIds[0] ?? null)
  const shortcutNavigation = useApplicationShortcutNavigation({
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
  const { onAgentGraphUpdated, onNodeDragStart, onNodeDragStop, protectedLayoutNodeIds } =
    useAgentLayoutCoordination({
      clearTerminalGroupDropPreview,
      currentProjectId: currentWorkbench?.project.id ?? null,
      currentWorkspaceName: currentWorkspace?.name ?? null,
      moveWorkbenchNode,
      moveWorkspaceAgent,
      nodeStore,
      reactFlowInstanceRef,
      setCurrentGraph
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

  const deleteTerminalBlock = useCallback(
    async (block: TerminalBlockSnapshot) => {
      if (!currentWorkbench || !currentWorkspace) {
        return
      }

      await terminateTerminalSession(block)

      const graphSnapshot = await window.cleancode?.deleteBlock({
        projectDirectory: currentWorkbench.project.directory,
        workspaceName: currentWorkspace.name,
        blockId: block.id
      })

      if (graphSnapshot) {
        setCurrentGraph(graphSnapshot)
      }
    },
    [currentWorkbench, currentWorkspace, setCurrentGraph, terminateTerminalSession]
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
    quickLaunchTerminal,
    restartTerminal,
    selectedTerminalBlockIds,
    selectedUngroupedTerminalBlockIds,
    setCurrentGraph,
    setSelectedTerminalBlockIds,
    setSelectedTerminalGroupId,
    startTerminal,
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
      onDelete: deleteTerminalBlock,
      onUpdateDefinition: updateTerminalDefinition,
      onCopyServiceEndpoint: copyServiceEndpoint,
      onOpenServiceEndpoint: openServiceEndpoint,
      onLocateManagedServiceOwner: locateManagedServiceOwner,
      onDismissPortConflict: dismissPortConflict,
      onRunFromHere: (block: TerminalBlockSnapshot) => startWorkflow(block.id),
      onStopWorkflow: stopWorkflow,
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
      deleteTerminalBlock,
      copyServiceEndpoint,
      dismissPortConflict,
      interruptTerminal,
      quickLaunchTerminal,
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
    onAgentGraphUpdated,
    setNodes: nodeStore.setNodes,
    terminalStates,
    activeWorkflowRootBlockIds: terminalWorkflow.activeRootBlockIds,
    isStoppingWorkflow: terminalWorkflow.isStopping,
    workflowNodeStatuses: terminalWorkflow.nodeStatuses,
    onRemoveAgent: removeWorkspaceAgent,
    onMcpCapabilityChange: updateWorkspaceAgentMcpCapability,
    onRenameAgent: renameWorkspaceAgent,
    onResizeAgent: resizeWorkspaceAgent,
    onSelectAgent: workbenchNodeSelection.selectAgentFromTitle
  })
  const hasMultipleWorkspaces =
    workbenches.reduce((count, workbench) => count + workbench.project.workspaces.length, 0) > 1
  const applicationShortcutActions = useAppShellShortcutActions({
    addProject,
    createAgent: createWorkspaceAgent,
    createBranchWorkspace: shortcutNavigation.requestBranchWorkspaceCreation,
    createTerminal: createTerminalBlock,
    fitCanvas,
    groupTerminals: beginTerminalGroupSelection,
    hasMultipleWorkspaces,
    hasWorkbench: Boolean(currentWorkbench),
    isDesktopRuntime,
    isGroupSelectionMode: isTerminalGroupSelectionMode,
    isSettingsOpen: isApplicationSettingsOpen,
    navigateWorkspace: shortcutNavigation.navigateWorkspace,
    openSettings: openApplicationSettings,
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
  const commitWorkbenchNodeDrag = useCallback(
    (event: globalThis.MouseEvent | TouchEvent, node: WorkbenchFlowNode): void => {
      void onNodeDragStop(event, node).catch(() => {
        notifications.notify({
          kind: 'error',
          message: t('canvas.layoutSaveFailed'),
          title: t('canvas.layoutSaveFailedTitle')
        })
      })
    },
    [notifications, onNodeDragStop, t]
  )
  return (
    <CodexCliStateProvider>
      <AgentTerminalEventProvider store={agentTerminalEvents}>
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
            <div className="app-shell__settings" role="group" aria-label={t('app.settings')}>
              <LanguageSettingsRoot />
              <ThemeSettingsRoot />
              <ApplicationSettingsRoot
                bindings={bindings}
                isOpen={isApplicationSettingsOpen}
                platform={shortcutPlatform}
                onBindingChange={changeBinding}
                onClose={() => setIsApplicationSettingsOpen(false)}
                onOpen={() => setIsApplicationSettingsOpen(true)}
                onResetAll={resetAllBindings}
                terminalScrollbackRows={terminalScrollbackRows}
                onTerminalScrollbackChange={changeTerminalScrollback}
              />
            </div>
            <div className="project-sidebar-column">
              <nav
                className="app-shell__titlebar-navigation"
                aria-label={t('app.windowNavigation')}
              >
                <span className="app-shell__titlebar-traffic-light-pad" aria-hidden="true" />
                <TooltipLabel content={shortcutTooltips.toggleSidebar} side="bottom">
                  <button
                    ref={projectSidebarToggleRef}
                    className="project-sidebar-toggle"
                    type="button"
                    aria-controls="project-sidebar"
                    aria-expanded={!isProjectSidebarCollapsed}
                    aria-label={t(
                      isProjectSidebarCollapsed ? 'sidebar.expand' : 'sidebar.collapse'
                    )}
                    onClick={toggleProjectSidebar}
                  >
                    <PanelLeft size={16} aria-hidden="true" />
                  </button>
                </TooltipLabel>
              </nav>
              <ProjectSidebar
                workbenches={workbenches}
                currentWorkbench={currentWorkbench}
                isCollapsed={isProjectSidebarCollapsed}
                isDesktopRuntime={isDesktopRuntime}
                intent={shortcutNavigation.projectSidebarIntent}
                shortcutTooltips={shortcutTooltips}
                actionError={
                  projectActionError ?? branchWorkspaceActions.branchWorkspaceActionError
                }
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
              isDesktopRuntime={isDesktopRuntime}
              terminalRuntimeAvailability={terminalRuntimeAvailability}
              currentWorkbench={currentWorkbench}
              currentWorkspace={currentWorkspace}
              nodeStore={nodeStore}
              nodeTypes={workbenchNodeTypes}
              canvasSizeRef={canvasSizeRef}
              reactFlowInstanceRef={reactFlowInstanceRef}
              minimapNodeInteraction={minimapNodeInteraction}
              terminalWorkflow={terminalWorkflow}
              shortcutTooltips={shortcutTooltips}
              isMinimapCollapsed={shortcutNavigation.isMinimapCollapsed}
              onToggleMinimap={shortcutNavigation.toggleMinimap}
              onZoomCanvasIn={zoomCanvasIn}
              onZoomCanvasOut={zoomCanvasOut}
              onFitCanvas={fitCanvas}
              onCreateTerminalBlock={createTerminalBlock}
              onCreateWorkspaceAgent={createWorkspaceAgent}
              onBeginTerminalGroupSelection={beginTerminalGroupSelection}
              onCreateTerminalGroup={createTerminalGroup}
              onCancelTerminalGroupSelection={cancelTerminalGroupSelection}
              isTerminalGroupSelectionMode={isTerminalGroupSelectionMode}
              selectedTerminalGroupCandidateCount={selectedUngroupedTerminalBlockIds.length}
              canBeginTerminalGroupSelection={Boolean(currentWorkbench)}
              canCreateTerminalGroup={selectedUngroupedTerminalBlockIds.length >= 2}
              onNodesChange={workbenchNodeSelection.onNodesChange}
              onNodeClick={workbenchNodeSelection.selectWorkbenchNode}
              onPaneClick={workbenchNodeSelection.clearWorkbenchSelection}
              onNodeDrag={previewTerminalGroupDrop}
              onNodeDragStart={onNodeDragStart}
              onNodeDragStop={commitWorkbenchNodeDrag}
              onViewportChange={updateGraphViewport}
              onMinimapNodeClick={focusWorkbenchNode}
              getMiniMapNodeColor={minimapAppearance.getMiniMapNodeColor}
              getMiniMapNodeStrokeColor={minimapAppearance.getMiniMapNodeStrokeColor}
              getMiniMapNodeClassName={minimapAppearance.getMiniMapNodeClassName}
            />
          </main>
        </TerminalSurfaceRegistryProvider>
      </AgentTerminalEventProvider>
    </CodexCliStateProvider>
  )
}
