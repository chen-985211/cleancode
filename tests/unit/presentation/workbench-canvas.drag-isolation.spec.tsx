import { act, render } from '@testing-library/react'
import type { NodeChange } from '@xyflow/react'
import type * as ReactFlowModule from '@xyflow/react'
import type { ReactNode } from 'react'
import type * as WorkbenchViewportMotionModule from '../../../src/presentation/app-shell/workbenchViewportMotion'
import type * as WorkbenchDirectZoomModule from '../../../src/presentation/app-shell/workbenchDirectZoom'

import { createAgentConsoleFlowNode } from '../../../src/presentation/app-shell/projections/agentConsoleFlowNode'
import { createTerminalFlowNodes } from '../../../src/presentation/app-shell/projections/terminalFlowNodes'
import type { AgentConsoleFlowNode } from '../../../src/presentation/app-shell/types/agentConsoleFlowNode'
import type { TerminalFlowNode } from '../../../src/presentation/app-shell/types/terminalFlowNode'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import { WorkbenchCanvas } from '../../../src/presentation/app-shell/WorkbenchCanvas'
import { createWorkbenchNodeStore } from '../../../src/presentation/app-shell/workbenchNodeStore'

const reactFlowProps = vi.hoisted(() => ({
  latest: null as MockReactFlowProps | null,
  renderCount: 0
}))
const viewportMotionSpies = vi.hoisted(() => ({
  cancel: vi.fn()
}))
const directZoomSpies = vi.hoisted(() => ({
  cancel: vi.fn()
}))

vi.mock('../../../src/presentation/app-shell/workbenchDirectZoom', async (importOriginal) => ({
  ...(await importOriginal<typeof WorkbenchDirectZoomModule>()),
  cancelWorkbenchDirectZoom: directZoomSpies.cancel
}))

vi.mock('../../../src/presentation/app-shell/workbenchViewportMotion', async (importOriginal) => ({
  ...(await importOriginal<typeof WorkbenchViewportMotionModule>()),
  cancelWorkbenchViewportMotion: viewportMotionSpies.cancel
}))

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactFlowModule>()
  const React = await import('react')

  return {
    ...actual,
    Background: () => null,
    Controls: () => null,
    Panel: ({ children }: { readonly children?: ReactNode }) =>
      React.createElement('div', null, children),
    ReactFlow: (props: MockReactFlowProps) => {
      reactFlowProps.renderCount += 1
      reactFlowProps.latest = props
      return React.createElement('div', null, props.children)
    }
  }
})

