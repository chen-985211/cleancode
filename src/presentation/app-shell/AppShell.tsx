import '@xyflow/react/dist/style.css'
import '@xterm/xterm/css/xterm.css'
import './AppShell.css'

import { applyNodeChanges, type Edge, type NodeChange, type ReactFlowInstance } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'

import type { TerminalBlockSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { TerminalOutputEvent } from '../../contexts/run/application/ports/TerminalProcessPort'
import { AgentPanel } from './AgentPanel'
import { focusTerminalBlockInCanvas } from './focusTerminalBlockInCanvas'
import type { MinimapNodeInteractionContextValue } from './minimapInteraction'
import { ProjectSidebar } from './ProjectSidebar'
import { updateGraphViewportInWorkbench } from './updateGraphViewportInWorkbench'
import { resizeTerminalBlockInWorkbench } from './resizeTerminalBlockInWorkbench'
import { resolveNewTerminalBlockPosition } from './terminalBlockPlacement'
import { TerminalNode } from './TerminalNode'
import {
  defaultTerminalDimensions,
  terminalOutputBrowserEventName,
  type TerminalBlockMetadataInput,
  type TerminalBlockSizeInput,
  type TerminalDimensions,
  type TerminalFlowNode,
  type TerminalViewState,
  type WorkbenchSnapshot
} from './types'
import { createTerminalFlowNodes } from './terminalFlowNodes'
import { updateTerminalBlockStatus, updateTerminalStatus } from './terminalStateUpdates'
import { useTerminalMinimapAppearance } from './useTerminalMinimapAppearance'
import { useBranchWorkspaceActions } from './useBranchWorkspaceActions'
import { putWorkbenchFirst, resolveCurrentWorkbenchAfterRemoval } from './workbenchListUpdates'
import { WorkbenchCanvas } from './WorkbenchCanvas'

export function AppShell() {
  const isDesktopRuntime = Boolean(window.cleancode)
  const [workbenches, setWorkbenches] = useState<WorkbenchSnapshot[]>([])
  const [currentWorkbench, setCurrentWorkbench] = useState<WorkbenchSnapshot | null>(null)
  const [terminalStates, setTerminalStates] = useState<Record<string, TerminalViewState>>({})
  const terminalStatesRef = useRef<Record<string, TerminalViewState>>({})
  const [nodes, setNodes] = useState<TerminalFlowNode[]>([])
  const reactFlowInstanceRef = useRef<ReactFlowInstance<TerminalFlowNode, Edge> | null>(null)
  const [selectedTerminalBlockId, setSelectedTerminalBlockId] = useState<string | null>(null)
  const [hoveredTerminalBlockId, setHoveredTerminalBlockId] = useState<string | null>(null)
  const graph = currentWorkbench?.graph ?? null
  const currentWorkspace = currentWorkbench?.project.workspaces.find(
    (workspace) => workspace.isCurrent
  )

  useEffect(() => {
    const api = window.cleancode

    if (!api) {
      return undefined
    }

    let isMounted = true

    void api.listWorkbenches().then((rememberedWorkbenches) => {
      if (!isMounted || rememberedWorkbenches.length === 0) {
        return
      }

      setWorkbenches((entries) => (entries.length > 0 ? entries : rememberedWorkbenches))
      setCurrentWorkbench((workbench) => workbench ?? rememberedWorkbenches[0] ?? null)
    })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    terminalStatesRef.current = terminalStates
  }, [terminalStates])

  useEffect(() => {
    const api = window.cleancode

    if (!api) {
      return undefined
    }

    const unsubscribeOutput = api.onTerminalOutput((event) => {
      window.dispatchEvent(
        new CustomEvent<TerminalOutputEvent>(terminalOutputBrowserEventName, { detail: event })
      )
    })
    const unsubscribeExit = api.onTerminalExit((event) => {
      setTerminalStates((states) => updateTerminalStatus(states, event.sessionId, 'exited'))
    })

    return () => {
      unsubscribeOutput()
      unsubscribeExit()
    }
  }, [])

  const nodeTypes = useMemo(() => ({ terminal: TerminalNode }), [])
  const terminalBlocksById = useMemo(() => {
    return new Map((graph?.blocks ?? []).map((block) => [block.id, block]))
  }, [graph])
  const minimapAppearance = useTerminalMinimapAppearance({
    terminalStates,
    selectedTerminalBlockId,
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

  const setCurrentGraph = useCallback((graphSnapshot: WorkbenchSnapshot['graph']): void => {
    const blockIds = new Set(graphSnapshot.blocks.map((block) => block.id))

    setSelectedTerminalBlockId((blockId) => (blockId && blockIds.has(blockId) ? blockId : null))
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

  const addProject = useCallback(async () => {
    const workbench = await window.cleancode?.addProject()

    if (workbench) {
      rememberWorkbench(workbench)
    }
  }, [rememberWorkbench])

  const terminateWorkbenchTerminalSessions = useCallback(async (workbench: WorkbenchSnapshot) => {
    const terminalStatesByBlockId = terminalStatesRef.current
    const sessionIds = workbench.graph.blocks
      .map((block) => terminalStatesByBlockId[block.id]?.sessionId)
      .filter((sessionId): sessionId is string => Boolean(sessionId))

    setTerminalStates((states) => {
      const nextStates = { ...states }

      for (const block of workbench.graph.blocks) {
        delete nextStates[block.id]
      }

      return nextStates
    })

    await Promise.all(
      sessionIds.map((sessionId) => window.cleancode?.terminateTerminal({ sessionId }))
    )
  }, [])

  const { checkoutMainBranch, createBranchWorkspace, selectWorkspace } = useBranchWorkspaceActions({
    currentWorkbench,
    replaceWorkbench,
    setHoveredTerminalBlockId,
    setSelectedTerminalBlockId,
    terminateWorkbenchTerminalSessions
  })

  const removeProject = useCallback(
    async (workbench: WorkbenchSnapshot) => {
      await terminateWorkbenchTerminalSessions(workbench)

      const rememberedWorkbenches = await window.cleancode?.removeProject({
        projectDirectory: workbench.project.directory
      })

      if (!rememberedWorkbenches) {
        return
      }

      setSelectedTerminalBlockId(null)
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
    const position = resolveNewTerminalBlockPosition(currentWorkbench.graph.blocks)
    const graphSnapshot = await window.cleancode?.createTerminalBlock({
      projectDirectory: currentWorkbench.project.directory,
      workspaceName: currentWorkspace.name,
      name: `Terminal ${currentWorkbench.graph.blocks.length + 1}`,
      description: '本地终端',
      position
    })

    if (graphSnapshot) {
      setCurrentGraph(graphSnapshot)
      const createdBlock = graphSnapshot.blocks.find((block) => !existingBlockIds.has(block.id))

      if (createdBlock) {
        focusTerminalBlockInCanvas({
          block: createdBlock,
          reactFlowInstance: reactFlowInstanceRef.current,
          duration: 0,
          setSelectedTerminalBlockId,
          setHoveredTerminalBlockId
        })
      }
    }
  }, [currentWorkbench, currentWorkspace, setCurrentGraph])

  const onNodesChange = useCallback((changes: NodeChange<TerminalFlowNode>[]) => {
    setNodes((currentNodes) => applyNodeChanges(changes, currentNodes))
  }, [])

  const focusTerminalBlock = useCallback(
    (blockId: string) => {
      const block = terminalBlocksById.get(blockId)

      if (!block) {
        return
      }

      focusTerminalBlockInCanvas({
        block,
        reactFlowInstance: reactFlowInstanceRef.current,
        setSelectedTerminalBlockId,
        setHoveredTerminalBlockId
      })
    },
    [terminalBlocksById]
  )

  const minimapNodeInteraction = useMemo<MinimapNodeInteractionContextValue>(
    () => ({
      getLabel: (blockId) => terminalBlocksById.get(blockId)?.name ?? blockId,
      focusBlock: focusTerminalBlock,
      setHoveredBlockId: setHoveredTerminalBlockId
    }),
    [focusTerminalBlock, terminalBlocksById]
  )

  const selectTerminalBlock = useCallback((_event: MouseEvent, node: TerminalFlowNode) => {
    setSelectedTerminalBlockId(node.id)
  }, [])

  const moveBlock = useCallback(
    async (_event: globalThis.MouseEvent | TouchEvent, node: TerminalFlowNode) => {
      if (!currentWorkbench || !currentWorkspace) {
        return
      }

      const graphSnapshot = await window.cleancode?.moveBlock({
        projectDirectory: currentWorkbench.project.directory,
        workspaceName: currentWorkspace.name,
        blockId: node.id,
        position: node.position
      })

      if (graphSnapshot) {
        setCurrentGraph(graphSnapshot)
      }
    },
    [currentWorkbench, currentWorkspace, setCurrentGraph]
  )

  const startTerminal = useCallback(
    async (block: TerminalBlockSnapshot, dimensions: TerminalDimensions) => {
      if (!currentWorkspace) {
        return
      }

      const session = await window.cleancode?.startTerminal({
        terminalBlockId: block.id,
        workspaceName: currentWorkspace.name,
        workingDirectory: currentWorkspace.directory,
        columns: dimensions.columns,
        rows: dimensions.rows
      })

      if (session) {
        setTerminalStates((states) => ({
          ...states,
          [block.id]: {
            sessionId: session.id,
            status: session.status,
            output: states[block.id]?.output ?? ''
          }
        }))
      }
    },
    [currentWorkspace]
  )

  const interruptTerminal = useCallback(async (block: TerminalBlockSnapshot) => {
    const terminalState = terminalStatesRef.current[block.id]

    if (terminalState?.sessionId && terminalState.status === 'running') {
      await window.cleancode?.interruptTerminal({ sessionId: terminalState.sessionId })
    }
  }, [])

  const terminateTerminalSession = useCallback(async (block: TerminalBlockSnapshot) => {
    const terminalState = terminalStatesRef.current[block.id]

    setTerminalStates((states) => updateTerminalBlockStatus(states, block.id, 'exited'))

    if (terminalState?.sessionId && window.cleancode) {
      await window.cleancode.terminateTerminal({ sessionId: terminalState.sessionId })
    }
  }, [])

  const restartTerminal = useCallback(
    async (block: TerminalBlockSnapshot) => {
      await terminateTerminalSession(block)
      await startTerminal(block, defaultTerminalDimensions)
      window.setTimeout(() => focusTerminalBlock(block.id), 80)
    },
    [focusTerminalBlock, startTerminal, terminateTerminalSession]
  )

  const writeTerminal = useCallback(async (block: TerminalBlockSnapshot, input: string) => {
    const terminalState = terminalStatesRef.current[block.id]

    if (terminalState?.sessionId && terminalState.status === 'running' && window.cleancode) {
      await window.cleancode.writeTerminal({ sessionId: terminalState.sessionId, input })
    }
  }, [])

  const resizeTerminal = useCallback(
    async (block: TerminalBlockSnapshot, dimensions: TerminalDimensions) => {
      const terminalState = terminalStatesRef.current[block.id]

      if (terminalState?.sessionId && terminalState.status === 'running') {
        await window.cleancode?.resizeTerminal({
          sessionId: terminalState.sessionId,
          columns: dimensions.columns,
          rows: dimensions.rows
        })
      }
    },
    []
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
        description: metadata.description
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

  useEffect(() => {
    // React Flow owns transient drag state; this effect resynchronizes nodes when graph/session state changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNodes(
      createTerminalFlowNodes({
        graph,
        selectedTerminalBlockId,
        hoveredTerminalBlockId,
        terminalStates,
        handlers: {
          onStart: startTerminal,
          onStop: interruptTerminal,
          onRestart: restartTerminal,
          onDelete: deleteTerminalBlock,
          onUpdateMetadata: updateTerminalBlockMetadata,
          onInput: writeTerminal,
          onResize: resizeTerminal,
          onResizeBlock: resizeTerminalBlock
        }
      })
    )
  }, [
    deleteTerminalBlock,
    graph,
    hoveredTerminalBlockId,
    interruptTerminal,
    restartTerminal,
    selectedTerminalBlockId,
    startTerminal,
    terminalStates,
    updateTerminalBlockMetadata,
    writeTerminal,
    resizeTerminal,
    resizeTerminalBlock
  ])

  return (
    <main className="app-shell" aria-label="cleancode workspace">
      <ProjectSidebar
        workbenches={workbenches}
        currentWorkbench={currentWorkbench}
        isDesktopRuntime={isDesktopRuntime}
        onAddProject={addProject}
        onCheckoutMainBranch={checkoutMainBranch}
        onCreateBranchWorkspace={createBranchWorkspace}
        onRemoveProject={removeProject}
        onSelectWorkspace={selectWorkspace}
      />
      <WorkbenchCanvas
        isDesktopRuntime={isDesktopRuntime}
        currentWorkbench={currentWorkbench}
        currentWorkspace={currentWorkspace}
        nodes={nodes}
        nodeTypes={nodeTypes}
        reactFlowInstanceRef={reactFlowInstanceRef}
        minimapNodeInteraction={minimapNodeInteraction}
        onCreateTerminalBlock={createTerminalBlock}
        onNodesChange={onNodesChange}
        onNodeClick={selectTerminalBlock}
        onNodeDragStop={moveBlock}
        onViewportChange={updateGraphViewport}
        onMinimapNodeClick={focusTerminalBlock}
        getMiniMapNodeColor={minimapAppearance.getMiniMapNodeColor}
        getMiniMapNodeStrokeColor={minimapAppearance.getMiniMapNodeStrokeColor}
        getMiniMapNodeClassName={minimapAppearance.getMiniMapNodeClassName}
      />
      <AgentPanel />
    </main>
  )
}
