import '@xyflow/react/dist/style.css'
import '@xterm/xterm/css/xterm.css'
import './AppShell.css'

import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm } from '@xterm/xterm'
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  applyNodeChanges,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance
} from '@xyflow/react'
import {
  Bot,
  Box,
  Check,
  GitBranch,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Settings,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  X,
  ZoomIn
} from 'lucide-react'
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type SyntheticEvent
} from 'react'

import type {
  BlockGraphSnapshot,
  TerminalBlockSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { ProjectSnapshot } from '../../contexts/project/application/dto/ProjectSnapshot'
import type { TerminalSessionStatus } from '../../contexts/run/application/dto/TerminalSessionSnapshot'
import type { TerminalOutputEvent } from '../../contexts/run/application/ports/TerminalProcessPort'

interface WorkbenchSnapshot {
  readonly project: ProjectSnapshot
  readonly graph: BlockGraphSnapshot
}

interface TerminalViewState {
  readonly sessionId: string | null
  readonly status: TerminalSessionStatus
  readonly output: string
}

interface TerminalNodeData extends Record<string, unknown> {
  readonly block: TerminalBlockSnapshot
  readonly session: TerminalViewState
  readonly isSelected: boolean
  readonly isNavigationHighlighted: boolean
  readonly onStart: (block: TerminalBlockSnapshot, dimensions: TerminalDimensions) => void
  readonly onStop: (block: TerminalBlockSnapshot) => void
  readonly onRestart: (block: TerminalBlockSnapshot) => void
  readonly onDelete: (block: TerminalBlockSnapshot) => void
  readonly onUpdateMetadata: (
    block: TerminalBlockSnapshot,
    metadata: TerminalBlockMetadataInput
  ) => Promise<void>
  readonly onInput: (block: TerminalBlockSnapshot, input: string) => void
  readonly onResize: (block: TerminalBlockSnapshot, dimensions: TerminalDimensions) => void
}

type TerminalFlowNode = Node<TerminalNodeData, 'terminal'>

interface TerminalDimensions {
  readonly columns: number
  readonly rows: number
}

interface TerminalBlockMetadataInput {
  readonly name: string
  readonly description: string
}

const defaultTerminalDimensions: TerminalDimensions = {
  columns: 80,
  rows: 24
}
const terminalNodeDefaultSize = {
  width: 420,
  height: 306
}
const terminalOutputBrowserEventName = 'cleancode-terminal-output'

interface MinimapNodeInteractionContextValue {
  readonly getLabel: (blockId: string) => string
  readonly focusBlock: (blockId: string) => void
  readonly setHoveredBlockId: (blockId: string | null) => void
}

const MinimapNodeInteractionContext = createContext<MinimapNodeInteractionContextValue>({
  getLabel: (blockId) => blockId,
  focusBlock: () => undefined,
  setHoveredBlockId: () => undefined
})

interface MinimapTerminalNodeProps {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly borderRadius: number
  readonly className: string
  readonly color?: string
  readonly strokeColor?: string
  readonly strokeWidth?: number
  readonly selected: boolean
  readonly onClick?: (event: MouseEvent<SVGGElement>, id: string) => void
}

export function AppShell() {
  const isDesktopRuntime = Boolean(window.cleancode)
  const [workbenches, setWorkbenches] = useState<WorkbenchSnapshot[]>([])
  const [currentWorkbench, setCurrentWorkbench] = useState<WorkbenchSnapshot | null>(null)
  const [terminalStates, setTerminalStates] = useState<Record<string, TerminalViewState>>({})
  const terminalStatesRef = useRef<Record<string, TerminalViewState>>({})
  const [nodes, setNodes] = useState<TerminalFlowNode[]>([])
  const reactFlowInstanceRef = useRef<ReactFlowInstance<TerminalFlowNode, Edge> | null>(null)
  const [isMinimapCollapsed, setIsMinimapCollapsed] = useState(false)
  const [selectedTerminalBlockId, setSelectedTerminalBlockId] = useState<string | null>(null)
  const [hoveredTerminalBlockId, setHoveredTerminalBlockId] = useState<string | null>(null)
  const [viewportZoom, setViewportZoom] = useState(1)
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

  const nodeTypes = useMemo(
    () => ({
      terminal: TerminalNode
    }),
    []
  )
  const terminalBlocksById = useMemo(() => {
    return new Map((graph?.blocks ?? []).map((block) => [block.id, block]))
  }, [graph])

  const rememberWorkbench = useCallback((workbench: WorkbenchSnapshot): void => {
    setWorkbenches((entries) => [
      workbench,
      ...entries.filter((entry) => entry.project.directory !== workbench.project.directory)
    ])
    setCurrentWorkbench(workbench)
  }, [])

  const setCurrentGraph = useCallback((graphSnapshot: BlockGraphSnapshot): void => {
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

  const selectWorkbench = useCallback((workbench: WorkbenchSnapshot): void => {
    setSelectedTerminalBlockId(null)
    setHoveredTerminalBlockId(null)
    setCurrentWorkbench(workbench)
  }, [])

  const addProject = useCallback(async () => {
    const workbench = await window.cleancode?.addProject()

    if (workbench) {
      rememberWorkbench(workbench)
    }
  }, [rememberWorkbench])

  const createTerminalBlock = useCallback(async () => {
    if (!currentWorkbench || !currentWorkspace) {
      return
    }

    const position = {
      x: 180 + currentWorkbench.graph.blocks.length * 44,
      y: 270 + currentWorkbench.graph.blocks.length * 32
    }
    const graphSnapshot = await window.cleancode?.createTerminalBlock({
      projectDirectory: currentWorkbench.project.directory,
      workspaceName: currentWorkspace.name,
      name: `Terminal ${currentWorkbench.graph.blocks.length + 1}`,
      description: '本地终端',
      position
    })

    if (graphSnapshot) {
      setCurrentGraph(graphSnapshot)
    }
  }, [currentWorkbench, currentWorkspace, setCurrentGraph])

  const onNodesChange = useCallback((changes: NodeChange<TerminalFlowNode>[]) => {
    setNodes((currentNodes) => applyNodeChanges(changes, currentNodes))
  }, [])

  const focusTerminalBlock = useCallback(
    (blockId: string) => {
      const block = terminalBlocksById.get(blockId)
      const reactFlowInstance = reactFlowInstanceRef.current

      if (!block || !reactFlowInstance) {
        return
      }

      const node = reactFlowInstance.getNode(blockId)
      const measuredWidth = node?.measured?.width ?? terminalNodeDefaultSize.width
      const measuredHeight = node?.measured?.height ?? terminalNodeDefaultSize.height
      const position = node?.position ?? block.position
      const nextZoom = Math.max(reactFlowInstance.getZoom(), 0.9)

      setSelectedTerminalBlockId(blockId)
      setHoveredTerminalBlockId(null)
      void reactFlowInstance.setCenter(
        position.x + measuredWidth / 2,
        position.y + measuredHeight / 2,
        {
          zoom: nextZoom,
          duration: 220
        }
      )

      window.setTimeout(() => {
        const terminalViewport = document.querySelector<HTMLElement>(
          `[data-terminal-block-id="${blockId}"] .terminal-viewport`
        )

        terminalViewport?.focus()
      }, 240)
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

  const zoomInCanvas = useCallback(() => {
    void reactFlowInstanceRef.current?.zoomIn({ duration: 160 })
  }, [])

  const zoomOutCanvas = useCallback(() => {
    void reactFlowInstanceRef.current?.zoomOut({ duration: 160 })
  }, [])

  const fitCanvas = useCallback(() => {
    void reactFlowInstanceRef.current?.fitView({ padding: 0.22, duration: 180 })
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

    if (!terminalState?.sessionId || terminalState.status !== 'running') {
      return
    }

    await window.cleancode?.interruptTerminal({ sessionId: terminalState.sessionId })
  }, [])

  const terminateTerminalSession = useCallback(async (block: TerminalBlockSnapshot) => {
    const terminalState = terminalStatesRef.current[block.id]

    setTerminalStates((states) => {
      const currentState = states[block.id]

      if (!currentState) {
        return states
      }

      return {
        ...states,
        [block.id]: {
          sessionId: null,
          status: 'exited',
          output: currentState.output
        }
      }
    })

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

    if (!terminalState?.sessionId || terminalState.status !== 'running') {
      return
    }

    if (window.cleancode) {
      await window.cleancode.writeTerminal({
        sessionId: terminalState.sessionId,
        input
      })
      return
    }
  }, [])

  const resizeTerminal = useCallback(
    async (block: TerminalBlockSnapshot, dimensions: TerminalDimensions) => {
      const terminalState = terminalStatesRef.current[block.id]

      if (!terminalState?.sessionId || terminalState.status !== 'running') {
        return
      }

      await window.cleancode?.resizeTerminal({
        sessionId: terminalState.sessionId,
        columns: dimensions.columns,
        rows: dimensions.rows
      })
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

  const getMiniMapNodeColor = useCallback(
    (node: TerminalFlowNode): string => {
      return getTerminalStatusColor(terminalStates[node.id]?.status ?? 'idle')
    },
    [terminalStates]
  )

  const getMiniMapNodeStrokeColor = useCallback(
    (node: TerminalFlowNode): string => {
      if (selectedTerminalBlockId === node.id) {
        return '#2563eb'
      }

      if (hoveredTerminalBlockId === node.id) {
        return '#7c9df5'
      }

      return terminalStates[node.id]?.status === 'running' ? '#16a34a' : '#9fb7ef'
    },
    [hoveredTerminalBlockId, selectedTerminalBlockId, terminalStates]
  )

  const getMiniMapNodeClassName = useCallback(
    (node: TerminalFlowNode): string => {
      const classNames = ['canvas-minimap__node']
      const status = terminalStates[node.id]?.status ?? 'idle'

      classNames.push(`canvas-minimap__node--${status}`)

      if (selectedTerminalBlockId === node.id) {
        classNames.push('canvas-minimap__node--selected')
      }

      if (hoveredTerminalBlockId === node.id) {
        classNames.push('canvas-minimap__node--highlighted')
      }

      return classNames.join(' ')
    },
    [hoveredTerminalBlockId, selectedTerminalBlockId, terminalStates]
  )

  useEffect(() => {
    // React Flow owns transient drag state; this effect resynchronizes nodes when graph/session state changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNodes(
      (graph?.blocks ?? []).map((block) => {
        const isSelected = selectedTerminalBlockId === block.id
        const isNavigationHighlighted = hoveredTerminalBlockId === block.id

        return {
          id: block.id,
          type: 'terminal',
          position: block.position,
          selected: isSelected,
          data: {
            block,
            session: terminalStates[block.id] ?? createIdleTerminalState(),
            isSelected,
            isNavigationHighlighted,
            onStart: startTerminal,
            onStop: interruptTerminal,
            onRestart: restartTerminal,
            onDelete: deleteTerminalBlock,
            onUpdateMetadata: updateTerminalBlockMetadata,
            onInput: writeTerminal,
            onResize: resizeTerminal
          }
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
    resizeTerminal
  ])

  return (
    <main className="app-shell" aria-label="cleancode workspace">
      <ProjectSidebar
        workbenches={workbenches}
        currentWorkbench={currentWorkbench}
        isDesktopRuntime={isDesktopRuntime}
        onAddProject={addProject}
        onSelectWorkbench={selectWorkbench}
      />
      <section className="app-shell__workspace" aria-label="积木画布">
        <header className="app-shell__toolbar" aria-label="工作台工具栏">
          <button
            className="toolbar-button toolbar-button--primary"
            type="button"
            onClick={createTerminalBlock}
            disabled={!isDesktopRuntime || !currentWorkbench}
          >
            <Terminal size={16} aria-hidden="true" />
            新建终端积木
          </button>
        </header>
        <div className="canvas-surface">
          <ReactFlow<TerminalFlowNode, Edge>
            nodes={nodes}
            edges={[]}
            nodeTypes={nodeTypes}
            onInit={(instance) => {
              reactFlowInstanceRef.current = instance
              setViewportZoom(instance.getZoom())
            }}
            onNodesChange={onNodesChange}
            onNodeClick={selectTerminalBlock}
            onNodeDragStop={moveBlock}
            onMove={(_event, viewport) => setViewportZoom(viewport.zoom)}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            minZoom={0.35}
            maxZoom={1.6}
          >
            <Background color="#d7deea" gap={20} size={1.2} />
            <Controls position="bottom-left" showInteractive={false} />
            <Panel className="canvas-minimap-panel" position="top-left">
              <div className="canvas-minimap">
                <div className="canvas-minimap__header">
                  <span>小地图</span>
                  <button
                    className="icon-button icon-button--small"
                    type="button"
                    aria-label={isMinimapCollapsed ? '展开小地图' : '收起小地图'}
                    title={isMinimapCollapsed ? '展开小地图' : '收起小地图'}
                    onClick={() => setIsMinimapCollapsed((collapsed) => !collapsed)}
                  >
                    {isMinimapCollapsed ? (
                      <Maximize2 size={13} aria-hidden="true" />
                    ) : (
                      <Minimize2 size={13} aria-hidden="true" />
                    )}
                  </button>
                </div>
                {!isMinimapCollapsed ? (
                  <>
                    <MinimapNodeInteractionContext.Provider value={minimapNodeInteraction}>
                      <MiniMap<TerminalFlowNode>
                        pannable
                        zoomable
                        ariaLabel="积木导航小地图"
                        nodeComponent={MinimapTerminalNode}
                        nodeColor={getMiniMapNodeColor}
                        nodeStrokeColor={getMiniMapNodeStrokeColor}
                        nodeClassName={getMiniMapNodeClassName}
                        nodeBorderRadius={8}
                        nodeStrokeWidth={3}
                        maskColor="rgb(37 99 235 / 0.08)"
                        maskStrokeColor="rgb(37 99 235 / 0.28)"
                        maskStrokeWidth={1.5}
                        onNodeClick={(event, node) => {
                          event.stopPropagation()
                          focusTerminalBlock(node.id)
                        }}
                      />
                    </MinimapNodeInteractionContext.Provider>
                    <div className="canvas-minimap__controls">
                      <button
                        className="icon-button icon-button--small"
                        type="button"
                        aria-label="小地图缩小"
                        title="缩小画布"
                        onClick={zoomOutCanvas}
                      >
                        <Minus size={13} aria-hidden="true" />
                      </button>
                      <span>{Math.round(viewportZoom * 100)}%</span>
                      <button
                        className="icon-button icon-button--small"
                        type="button"
                        aria-label="小地图放大"
                        title="放大画布"
                        onClick={zoomInCanvas}
                      >
                        <ZoomIn size={13} aria-hidden="true" />
                      </button>
                      <button
                        className="icon-button icon-button--small"
                        type="button"
                        aria-label="小地图适应"
                        title="适应画布"
                        onClick={fitCanvas}
                      >
                        <MapIcon size={13} aria-hidden="true" />
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </Panel>
          </ReactFlow>
          {!currentWorkbench ? (
            <div className="canvas-empty">
              <Box size={24} aria-hidden="true" />
              <span>
                {isDesktopRuntime
                  ? '选择或添加项目后进入 main 工作区'
                  : '当前是浏览器预览模式，真实项目和终端功能请在 Electron 桌面应用中使用'}
              </span>
            </div>
          ) : null}
        </div>
        <footer className="app-shell__statusbar">
          <span className="status-dot status-dot--running" />
          <span>
            {!isDesktopRuntime
              ? '浏览器预览模式'
              : currentWorkbench
                ? '已连接本地运行时'
                : '等待项目'}
          </span>
          {currentWorkspace ? (
            <span className="status-path">{currentWorkspace.directory}</span>
          ) : null}
        </footer>
      </section>
      <AgentPanel />
    </main>
  )
}

interface ProjectSidebarProps {
  readonly workbenches: readonly WorkbenchSnapshot[]
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly isDesktopRuntime: boolean
  readonly onAddProject: () => void
  readonly onSelectWorkbench: (workbench: WorkbenchSnapshot) => void
}

function ProjectSidebar({
  workbenches,
  currentWorkbench,
  isDesktopRuntime,
  onAddProject,
  onSelectWorkbench
}: ProjectSidebarProps) {
  return (
    <aside className="project-sidebar" aria-label="项目与分支工作区">
      <div className="project-sidebar__brand">
        <span className="brand-mark">
          <Sparkles size={18} aria-hidden="true" />
        </span>
        <span>cleancode</span>
      </div>
      <div className="project-sidebar__actions">
        <button
          className="sidebar-action"
          type="button"
          onClick={onAddProject}
          disabled={!isDesktopRuntime}
        >
          <Plus size={17} aria-hidden="true" />
          添加项目
        </button>
      </div>
      {!isDesktopRuntime ? (
        <div className="runtime-warning" role="status">
          浏览器预览不连接本地文件系统和终端。请用桌面应用运行真实功能。
        </div>
      ) : null}
      <div className="project-sidebar__label">项目</div>
      <div className="project-list">
        {workbenches.map((workbench) => {
          const isCurrentProject = currentWorkbench?.project.id === workbench.project.id

          return (
            <section className="project-card" key={workbench.project.id}>
              <button
                className="project-card__header"
                type="button"
                onClick={() => onSelectWorkbench(workbench)}
              >
                <span
                  className={isCurrentProject ? 'project-dot project-dot--active' : 'project-dot'}
                />
                <span className="truncate">{workbench.project.name}</span>
              </button>
              <div className="workspace-list">
                {workbench.project.workspaces.map((workspace) => (
                  <button
                    className={
                      workspace.isCurrent && isCurrentProject
                        ? 'workspace-row workspace-row--active'
                        : 'workspace-row'
                    }
                    key={workspace.name}
                    type="button"
                    onClick={() => onSelectWorkbench(workbench)}
                  >
                    <GitBranch size={14} aria-hidden="true" />
                    <span className="truncate">{workspace.name}</span>
                    {workspace.isCurrent && isCurrentProject ? (
                      <span className="badge">当前</span>
                    ) : null}
                    {workspace.gitBranch ? <span className="badge badge--git">Git</span> : null}
                  </button>
                ))}
              </div>
            </section>
          )
        })}
      </div>
      <button
        className="project-sidebar__settings icon-button"
        type="button"
        aria-label="设置"
        title="设置"
      >
        <Settings size={16} aria-hidden="true" />
      </button>
    </aside>
  )
}

const TerminalNode = memo(function TerminalNode({ data }: NodeProps<TerminalFlowNode>) {
  const block = data.block
  const session = data.session
  const isRunning = session.status === 'running'
  const [isEditingMetadata, setIsEditingMetadata] = useState(false)
  const [draftName, setDraftName] = useState(block.name)
  const [draftDescription, setDraftDescription] = useState(block.description)
  const hasRequestedAutoStartRef = useRef(false)
  const lastDimensionsRef = useRef<TerminalDimensions | null>(null)
  const trimmedDraftName = draftName.trim()
  const terminalStateClassName =
    session.status === 'running'
      ? 'terminal-state terminal-state--running'
      : session.status === 'failed'
        ? 'terminal-state terminal-state--failed'
        : 'terminal-state'
  const terminalNodeClassName = [
    'terminal-node',
    isRunning ? 'terminal-node--running' : '',
    data.isSelected ? 'terminal-node--selected' : '',
    data.isNavigationHighlighted ? 'terminal-node--navigation-highlighted' : ''
  ]
    .filter(Boolean)
    .join(' ')

  const handleDimensionsChange = useCallback(
    (dimensions: TerminalDimensions) => {
      lastDimensionsRef.current = dimensions

      if (session.status === 'running') {
        data.onResize(block, dimensions)
        return
      }

      if (session.status === 'idle' && !session.sessionId && !hasRequestedAutoStartRef.current) {
        hasRequestedAutoStartRef.current = true
        data.onStart(block, dimensions)
      }
    },
    [block, data, session.sessionId, session.status]
  )

  useEffect(() => {
    if (session.status === 'idle' && !session.sessionId && !hasRequestedAutoStartRef.current) {
      const dimensions = lastDimensionsRef.current

      if (!dimensions) {
        return
      }

      hasRequestedAutoStartRef.current = true
      data.onStart(block, dimensions)
    }
  }, [block, data, session.sessionId, session.status])

  const startEditingMetadata = useCallback(() => {
    setDraftName(block.name)
    setDraftDescription(block.description)
    setIsEditingMetadata(true)
  }, [block.description, block.name])

  const saveMetadata = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      if (!trimmedDraftName) {
        return
      }

      await data.onUpdateMetadata(block, {
        name: trimmedDraftName,
        description: draftDescription.trim()
      })
      setIsEditingMetadata(false)
    },
    [block, data, draftDescription, trimmedDraftName]
  )

  return (
    <section className={terminalNodeClassName} data-terminal-block-id={block.id}>
      <Handle
        className="terminal-node__handle terminal-node__handle--input"
        type="target"
        position={Position.Left}
      />
      <div className="terminal-node__header">
        <span className="terminal-node__icon">
          <Terminal size={17} aria-hidden="true" />
        </span>
        <div className="terminal-node__title">
          <strong>{block.name}</strong>
          <span>{block.description}</span>
        </div>
        <div
          className="terminal-node__actions nodrag"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            className="terminal-node__action"
            type="button"
            aria-label={`${block.name} 编辑终端信息`}
            title="编辑终端信息"
            onClick={startEditingMetadata}
          >
            <Pencil size={14} aria-hidden="true" />
          </button>
          <button
            className="terminal-node__action"
            type="button"
            aria-label={`${block.name} 停止当前命令`}
            title="停止当前命令 (Ctrl+C)"
            disabled={!isRunning}
            onClick={() => data.onStop(block)}
          >
            <Square size={13} aria-hidden="true" />
          </button>
          <button
            className="terminal-node__action"
            type="button"
            aria-label={`${block.name} 重启终端`}
            title="重启终端"
            onClick={() => data.onRestart(block)}
          >
            <RotateCcw size={14} aria-hidden="true" />
          </button>
          <button
            className="terminal-node__action terminal-node__action--danger"
            type="button"
            aria-label={`${block.name} 删除终端`}
            title="删除终端"
            onClick={() => data.onDelete(block)}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
        <span className={terminalStateClassName}>
          {isRunning
            ? '运行中'
            : session.status === 'failed'
              ? '失败'
              : session.status === 'exited'
                ? '已退出'
                : '未启动'}
        </span>
      </div>
      {isEditingMetadata ? (
        <form
          className="terminal-metadata-form nodrag"
          onSubmit={saveMetadata}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <input
            aria-label="终端名称"
            value={draftName}
            onChange={(event) => setDraftName(event.currentTarget.value)}
          />
          <input
            aria-label="终端描述"
            value={draftDescription}
            onChange={(event) => setDraftDescription(event.currentTarget.value)}
          />
          <div className="terminal-metadata-form__actions">
            <button
              className="terminal-node__action terminal-node__action--confirm"
              type="submit"
              aria-label="保存终端信息"
              title="保存终端信息"
              disabled={!trimmedDraftName}
            >
              <Check size={14} aria-hidden="true" />
            </button>
            <button
              className="terminal-node__action"
              type="button"
              aria-label="取消编辑终端信息"
              title="取消编辑终端信息"
              onClick={() => {
                setDraftName(block.name)
                setDraftDescription(block.description)
                setIsEditingMetadata(false)
              }}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        </form>
      ) : null}
      <div className="terminal-frame">
        <TerminalViewport
          block={block}
          session={session}
          onDimensionsChange={handleDimensionsChange}
          onInput={data.onInput}
        />
      </div>
      <Handle
        className="terminal-node__handle terminal-node__handle--output"
        type="source"
        position={Position.Right}
      />
    </section>
  )
})

interface TerminalViewportProps {
  readonly block: TerminalBlockSnapshot
  readonly session: TerminalViewState
  readonly onDimensionsChange: (dimensions: TerminalDimensions) => void
  readonly onInput: (block: TerminalBlockSnapshot, input: string) => void
}

function TerminalViewport({ block, session, onDimensionsChange, onInput }: TerminalViewportProps) {
  const terminalElementRef = useRef<HTMLDivElement | null>(null)
  const outputMirrorRef = useRef<HTMLPreElement | null>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const outputTextRef = useRef(session.output)
  const blockRef = useRef(block)
  const sessionRef = useRef(session)
  const onDimensionsChangeRef = useRef(onDimensionsChange)
  const onInputRef = useRef(onInput)
  const shouldKeepTerminalFocusRef = useRef(false)

  useEffect(() => {
    blockRef.current = block
  }, [block])

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    onInputRef.current = onInput
  }, [onInput])

  useEffect(() => {
    onDimensionsChangeRef.current = onDimensionsChange
  }, [onDimensionsChange])

  useEffect(() => {
    if (outputMirrorRef.current) {
      outputMirrorRef.current.textContent = outputTextRef.current
    }
  })

  useEffect(() => {
    const appendOutput = (output: string): void => {
      outputTextRef.current = `${outputTextRef.current}${output}`

      if (outputMirrorRef.current) {
        outputMirrorRef.current.textContent = outputTextRef.current
      }

      xtermRef.current?.write(output, () => {
        if (sessionRef.current.status === 'running' && shouldKeepTerminalFocusRef.current) {
          xtermRef.current?.focus()
        }
      })
    }
    const handleTerminalOutput = (event: Event): void => {
      const outputEvent = (event as CustomEvent<TerminalOutputEvent>).detail

      if (outputEvent.sessionId !== sessionRef.current.sessionId) {
        return
      }

      appendOutput(outputEvent.data)
    }

    window.addEventListener(terminalOutputBrowserEventName, handleTerminalOutput)

    return () => window.removeEventListener(terminalOutputBrowserEventName, handleTerminalOutput)
  }, [])

  useEffect(() => {
    if (isTestRuntime() || !terminalElementRef.current) {
      return undefined
    }

    const terminalElement = terminalElementRef.current
    let lastReportedDimensions: TerminalDimensions | null = null
    const terminal = new XTerm({
      convertEol: true,
      cursorBlink: true,
      fontFamily: 'SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace',
      fontSize: 12,
      rows: 9,
      theme: {
        background: '#0b0f14',
        foreground: '#d7e2ee',
        cursor: '#f8fafc',
        green: '#49d17c',
        blue: '#60a5fa'
      }
    })
    const fitAddon = new FitAddon()
    const reportDimensions = (): void => {
      const dimensions = {
        columns: terminal.cols,
        rows: terminal.rows
      }

      if (
        dimensions.columns <= 0 ||
        dimensions.rows <= 0 ||
        (lastReportedDimensions?.columns === dimensions.columns &&
          lastReportedDimensions.rows === dimensions.rows)
      ) {
        return
      }

      lastReportedDimensions = dimensions
      onDimensionsChangeRef.current(dimensions)
    }
    const fitAndReportDimensions = (): void => {
      fitAddon.fit()
      reportDimensions()
    }

    terminal.loadAddon(fitAddon)
    terminal.open(terminalElement)
    xtermRef.current = terminal
    const focusTerminalElement = (): void => {
      shouldKeepTerminalFocusRef.current = true
      terminal.focus()
      terminalElement
        .querySelector<HTMLTextAreaElement>('.xterm-helper-textarea')
        ?.focus({ preventScroll: true })
    }

    terminalElement.addEventListener('pointerdown', focusTerminalElement, true)
    terminalElement.addEventListener('mousedown', focusTerminalElement, true)
    terminalElement.addEventListener('click', focusTerminalElement, true)
    fitAndReportDimensions()
    const resizeObserver = new ResizeObserver(() => {
      fitAndReportDimensions()
    })

    resizeObserver.observe(terminalElement)
    const dataSubscription = terminal.onData((input) => {
      shouldKeepTerminalFocusRef.current = true
      onInputRef.current(blockRef.current, input)
      terminal.focus()
    })

    return () => {
      terminalElement.removeEventListener('pointerdown', focusTerminalElement, true)
      terminalElement.removeEventListener('mousedown', focusTerminalElement, true)
      terminalElement.removeEventListener('click', focusTerminalElement, true)
      dataSubscription.dispose()
      resizeObserver.disconnect()
      terminal.dispose()
      xtermRef.current = null
    }
  }, [])

  useEffect(() => {
    const updateFocusPreference = (event: PointerEvent): void => {
      shouldKeepTerminalFocusRef.current = Boolean(
        terminalElementRef.current?.contains(event.target as globalThis.Node)
      )
    }

    document.addEventListener('pointerdown', updateFocusPreference, true)

    return () => document.removeEventListener('pointerdown', updateFocusPreference, true)
  }, [])

  const focusTerminal = useCallback(() => {
    shouldKeepTerminalFocusRef.current = true
    xtermRef.current?.focus()
    terminalElementRef.current
      ?.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea')
      ?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (session.status === 'running') {
      focusTerminal()
    }
  }, [focusTerminal, session.sessionId, session.status])

  if (isTestRuntime()) {
    return (
      <pre className="terminal-fallback" aria-label={`${block.name} 文本输出`}>
        {session.output}
      </pre>
    )
  }

  return (
    <div
      className="terminal-output-shell nodrag nopan nowheel"
      onPointerDownCapture={focusTerminal}
      onClickCapture={focusTerminal}
    >
      <div
        className="terminal-viewport nodrag nopan nowheel"
        ref={terminalElementRef}
        tabIndex={0}
        onPointerDown={focusTerminal}
        onClick={focusTerminal}
        onFocus={focusTerminal}
      />
      <pre
        className="terminal-output-mirror"
        ref={outputMirrorRef}
        aria-label={`${block.name} 文本输出`}
      />
    </div>
  )
}

function MinimapTerminalNode({
  id,
  x,
  y,
  width,
  height,
  borderRadius,
  className,
  color,
  strokeColor,
  strokeWidth,
  selected,
  onClick
}: MinimapTerminalNodeProps) {
  const { focusBlock, getLabel, setHoveredBlockId } = useContext(MinimapNodeInteractionContext)
  const label = getLabel(id)
  const statusColor = color ?? '#98a2b3'
  const effectiveStrokeColor = selected ? '#2563eb' : (strokeColor ?? '#9fb7ef')
  const effectiveStrokeWidth = selected
    ? Math.max(strokeWidth ?? 2, 4)
    : Math.max(strokeWidth ?? 2, 2)
  const headerHeight = Math.max(6, Math.min(height * 0.28, 18))
  const inset = Math.max(3, Math.min(width, height) * 0.08)
  const screenY = y + headerHeight + inset
  const screenHeight = Math.max(3, height - headerHeight - inset * 1.8)
  const activate = (event: SyntheticEvent<SVGGElement>): void => {
    event.stopPropagation()
    focusBlock(id)
    onClick?.(event as MouseEvent<SVGGElement>, id)
  }
  const activateFromKeyboard = (event: KeyboardEvent<SVGGElement>): void => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()
    activate(event)
  }

  return (
    <g
      className={className}
      role="button"
      tabIndex={0}
      aria-label={`聚焦终端 ${label}`}
      data-minimap-terminal-id={id}
      onMouseDown={activate}
      onClick={activate}
      onKeyDown={activateFromKeyboard}
      onMouseEnter={() => setHoveredBlockId(id)}
      onMouseLeave={() => setHoveredBlockId(null)}
    >
      <rect
        className="canvas-minimap__node-shell"
        x={x}
        y={y}
        width={width}
        height={height}
        rx={borderRadius}
        fill="#ffffff"
        stroke={effectiveStrokeColor}
        strokeWidth={effectiveStrokeWidth}
      />
      <rect
        className="canvas-minimap__node-header"
        x={x + inset}
        y={y + inset}
        width={Math.max(4, width - inset * 2)}
        height={Math.max(4, headerHeight - inset * 0.55)}
        rx={Math.max(2, borderRadius * 0.55)}
        fill={statusColor}
      />
      <circle
        className="canvas-minimap__node-status"
        cx={x + width - inset * 1.6}
        cy={y + inset + 2}
        r={Math.max(2, Math.min(4, inset * 0.8))}
        fill={statusColor}
      />
      <rect
        className="canvas-minimap__node-screen"
        x={x + inset}
        y={screenY}
        width={Math.max(4, width - inset * 2)}
        height={screenHeight}
        rx={Math.max(2, borderRadius * 0.45)}
        fill="#0b0f14"
      />
    </g>
  )
}

function AgentPanel() {
  return (
    <aside className="agent-panel" aria-label="Agent 面板">
      <div className="agent-panel__header">
        <span className="agent-panel__icon">
          <Bot size={17} aria-hidden="true" />
        </span>
        <strong>本地 Agent</strong>
        <span className="agent-panel__status">
          <span className="status-dot" />
          未接入
        </span>
      </div>
      <div className="agent-panel__body">
        <div className="agent-message agent-message--muted">本地 Agent 未接入。</div>
      </div>
    </aside>
  )
}

function createIdleTerminalState(): TerminalViewState {
  return {
    sessionId: null,
    status: 'idle',
    output: ''
  }
}

function getTerminalStatusColor(status: TerminalSessionStatus): string {
  switch (status) {
    case 'running':
      return '#22c55e'
    case 'failed':
      return '#ef4444'
    case 'exited':
      return '#94a3b8'
    case 'idle':
      return '#9fb7ef'
  }
}

function updateTerminalStatus(
  states: Record<string, TerminalViewState>,
  sessionId: string,
  status: TerminalSessionStatus
): Record<string, TerminalViewState> {
  return Object.fromEntries(
    Object.entries(states).map(([blockId, state]) => [
      blockId,
      state.sessionId === sessionId ? { ...state, status } : state
    ])
  )
}

function isTestRuntime(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom')
}
