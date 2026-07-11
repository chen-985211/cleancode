import '@xyflow/react/dist/style.css'
import '@xterm/xterm/css/xterm.css'
import './AppShell.css'

import type { Edge, NodeChange, ReactFlowInstance } from '@xyflow/react'
import { useCallback, useMemo, useRef, useState, type MouseEvent, type SetStateAction } from 'react'

import type { TerminalBlockSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { applyWorkbenchNodeChanges } from './applyWorkbenchNodeChanges'
import { findCurrentWorkspace } from './findCurrentWorkspace'
import type { MinimapNodeInteractionContextValue } from './minimapInteraction'
import { ProjectSidebar } from './ProjectSidebar'
import { resizeTerminalBlockInWorkbench } from './resizeTerminalBlockInWorkbench'
import { resolveNewTerminalBlockPosition } from './terminalBlockPlacement'
import { updateGraphViewportInWorkbench } from './updateGraphViewportInWorkbench'
import { useBranchWorkspaceActions } from './useBranchWorkspaceActions'
import { useTerminalGroupActions } from './useTerminalGroupActions'
import { useTerminalGroupDragActions } from './useTerminalGroupDragActions'
import { useTerminalGroupSelectionMode } from './useTerminalGroupSelectionMode'
import { useInitialWorkbenchLoad } from './useInitialWorkbenchLoad'
import { useMinimapNodeFocus } from './useMinimapNodeFocus'
import { useProjectGitStateSynchronization } from './useProjectGitStateSynchronization'
import { useTerminalWorkspaceSynchronization } from './useTerminalWorkspaceSynchronization'
import { useTerminalMinimapAppearance } from './useTerminalMinimapAppearance'
import { useTerminalSessions } from './useTerminalSessions'
import { useWorkbenchFlowNodes } from './useWorkbenchFlowNodes'
import type {
  TerminalBlockMetadataInput,
  TerminalBlockSizeInput,
  MinimapFlowNode,
  WorkbenchFlowNode,
  WorkbenchSnapshot
} from './types'
import { WorkbenchCanvas } from './WorkbenchCanvas'
import { workbenchNodeTypes } from './workbenchNodeTypes'
import { putWorkbenchFirst, resolveCurrentWorkbenchAfterRemoval } from './workbenchListUpdates'

export function AppShell() {
  const isDesktopRuntime = Boolean(window.cleancode)
  const [workbenches, setWorkbenches] = useState<WorkbenchSnapshot[]>([])
  const [currentWorkbench, setCurrentWorkbench] = useState<WorkbenchSnapshot | null>(null)
  const [nodes, setNodes] = useState<WorkbenchFlowNode[]>([])
  const [selectedTerminalBlockIds, setSelectedTerminalBlockIds] = useState<string[]>([])
  const [selectedTerminalGroupId, setSelectedTerminalGroupId] = useState<string | null>(null)
  const [isAgentConsoleSelected, setIsAgentConsoleSelected] = useState(false)
  const [hoveredTerminalBlockId, setHoveredTerminalBlockId] = useState<string | null>(null)
  const reactFlowInstanceRef = useRef<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>(null)
  const graph = currentWorkbench?.graph ?? null
  const currentWorkspace = findCurrentWorkspace(currentWorkbench)
  const terminalBlocksById = useMemo(
    () => new Map((graph?.blocks ?? []).map((block) => [block.id, block])),
    [graph]
  )
  const terminalGroupsById = useMemo(
    () => new Map((graph?.terminalGroups ?? []).map((group) => [group.id, group])),
    [graph]
  )
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

  const { focusTerminalBlock, focusWorkbenchNode } = useMinimapNodeFocus({
    terminalBlocksById,
    terminalGroupsById,
    reactFlowInstanceRef,
    setIsAgentConsoleSelected,
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
  useProjectGitStateSynchronization({ currentWorkbench, replaceWorkbench })
  useTerminalWorkspaceSynchronization({
    currentWorkbench,
    findTerminalBlockIdForSession,
    moveTerminalSessionToWorkspace,
    replaceWorkbench,
    runningSessionIds
  })
  const setCurrentGraph = useCallback((graphSnapshot: WorkbenchSnapshot['graph']): void => {
    const blockIds = new Set(graphSnapshot.blocks.map((block) => block.id))
    const groupIds = new Set(graphSnapshot.terminalGroups.map((group) => group.id))

    setSelectedTerminalBlockIds((blockIdsSnapshot) =>
      blockIdsSnapshot.filter((blockId) => blockIds.has(blockId))
    )
    setSelectedTerminalGroupId((groupId) => (groupId && groupIds.has(groupId) ? groupId : null))
    setHoveredTerminalBlockId((blockId) => (blockId && blockIds.has(blockId) ? blockId : null))
    setCurrentWorkbench((workbench) =>
      workbench ? { ...workbench, graph: graphSnapshot } : workbench
    )
    setWorkbenches((entries) =>
      entries.map((entry) =>
        entry.project.id === graphSnapshot.projectId ? { ...entry, graph: graphSnapshot } : entry
      )
    )
  }, [])

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
        focusTerminalBlock(createdBlock.id, 0, createdBlock)
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

  const onNodesChange = useCallback(
    (changes: NodeChange<WorkbenchFlowNode>[]) => {
      const agentSelectionChange = changes.find(
        (change) => change.type === 'select' && change.id === 'agent-console'
      )

      if (agentSelectionChange?.type === 'select') {
        setIsAgentConsoleSelected(agentSelectionChange.selected)
      }

      setNodes((currentNodes) =>
        applyWorkbenchNodeChanges(changes, currentNodes, {
          shouldResizeExpandedTerminalGroups: !isTerminalGroupSelectionMode
        })
      )
    },
    [isTerminalGroupSelectionMode]
  )
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
    nodes,
    setCurrentGraph
  })

  const minimapNodeInteraction = useMemo<MinimapNodeInteractionContextValue>(
    () => ({
      getLabel: (blockId) =>
        blockId === 'agent-console'
          ? 'Codex CLI'
          : (terminalBlocksById.get(blockId)?.name ??
            terminalGroupsById.get(blockId)?.name ??
            blockId),
      setHoveredBlockId: setHoveredTerminalBlockId
    }),
    [terminalBlocksById, terminalGroupsById]
  )

  const selectWorkbenchNode = useCallback(
    (event: MouseEvent, node: WorkbenchFlowNode) => {
      if (node.type === 'agentConsole') {
        setIsAgentConsoleSelected(true)
        setSelectedTerminalBlockIds([])
        setSelectedTerminalGroupId(null)
        return
      }

      setIsAgentConsoleSelected(false)

      if (node.type === 'terminal') {
        selectTerminalBlock(node.id, event.shiftKey)
        return
      }

      selectTerminalGroup(node.id)
    },
    [selectTerminalBlock, selectTerminalGroup]
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
  const resizeTerminalBlock = useCallback(
    (block: TerminalBlockSnapshot, size: TerminalBlockSizeInput) =>
      resizeTerminalBlockInWorkbench({
        currentWorkbench,
        currentWorkspace,
        block,
        size,
        setCurrentGraph
      }),
    [currentWorkbench, currentWorkspace, setCurrentGraph]
  )
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
      onInput: writeTerminal,
      onResize: resizeTerminal,
      onResizeBlock: resizeTerminalBlock,
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
      selectTerminalBlock,
      startTerminal,
      terminalGroupActions,
      updateTerminalBlockMetadata,
      writeTerminal
    ]
  )
  useWorkbenchFlowNodes({
    currentWorkbench,
    currentWorkspace,
    graph,
    handlers: terminalFlowNodeHandlers,
    hoveredTerminalBlockId,
    isAgentConsoleSelected,
    isTerminalGroupSelectionMode,
    selectedTerminalBlockIds,
    selectedTerminalGroupId,
    selectedUngroupedTerminalBlockIds,
    setCurrentGraph,
    setNodes,
    terminalGroupDropAction,
    terminalStates
  })
  const minimapNodes = useMemo(
    () =>
      nodes.filter(
        (node): node is MinimapFlowNode =>
          node.type === 'agentConsole' ||
          node.type === 'terminal' ||
          (node.type === 'terminalGroup' && node.data.group.isCollapsed)
      ),
    [nodes]
  )

  return (
    <main className="app-shell" aria-label="cleancode workspace">
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
        isDesktopRuntime={isDesktopRuntime}
        currentWorkbench={currentWorkbench}
        currentWorkspace={currentWorkspace}
        nodes={nodes}
        minimapNodes={minimapNodes}
        nodeTypes={workbenchNodeTypes}
        reactFlowInstanceRef={reactFlowInstanceRef}
        minimapNodeInteraction={minimapNodeInteraction}
        onCreateTerminalBlock={createTerminalBlock}
        onBeginTerminalGroupSelection={beginTerminalGroupSelection}
        onCreateTerminalGroup={createTerminalGroup}
        onCancelTerminalGroupSelection={cancelTerminalGroupSelection}
        isTerminalGroupSelectionMode={isTerminalGroupSelectionMode}
        selectedTerminalGroupCandidateCount={selectedUngroupedTerminalBlockIds.length}
        canBeginTerminalGroupSelection={Boolean(currentWorkbench)}
        canCreateTerminalGroup={selectedUngroupedTerminalBlockIds.length >= 2}
        onNodesChange={onNodesChange}
        onNodeClick={selectWorkbenchNode}
        onNodeDrag={previewTerminalGroupDrop}
        onNodeDragStart={clearTerminalGroupDropPreview}
        onNodeDragStop={moveWorkbenchNode}
        onViewportChange={updateGraphViewport}
        onMinimapNodeClick={focusWorkbenchNode}
        getMiniMapNodeColor={minimapAppearance.getMiniMapNodeColor}
        getMiniMapNodeStrokeColor={minimapAppearance.getMiniMapNodeStrokeColor}
        getMiniMapNodeClassName={minimapAppearance.getMiniMapNodeClassName}
      />
    </main>
  )
}
