import '@xyflow/react/dist/style.css'
import '@xterm/xterm/css/xterm.css'
import './AppShell.css'
import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useCallback, useMemo, useRef, useState, type SetStateAction } from 'react'

import type { TerminalBlockSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { createMinimapNodeInteraction, filterMinimapNodes } from './minimapInteraction'
import { ProjectSidebar } from './ProjectSidebar'
import { resolveNodeSize } from './resolveNodeSize'
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
import { useTerminalWorkspaceSynchronization } from './useTerminalWorkspaceSynchronization'
import { useTerminalMinimapAppearance } from './useTerminalMinimapAppearance'
import { useTerminalSessions } from './useTerminalSessions'
import { useTerminalWorkflow } from './useTerminalWorkflow'
import { useCurrentGraphState } from './useCurrentGraphState'
import { useWorkbenchFlowNodes } from './useWorkbenchFlowNodes'
import { useWorkbenchGraphIndex } from './useWorkbenchGraphIndex'
import { useWorkbenchNodeSelection } from './useWorkbenchNodeSelection'
import { useWorkspaceAgentActions } from './useWorkspaceAgentActions'
import { useAgentToolApprovals } from './useAgentToolApprovals'
import type { TerminalBlockMetadataInput, WorkbenchFlowNode, WorkbenchSnapshot } from './types'
import { ThemeSettingsRoot } from './ThemeSettingsRoot'
import { WorkbenchCanvas } from './WorkbenchCanvas'
import { createWorkbenchNodeLayoutCommitQueue } from './workbenchNodeLayoutCommitQueue'
import { workbenchNodeTypes } from './workbenchNodeTypes'
import { putWorkbenchFirst, resolveCurrentWorkbenchAfterRemoval } from './workbenchListUpdates'

export function AppShell() {
  const isDesktopRuntime = Boolean(window.cleancode)
  const [workbenches, setWorkbenches] = useState<WorkbenchSnapshot[]>([])
  const [currentWorkbench, setCurrentWorkbench] = useState<WorkbenchSnapshot | null>(null)
  const [nodes, setNodes] = useState<WorkbenchFlowNode[]>([])
  const [selectedTerminalBlockIds, setSelectedTerminalBlockIds] = useState<string[]>([])
  const [selectedTerminalGroupId, setSelectedTerminalGroupId] = useState<string | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [hoveredTerminalBlockId, setHoveredTerminalBlockId] = useState<string | null>(null)
  const [layoutCommitQueue] = useState(createWorkbenchNodeLayoutCommitQueue)
  const reactFlowInstanceRef = useRef<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>(null)
  const { currentWorkspace, graph, terminalBlocksById, terminalGroupsById } =
    useWorkbenchGraphIndex(currentWorkbench)
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
    findTerminalBlockIdForSession,
    interruptTerminal,
    moveTerminalSessionToWorkspace,
    quickLaunchTerminal,
    resizeTerminal,
    restartTerminal,
    runningSessionIds,
    startTerminal,
    terminalStates,
    terminateTerminalSession,
    terminateWorkbenchTerminalSessions,
    writeTerminal
  } = useTerminalSessions({ currentWorkspace, focusTerminalBlock })
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
    setCurrentGraph
  })
  const { start: startTerminalWorkflow, updateExecutionConfig } = terminalWorkflow

  const branchWorkspaceActions = useBranchWorkspaceActions({
    currentWorkbench,
    disposeAgentWorkspaceSession: async (command) => {
      await window.cleancode?.disposeAgentWorkspaceSession(command)
    },
    replaceWorkbench,
    setHoveredTerminalBlockId,
    setSelectedTerminalBlockId,
    terminateWorkbenchTerminalSessions
  })

  const addProject = useCallback(async () => {
    const workbench = await window.cleancode?.addProject()

    if (workbench) {
      rememberWorkbench(workbench)
    }
  }, [rememberWorkbench])

  const removeProject = useCallback(
    async (workbench: WorkbenchSnapshot) => {
      await terminateWorkbenchTerminalSessions(workbench)
      await window.cleancode?.disposeProjectAgentSessions?.({
        projectDirectory: workbench.project.directory
      })

      const rememberedWorkbenches = await window.cleancode?.removeProject({
        projectDirectory: workbench.project.directory
      })

      if (!rememberedWorkbenches) {
        return
      }

      setSelectedTerminalBlockIds([])
      setSelectedTerminalGroupId(null)
      setHoveredTerminalBlockId(null)
      setWorkbenches(rememberedWorkbenches)
      setCurrentWorkbench((current) =>
        resolveCurrentWorkbenchAfterRemoval(current, workbench, rememberedWorkbenches)
      )
    },
    [terminateWorkbenchTerminalSessions]
  )

  const createTerminalBlock = useCallback(async () => {
    if (!currentWorkbench || !currentWorkspace) {
      return
    }

    const existingBlockIds = new Set(currentWorkbench.graph.blocks.map((block) => block.id))
    const graphSnapshot = await window.cleancode?.createTerminalBlock({
      projectDirectory: currentWorkbench.project.directory,
      workspaceName: currentWorkspace.name,
      name: `Terminal ${currentWorkbench.graph.blocks.length + 1}`,
      description: '本地终端',
      position: resolveNewTerminalBlockPosition(currentWorkbench.graph.blocks)
    })

    if (graphSnapshot) {
      setCurrentGraph(graphSnapshot)
      const createdBlock = graphSnapshot.blocks.find((block) => !existingBlockIds.has(block.id))

      if (createdBlock) {
        focusTerminalBlock(createdBlock.id, 220, createdBlock)
      }
    }
  }, [currentWorkbench, currentWorkspace, focusTerminalBlock, setCurrentGraph])

  const createTerminalGroup = useCallback(async () => {
    if (!currentWorkbench || !currentWorkspace || selectedUngroupedTerminalBlockIds.length < 2) {
      return
    }

    const existingGroupIds = new Set(currentWorkbench.graph.terminalGroups.map((group) => group.id))
    const graphSnapshot = await window.cleancode?.createTerminalGroup({
      projectDirectory: currentWorkbench.project.directory,
      workspaceName: currentWorkspace.name,
      name: currentWorkbench.graph.terminalGroups.length === 0 ? '启动项目' : '终端组合',
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
    setCurrentGraph
  ])

  const workbenchNodeSelection = useWorkbenchNodeSelection({
    isTerminalGroupSelectionMode,
    selectTerminalBlock,
    selectTerminalGroup,
    setNodes,
    setSelectedAgentId,
    setSelectedTerminalBlockIds,
    setSelectedTerminalGroupId
  })
  const { selectTerminalFromTitle } = workbenchNodeSelection
  const {
    clearTerminalGroupDropPreview,
    moveWorkbenchNode,
    previewTerminalGroupDrop,
    terminalGroupDropAction
  } = useTerminalGroupDragActions({
    currentWorkbench,
    currentWorkspace,
    graph,
    isTerminalGroupSelectionMode,
    layoutCommitQueue,
    nodes,
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

  const updateTerminalBlockMetadata = useCallback(
    async (block: TerminalBlockSnapshot, metadata: TerminalBlockMetadataInput) => {
      if (!currentWorkbench || !currentWorkspace) {
        return
      }

      const graphSnapshot = await window.cleancode?.updateTerminalBlockMetadata({
        projectDirectory: currentWorkbench.project.directory,
        workspaceName: currentWorkspace.name,
        blockId: block.id,
        name: metadata.name,
        description: metadata.description,
        launchCommand: metadata.launchCommand
      })

      if (graphSnapshot) {
        setCurrentGraph(graphSnapshot)
      }
    },
    [currentWorkbench, currentWorkspace, setCurrentGraph]
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
      onDelete: deleteTerminalBlock,
      onUpdateMetadata: updateTerminalBlockMetadata,
      onUpdateExecutionConfig: updateExecutionConfig,
      onRunFromHere: (block: TerminalBlockSnapshot) => startTerminalWorkflow(block.id),
      onInput: writeTerminal,
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
      interruptTerminal,
      quickLaunchTerminal,
      resizeTerminal,
      resizeTerminalBlock,
      restartTerminal,
      selectTerminalFromTitle,
      selectTerminalBlock,
      startTerminal,
      terminalGroupActions,
      startTerminalWorkflow,
      updateExecutionConfig,
      updateTerminalBlockMetadata,
      writeTerminal
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
    setCurrentGraph,
    setNodes,
    terminalGroupDropAction,
    terminalStates,
    workflowNodeStatuses: terminalWorkflow.nodeStatuses,
    onRemoveAgent: removeWorkspaceAgent,
    onMcpCapabilityChange: updateWorkspaceAgentMcpCapability,
    onRenameAgent: renameWorkspaceAgent,
    onResizeAgent: resizeWorkspaceAgent,
    onSelectAgent: workbenchNodeSelection.selectAgentFromTitle
  })
  const minimapNodes = useMemo(() => filterMinimapNodes(nodes), [nodes])

  return (
    <main className="app-shell" aria-label="cleancode workspace">
      <ThemeSettingsRoot />
      <ProjectSidebar
        workbenches={workbenches}
        currentWorkbench={currentWorkbench}
        isDesktopRuntime={isDesktopRuntime}
        actionError={branchWorkspaceActions.branchWorkspaceActionError}
        onAddProject={addProject}
        onArchiveBranchWorkspace={branchWorkspaceActions.archiveBranchWorkspace}
        onCheckoutMainBranch={branchWorkspaceActions.checkoutMainBranch}
        onCreateBranchWorkspace={branchWorkspaceActions.createBranchWorkspace}
        onDismissActionError={branchWorkspaceActions.dismissBranchWorkspaceActionError}
        onRemoveProject={removeProject}
        onSelectWorkspace={branchWorkspaceActions.selectWorkspace}
      />
      <WorkbenchCanvas
        approvalIntents={agentToolApprovals.approvals}
        isDesktopRuntime={isDesktopRuntime}
        currentWorkbench={currentWorkbench}
        currentWorkspace={currentWorkspace}
        nodes={nodes}
        minimapNodes={minimapNodes}
        nodeTypes={workbenchNodeTypes}
        reactFlowInstanceRef={reactFlowInstanceRef}
        minimapNodeInteraction={minimapNodeInteraction}
        terminalWorkflow={terminalWorkflow}
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
        onNodeDragStart={clearTerminalGroupDropPreview}
        onNodeDragStop={(event, node) => {
          if (node.type !== 'agentConsole') {
            moveWorkbenchNode(event, node)
            return
          }
          const width = resolveNodeSize(node.style?.width, node.data.agent.layout.size.width)
          const height = resolveNodeSize(node.style?.height, node.data.agent.layout.size.height)
          void moveWorkspaceAgent(node.data.agent, node.position, { width, height })
        }}
        onViewportChange={updateGraphViewport}
        onMinimapNodeClick={focusWorkbenchNode}
        getMiniMapNodeColor={minimapAppearance.getMiniMapNodeColor}
        getMiniMapNodeStrokeColor={minimapAppearance.getMiniMapNodeStrokeColor}
        getMiniMapNodeClassName={minimapAppearance.getMiniMapNodeClassName}
      />
    </main>
  )
}