describe('workbench canvas drag isolation', () => {
  beforeEach(() => {
    reactFlowProps.latest = null
    reactFlowProps.renderCount = 0
    viewportMotionSpies.cancel.mockClear()
    directZoomSpies.cancel.mockClear()
  })

  it('does not move an Agent when dragging a selected terminal', () => {
    const { agentNode, terminalNode } = createNodes()
    const onNodesChange = vi.fn()
    renderCanvas([agentNode, terminalNode], onNodesChange)
    const terminalChange = createPositionChange(terminalNode.id, 480, 260)
    const agentChange = createPositionChange(agentNode.id, 680, 260)

    act(() => {
      reactFlowProps.latest?.onNodeDragStart?.({} as MouseEvent, terminalNode)
      reactFlowProps.latest?.onNodesChange?.([terminalChange, agentChange])
    })

    expect(onNodesChange).toHaveBeenCalledWith([terminalChange])
  })

  it('does not move a terminal when dragging an Agent', () => {
    const { agentNode, terminalNode } = createNodes()
    const onNodesChange = vi.fn()
    renderCanvas([agentNode, terminalNode], onNodesChange)
    const agentChange = createPositionChange(agentNode.id, 680, 260)
    const terminalChange = createPositionChange(terminalNode.id, 480, 260)

    act(() => {
      reactFlowProps.latest?.onNodeDragStart?.({} as MouseEvent, agentNode)
      reactFlowProps.latest?.onNodesChange?.([agentChange, terminalChange])
    })

    expect(onNodesChange).toHaveBeenCalledWith([agentChange])
  })

  it('preserves intentional movement of multiple selected terminals', () => {
    const { agentNode, terminalNode } = createNodes()
    const secondTerminalNode: TerminalFlowNode = {
      ...terminalNode,
      id: 'terminal-2',
      position: { x: 760, y: 200 },
      data: {
        ...terminalNode.data,
        block: {
          ...terminalNode.data.block,
          id: 'terminal-2',
          position: { x: 760, y: 200 }
        }
      }
    }
    const onNodesChange = vi.fn()
    renderCanvas([agentNode, terminalNode, secondTerminalNode], onNodesChange)
    const firstChange = createPositionChange(terminalNode.id, 480, 260)
    const secondChange = createPositionChange(secondTerminalNode.id, 920, 260)

    act(() => {
      reactFlowProps.latest?.onNodeDragStart?.({} as MouseEvent, terminalNode)
      reactFlowProps.latest?.onNodesChange?.([firstChange, secondChange])
    })

    expect(onNodesChange).toHaveBeenCalledWith([firstChange, secondChange])
  })

  it('delegates multi-selection to the typed workbench selection model', () => {
    const { agentNode, terminalNode } = createNodes()

    renderCanvas([agentNode, terminalNode], vi.fn())

    expect(reactFlowProps.latest?.multiSelectionKeyCode).toBeNull()
    expect(reactFlowProps.latest?.selectionKeyCode).toBeNull()
  })

  it('delegates empty canvas clicks to the workbench selection model', () => {
    const { agentNode, terminalNode } = createNodes()
    const onPaneClick = vi.fn()

    renderCanvas([agentNode, terminalNode], vi.fn(), onPaneClick)

    act(() => {
      reactFlowProps.latest?.onPaneClick?.()
    })

    expect(onPaneClick).toHaveBeenCalledOnce()
  })

  it('reports only user-originated viewport movement', () => {
    const { agentNode, terminalNode } = createNodes()
    const onViewportInteractionStart = vi.fn()

    renderCanvas([agentNode, terminalNode], vi.fn(), vi.fn(), onViewportInteractionStart)

    act(() => {
      reactFlowProps.latest?.onMoveStart?.(null)
      reactFlowProps.latest?.onMoveStart?.({} as MouseEvent)
    })

    expect(onViewportInteractionStart).toHaveBeenCalledOnce()
    expect(viewportMotionSpies.cancel).toHaveBeenCalledOnce()
    expect(directZoomSpies.cancel).toHaveBeenCalledOnce()
  })

  it('leaves wheel zoom to the anchored direct zoom controller', () => {
    const { agentNode, terminalNode } = createNodes()

    renderCanvas([agentNode, terminalNode], vi.fn())

    expect(reactFlowProps.latest?.zoomOnScroll).toBe(false)
  })

  it('keeps viewport presentation frames out of the React Flow tree until detail changes', () => {
    const { agentNode, terminalNode } = createNodes()

    renderCanvas([agentNode, terminalNode], vi.fn())
    const initialRenderCount = reactFlowProps.renderCount
    const initialNodes = reactFlowProps.latest?.nodes

    act(() => {
      reactFlowProps.latest?.onMove?.(new MouseEvent('mousemove'), {
        x: -80,
        y: 40,
        zoom: 0.96
      })
      reactFlowProps.latest?.onMove?.(new MouseEvent('mousemove'), {
        x: -160,
        y: 80,
        zoom: 0.9
      })
    })

    expect(reactFlowProps.renderCount).toBe(initialRenderCount)
    expect(reactFlowProps.latest?.nodes).toBe(initialNodes)

    act(() => {
      reactFlowProps.latest?.onMove?.(new MouseEvent('mousemove'), {
        x: -240,
        y: 120,
        zoom: 0.72
      })
    })

    expect(reactFlowProps.renderCount).toBe(initialRenderCount + 1)
    expect(document.querySelector('.canvas-surface')).toHaveAttribute(
      'data-canvas-detail',
      'compact'
    )
  })
})

interface MockReactFlowProps {
  readonly children?: ReactNode
  readonly multiSelectionKeyCode?: string | null
  readonly nodes?: WorkbenchFlowNode[]
  readonly onNodeDragStart?: (event: MouseEvent, node: WorkbenchFlowNode) => void
  readonly onNodesChange?: (changes: NodeChange<WorkbenchFlowNode>[]) => void
  readonly onMove?: (
    event: MouseEvent | null,
    viewport: { readonly x: number; readonly y: number; readonly zoom: number }
  ) => void
  readonly onPaneClick?: () => void
  readonly onMoveStart?: (event: MouseEvent | null) => void
  readonly selectionKeyCode?: string | null
  readonly zoomOnScroll?: boolean
}

function renderCanvas(
  nodes: WorkbenchFlowNode[],
  onNodesChange: (changes: NodeChange<WorkbenchFlowNode>[]) => void,
  onPaneClick = vi.fn(),
  onViewportInteractionStart = vi.fn()
): void {
  const nodeStore = createWorkbenchNodeStore(nodes)

  render(
    <WorkbenchCanvas
      shortcutTooltips={{
        openSettings: '打开设置 (⌘,)',
        toggleSidebar: '切换侧边栏 (⌘B)',
        addProject: '添加项目 (⌘O)',
        createBranchWorkspace: '新建分支工作区 (⌘N)',
        previousWorkspace: '上一个工作区 (⌘⇧↑)',
        nextWorkspace: '下一个工作区 (⌘⇧↓)',
        createTerminal: '新建终端积木 (⌘T)',
        createAgent: '新建 Agent (⌘⇧A)',
        groupTerminals: '组合终端 (⌘G)',
        selectCanvasNodeLeft: '选择左侧节点 (⌘←)',
        selectCanvasNodeRight: '选择右侧节点 (⌘→)',
        selectCanvasNodeUp: '选择上方节点 (⌘↑)',
        selectCanvasNodeDown: '选择下方节点 (⌘↓)',
        zoomCanvasIn: '放大画布 (⌘])',
        zoomCanvasOut: '缩小画布 (⌘[)',
        fitCanvas: '适应画布 (⌘1)',
        toggleMinimap: '收起或展开小地图 (⌘⇧M)'
      }}
      isDesktopRuntime={true}
      terminalRuntimeAvailability={{
        phase: 'ready',
        epoch: 1,
        errorCode: null,
        retryable: false
      }}
      isMinimapCollapsed={false}
      currentWorkbench={null}
      currentWorkspace={undefined}
      nodeStore={nodeStore}
      nodeTypes={{}}
      reactFlowInstanceRef={{ current: null }}
      minimapNodeInteraction={{ getLabel: (id) => id, setHoveredBlockId: vi.fn() }}
      onCreateTerminalBlock={vi.fn()}
      onCreateWorkspaceAgent={vi.fn()}
      onZoomCanvasIn={vi.fn()}
      onZoomCanvasOut={vi.fn()}
      onFitCanvas={vi.fn()}
      onBeginTerminalGroupSelection={vi.fn()}
      onCreateTerminalGroup={vi.fn()}
      onCancelTerminalGroupSelection={vi.fn()}
      isTerminalGroupSelectionMode={false}
      selectedTerminalGroupCandidateCount={0}
      canBeginTerminalGroupSelection={true}
      canCreateTerminalGroup={false}
      onNodesChange={onNodesChange}
      onNodeClick={vi.fn()}
      onPaneClick={onPaneClick}
      onNodeDrag={vi.fn()}
      onNodeDragStart={vi.fn()}
      onNodeDragStop={vi.fn()}
      onViewportChange={vi.fn()}
      onViewportInteractionStart={onViewportInteractionStart}
      onMinimapNodeClick={vi.fn()}
      onToggleMinimap={vi.fn()}
      getMiniMapNodeColor={() => '#fff'}
      getMiniMapNodeStrokeColor={() => '#000'}
      getMiniMapNodeClassName={() => ''}
    />
  )
}

function createNodes(): {
  readonly agentNode: AgentConsoleFlowNode
  readonly terminalNode: TerminalFlowNode
} {
  const [terminalNode] = createTerminalFlowNodes({
    graph: {
      id: 'graph-1',
      projectId: 'project-1',
      workspaceId: 'main',
      viewport: { x: 0, y: 0, zoom: 1 },
      blocks: [
        {
          id: 'terminal-1',
          type: 'terminal',
          name: 'Terminal 1',
          description: '',
          launchCommand: '',
          position: { x: 320, y: 200 },
          size: { width: 420, height: 306 }
        }
      ],
      terminalGroups: []
    },
    handlers: createTerminalHandlers(),
    hoveredTerminalBlockId: null,
    terminalStates: {}
  })
  const agentNode = createAgentConsoleFlowNode({
    agent: {
      agentId: 'agent-1',
      cleancodeMcpEnabled: true,
      name: 'Agent 1',
      projectId: 'project-1',
      providerId: 'codex',
      workspaceId: 'main',
      layout: {
        position: { x: 560, y: 200 },
        size: { width: 440, height: 520 }
      }
    },
    currentWorkbench: null,
    currentWorkspace: null,
    isSelected: true,
    onGraphUpdated: vi.fn(),
    onMcpCapabilityChange: vi.fn(async () => undefined),
    onRemove: vi.fn(),
    onRename: vi.fn(),
    onResize: vi.fn()
  })

  return {
    agentNode,
    terminalNode: terminalNode as TerminalFlowNode
  }
}

function createPositionChange(id: string, x: number, y: number): NodeChange<WorkbenchFlowNode> {
  return { id, type: 'position', position: { x, y }, dragging: true }
}

function createTerminalHandlers() {
  return {
    onStart: vi.fn(),
    onStop: vi.fn(),
    onQuickLaunch: vi.fn(),
    onRestart: vi.fn(),
    onDelete: vi.fn(),
    onUpdateDefinition: vi.fn(),
    onInput: vi.fn(),
    onResize: vi.fn(),
    onResizeBlock: vi.fn(async () => undefined),
    onToggleTerminalGroupCandidate: vi.fn()
  }
}
