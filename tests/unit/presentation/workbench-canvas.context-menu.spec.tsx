import { act, fireEvent, render, screen } from '@testing-library/react'
import type * as ReactFlowModule from '@xyflow/react'
import type { ReactNode } from 'react'

import type {
  BatchTerminalRemovalTargetSnapshot,
  BlockGraphSnapshot,
  QuickExecutionTargetSnapshot
} from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { WorkbenchCanvas } from '../../../src/presentation/app-shell/WorkbenchCanvas'
import { createAgentConsoleFlowNode } from '../../../src/presentation/app-shell/agentConsoleFlowNode'
import { createTerminalFlowNodes } from '../../../src/presentation/app-shell/terminalFlowNodes'
import { createTerminalWorkflowEdges } from '../../../src/presentation/app-shell/terminalWorkflowEdges'
import type {
  WorkbenchFlowNode,
  WorkbenchSnapshot
} from '../../../src/presentation/app-shell/types'
import type { useTerminalWorkflow } from '../../../src/presentation/app-shell/useTerminalWorkflow'
import { createWorkbenchNodeStore } from '../../../src/presentation/app-shell/workbenchNodeStore'

const reactFlowProps = vi.hoisted(() => ({
  latest: null as MockReactFlowProps | null
}))
const reactFlowSpies = vi.hoisted(() => ({
  getNodesBounds: vi.fn(() => ({ height: 700, width: 1_400, x: 100, y: 100 })),
  setViewport: vi.fn(async () => true)
}))

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactFlowModule>()
  const React = await import('react')

  return {
    ...actual,
    Background: () => null,
    Panel: ({ children }: { readonly children?: ReactNode }) =>
      React.createElement('div', null, children),
    ReactFlow: (props: MockReactFlowProps) => {
      reactFlowProps.latest = props
      const { onInit } = props
      React.useEffect(() => {
        onInit?.({
          getNode: (nodeId: string) =>
            reactFlowProps.latest?.nodes?.find((node) => node.id === nodeId),
          getNodesBounds: reactFlowSpies.getNodesBounds,
          getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
          setViewport: reactFlowSpies.setViewport
        })
      }, [onInit])
      return React.createElement(
        'div',
        { className: 'react-flow__pane', 'data-testid': 'pane' },
        props.children
      )
    }
  }
})

describe('workbench canvas object context menu', () => {
  beforeEach(() => {
    stubReducedMotionPreference()
    reactFlowProps.latest = null
    reactFlowSpies.getNodesBounds.mockClear()
    reactFlowSpies.setViewport.mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('selects an independent terminal and favorites only that terminal', () => {
    const onRequestSaveBlockTemplate = vi.fn()
    renderCanvas({ onRequestSaveBlockTemplate })

    openNodeContextMenu('standalone')

    expect(screen.getByRole('menu', { name: '终端操作' })).toBeInTheDocument()
    expect(contextSelectedNodeIds()).toEqual(['standalone'])

    fireEvent.click(screen.getByRole('menuitem', { name: '收藏终端' }))

    expect(onRequestSaveBlockTemplate).toHaveBeenCalledWith(['standalone'])
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(contextSelectedNodeIds()).toEqual([])
  })

  it('adds the context target to the next available quick execution slot', () => {
    const onAddQuickExecutionTarget = vi.fn()
    renderCanvas({ onAddQuickExecutionTarget })

    openNodeContextMenu('standalone')
    fireEvent.click(screen.getByRole('menuitem', { name: '添加到快捷执行栏' }))

    expect(onAddQuickExecutionTarget).toHaveBeenCalledWith({
      type: 'terminal',
      terminalBlockId: 'standalone'
    })
    expect(screen.queryByRole('dialog', { name: '选择快捷位' })).not.toBeInTheDocument()
  })

  it('removes a complete workflow directly from the same neutral context menu surface', () => {
    const onDeleteTerminalScope = vi.fn(async () => undefined)
    renderCanvas({ onDeleteTerminalScope })

    openNodeContextMenu('workflow-b')
    const removeItem = screen.getByRole('menuitem', { name: '移除流程' })

    expect(removeItem).toHaveClass('canvas-object-context-menu__item')
    expect(removeItem).not.toHaveClass('canvas-object-context-menu__item--danger')
    fireEvent.click(removeItem)

    expect(onDeleteTerminalScope).toHaveBeenCalledWith({
      type: 'workflow',
      terminalBlockIds: ['workflow-a', 'workflow-b', 'workflow-c']
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('removes a combination with the exact members shown by the context selection', () => {
    const onDeleteTerminalScope = vi.fn(async () => undefined)
    renderCanvas({ onDeleteTerminalScope })
    const groupHeader = document.createElement('div')
    groupHeader.className = 'terminal-group-node__header'

    openNodeContextMenu('combination', groupHeader)
    fireEvent.click(screen.getByRole('menuitem', { name: '移除组合' }))

    expect(onDeleteTerminalScope).toHaveBeenCalledWith({
      type: 'combination',
      terminalGroupId: 'combination',
      terminalBlockIds: ['combination-a', 'combination-b']
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not add a batch removal action for an independent terminal', () => {
    renderCanvas({ onDeleteTerminalScope: vi.fn() })

    openNodeContextMenu('standalone')

    expect(screen.queryByRole('menuitem', { name: /移除/ })).not.toBeInTheDocument()
  })

  it('fits a bound quick target into view without starting any workflow action', () => {
    const terminalWorkflow = createTerminalWorkflow(createGraph())
    renderCanvas({
      onAddQuickExecutionTarget: vi.fn(),
      quickExecutionTarget: {
        type: 'workflow',
        terminalBlockIds: ['workflow-a', 'workflow-b', 'workflow-c']
      },
      terminalWorkflow
    })

    fireEvent.click(
      screen.getByRole('button', {
        name: '快捷位 1：workflow-a → workflow-b → workflow-c，点击定位，仅支持快捷键执行'
      })
    )

    expect(reactFlowSpies.getNodesBounds).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'workflow-a' }),
      expect.objectContaining({ id: 'workflow-b' }),
      expect.objectContaining({ id: 'workflow-c' })
    ])
    expect(reactFlowSpies.setViewport).toHaveBeenCalledWith(expect.any(Object), { duration: 0 })
    expect(terminalWorkflow.start).not.toHaveBeenCalled()
    expect(terminalWorkflow.startScope).not.toHaveBeenCalled()
    expect(terminalWorkflow.startTerminalCombination).not.toHaveBeenCalled()
  })

  it('gives a quick-slot drop priority over the normal canvas layout commit', () => {
    const onQuickExecutionNodeDrop = vi.fn()
    const onNodeDragStop = vi.fn()
    renderCanvas({
      onAddQuickExecutionTarget: vi.fn(),
      onNodeDragStop,
      onQuickExecutionNodeDrop
    })
    const bar = document.querySelector<HTMLElement>('[data-quick-execution-bar]')!
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({
      bottom: 90,
      height: 50,
      left: 40,
      right: 160,
      top: 40,
      width: 120,
      x: 40,
      y: 40,
      toJSON: () => ({})
    })
    const node = findProjectedNode('standalone')
    const event = { clientX: 80, clientY: 70 } as MouseEvent

    act(() => {
      reactFlowProps.latest?.onNodeDragStart?.(event, node)
      reactFlowProps.latest?.onNodeDrag?.(event, node)
    })
    expect(bar).toHaveClass('quick-execution--drop-target')

    act(() => {
      reactFlowProps.latest?.onNodeDragStop?.(event, node)
    })

    expect(onQuickExecutionNodeDrop).toHaveBeenCalledWith(
      { type: 'terminal', terminalBlockId: 'standalone' },
      node
    )
    expect(onNodeDragStop).not.toHaveBeenCalled()
  })

  it.each(['workflow-a', 'workflow-b', 'workflow-c'])(
    'selects and favorites the complete workflow from %s',
    (nodeId) => {
      const onRequestSaveBlockTemplate = vi.fn()
      renderCanvas({ onRequestSaveBlockTemplate })

      openNodeContextMenu(nodeId)

      expect(screen.getByRole('menu', { name: '流程操作' })).toBeInTheDocument()
      expect(contextSelectedNodeIds()).toEqual(['workflow-a', 'workflow-b', 'workflow-c'])
      expect(contextSelectedConnectionIds()).toEqual(['connection-a-b', 'connection-b-c'])

      fireEvent.click(screen.getByRole('menuitem', { name: '收藏流程' }))

      expect(onRequestSaveBlockTemplate).toHaveBeenCalledWith([
        'workflow-a',
        'workflow-b',
        'workflow-c'
      ])
    }
  )

  it('selects a combination from the group node and favorites all exact members', () => {
    const onRequestSaveBlockTemplate = vi.fn()
    renderCanvas({ onRequestSaveBlockTemplate })
    const groupHeader = document.createElement('div')
    groupHeader.className = 'terminal-group-node__header'
    const groupTitle = document.createElement('strong')
    groupHeader.append(groupTitle)

    openNodeContextMenu('combination', groupTitle)

    expect(screen.getByRole('menu', { name: '组合操作' })).toBeInTheDocument()
    expect(contextSelectedNodeIds()).toEqual(['combination'])

    fireEvent.click(screen.getByRole('menuitem', { name: '收藏组合' }))

    expect(onRequestSaveBlockTemplate).toHaveBeenCalledWith(['combination-a', 'combination-b'])
  })

  it('context-selects an Agent without replacing the existing normal selection', () => {
    renderCanvas({ selectedTerminalBlockIds: ['standalone'] })

    openNodeContextMenu('agent:reviewer')

    expect(screen.getByRole('menu', { name: 'Reviewer 操作' })).toBeInTheDocument()
    expect(contextSelectedNodeIds()).toEqual(['agent:reviewer'])
    expect(normallySelectedNodeIds()).toEqual(['standalone'])

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(contextSelectedNodeIds()).toEqual([])
    expect(normallySelectedNodeIds()).toEqual(['standalone'])
  })

  it('does not treat collapsed combination member content as the combination frame or title', () => {
    renderCanvas()
    const groupSurface = document.createElement('section')
    groupSurface.className = 'terminal-group-node'
    const memberContent = document.createElement('div')
    memberContent.className = 'terminal-group-node__member'
    groupSurface.append(memberContent)
    const preventDefault = vi.fn()

    act(() => {
      reactFlowProps.latest?.onNodeContextMenu?.(
        {
          clientX: 320,
          clientY: 240,
          preventDefault,
          target: memberContent
        },
        findProjectedNode('combination')
      )
    })

    expect(preventDefault).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('clears only the temporary context selection on Escape, outside press, and pane click', () => {
    const onNodeClick = vi.fn()
    const onPaneClick = vi.fn()
    renderCanvas({
      onNodeClick,
      onPaneClick,
      selectedTerminalBlockIds: ['standalone']
    })

    openNodeContextMenu('workflow-b')
    expect(normallySelectedNodeIds()).toEqual(['standalone'])
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(contextSelectedNodeIds()).toEqual([])
    expect(normallySelectedNodeIds()).toEqual(['standalone'])

    openNodeContextMenu('workflow-b')
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    openNodeContextMenu('workflow-b')
    act(() => {
      reactFlowProps.latest?.onPaneClick?.()
    })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(onPaneClick).toHaveBeenCalledOnce()

    act(() => {
      const node = findProjectedNode('standalone')
      reactFlowProps.latest?.onNodeClick?.({}, node)
    })
    expect(onNodeClick).toHaveBeenCalledOnce()
  })
})

interface MockReactFlowProps {
  readonly children?: ReactNode
  readonly edges?: readonly { readonly id: string; readonly className?: string }[]
  readonly nodes?: readonly WorkbenchFlowNode[]
  readonly onInit?: (instance: {
    readonly getNode: (nodeId: string) => WorkbenchFlowNode | undefined
    readonly getNodesBounds: (nodes: readonly WorkbenchFlowNode[]) => {
      readonly height: number
      readonly width: number
      readonly x: number
      readonly y: number
    }
    readonly getViewport: () => { readonly x: number; readonly y: number; readonly zoom: number }
    readonly setViewport: typeof reactFlowSpies.setViewport
  }) => void
  readonly onNodeClick?: (event: object, node: WorkbenchFlowNode) => void
  readonly onNodeContextMenu?: (
    event: {
      readonly clientX: number
      readonly clientY: number
      preventDefault: () => void
      readonly target?: EventTarget | null
    },
    node: WorkbenchFlowNode
  ) => void
  readonly onPaneClick?: () => void
  readonly onNodeDrag?: (event: MouseEvent | TouchEvent, node: WorkbenchFlowNode) => void
  readonly onNodeDragStart?: (event: MouseEvent | TouchEvent, node: WorkbenchFlowNode) => void
  readonly onNodeDragStop?: (event: MouseEvent | TouchEvent, node: WorkbenchFlowNode) => void
}

function stubReducedMotionPreference(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  )
}

function renderCanvas({
  onNodeClick = vi.fn(),
  onPaneClick = vi.fn(),
  onRequestSaveBlockTemplate = vi.fn(),
  onDeleteTerminalScope,
  onAddQuickExecutionTarget,
  onNodeDragStop = vi.fn(),
  onQuickExecutionNodeDrop,
  quickExecutionTarget,
  terminalWorkflow,
  selectedTerminalBlockIds = []
}: {
  readonly onNodeClick?: (event: object, node: WorkbenchFlowNode) => void
  readonly onPaneClick?: () => void
  readonly onRequestSaveBlockTemplate?: (blockIds: readonly string[]) => void
  readonly onDeleteTerminalScope?: (
    target: BatchTerminalRemovalTargetSnapshot
  ) => Promise<void> | void
  readonly onAddQuickExecutionTarget?: (target: QuickExecutionTargetSnapshot) => void
  readonly onNodeDragStop?: (event: MouseEvent | TouchEvent, node: WorkbenchFlowNode) => void
  readonly onQuickExecutionNodeDrop?: (
    target: QuickExecutionTargetSnapshot,
    node: WorkbenchFlowNode
  ) => void
  readonly quickExecutionTarget?: QuickExecutionTargetSnapshot
  readonly terminalWorkflow?: ReturnType<typeof useTerminalWorkflow>
  readonly selectedTerminalBlockIds?: readonly string[]
} = {}): void {
  const baseGraph = createGraph()
  const graph: BlockGraphSnapshot = quickExecutionTarget
    ? {
        ...baseGraph,
        quickExecutionSlots: [
          { number: 1, target: quickExecutionTarget },
          { number: 2, target: null },
          { number: 3, target: null },
          { number: 4, target: null },
          { number: 5, target: null }
        ]
      }
    : baseGraph
  const terminalNodes = createTerminalFlowNodes({
    graph,
    handlers: {
      onDelete: vi.fn(),
      onInput: vi.fn(),
      onQuickLaunch: vi.fn(),
      onResize: vi.fn(),
      onResizeBlock: vi.fn(async () => undefined),
      onRestart: vi.fn(),
      onStart: vi.fn(),
      onStop: vi.fn(),
      onToggleTerminalGroupCandidate: vi.fn(),
      onUpdateDefinition: vi.fn(async () => undefined)
    },
    hoveredTerminalBlockId: null,
    selectedTerminalBlockIds,
    terminalStates: {}
  })
  const agentNode = createAgentConsoleFlowNode({
    agent: reviewerAgent,
    currentWorkbench: null,
    currentWorkspace: null,
    isSelected: false,
    onGraphUpdated: vi.fn(),
    onMcpCapabilityChange: vi.fn(async () => undefined),
    onRemove: vi.fn(async () => undefined),
    onRename: vi.fn(async () => undefined),
    onResize: vi.fn(async () => undefined),
    onSelect: vi.fn()
  })
  const nodes = [agentNode, ...terminalNodes]

  render(
    <WorkbenchCanvas
      shortcutTooltips={{
        addProject: '',
        createAgent: '',
        createBranchWorkspace: '',
        createTerminal: '',
        fitCanvas: '',
        groupTerminals: '',
        nextWorkspace: '',
        openSettings: '',
        previousWorkspace: '',
        selectCanvasNodeDown: '',
        selectCanvasNodeLeft: '',
        selectCanvasNodeRight: '',
        selectCanvasNodeUp: '',
        toggleMinimap: '',
        toggleSidebar: '',
        zoomCanvasIn: '',
        zoomCanvasOut: ''
      }}
      isDesktopRuntime
      terminalRuntimeAvailability={{
        phase: 'ready',
        epoch: 1,
        errorCode: null,
        retryable: false
      }}
      isMinimapCollapsed={false}
      currentWorkbench={createWorkbench(graph)}
      currentWorkspace={{
        workspaceId: 'main',
        directory: '/repo',
        gitBranch: null,
        workspaceKind: 'default',
        displayName: 'main',
        isCurrent: true
      }}
      nodeStore={createWorkbenchNodeStore(nodes)}
      nodeTypes={{}}
      reactFlowInstanceRef={{ current: null }}
      minimapNodeInteraction={{ getLabel: (id) => id, setHoveredBlockId: vi.fn() }}
      terminalWorkflow={terminalWorkflow ?? createTerminalWorkflow(graph)}
      onRequestSaveBlockTemplate={onRequestSaveBlockTemplate}
      onDeleteTerminalScope={onDeleteTerminalScope}
      onAddQuickExecutionTarget={onAddQuickExecutionTarget}
      onBindQuickExecutionSlot={onAddQuickExecutionTarget ? vi.fn() : undefined}
      onClearQuickExecutionSlot={onAddQuickExecutionTarget ? vi.fn() : undefined}
      onReorderQuickExecutionSlots={onAddQuickExecutionTarget ? vi.fn() : undefined}
      onQuickExecutionNodeDrop={onQuickExecutionNodeDrop}
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
      canBeginTerminalGroupSelection
      canCreateTerminalGroup={false}
      onNodesChange={vi.fn()}
      onNodeClick={onNodeClick}
      onPaneClick={onPaneClick}
      onNodeDrag={vi.fn()}
      onNodeDragStart={vi.fn()}
      onNodeDragStop={onNodeDragStop}
      onViewportChange={vi.fn()}
      onMinimapNodeClick={vi.fn()}
      onToggleMinimap={vi.fn()}
      getMiniMapNodeColor={() => '#fff'}
      getMiniMapNodeStrokeColor={() => '#000'}
      getMiniMapNodeClassName={() => ''}
    />
  )
}

function openNodeContextMenu(nodeId: string, target?: EventTarget): void {
  const preventDefault = vi.fn()
  act(() => {
    reactFlowProps.latest?.onNodeContextMenu?.(
      {
        clientX: 320,
        clientY: 240,
        preventDefault,
        target
      },
      findProjectedNode(nodeId)
    )
  })
  expect(preventDefault).toHaveBeenCalledOnce()
}

function findProjectedNode(nodeId: string): WorkbenchFlowNode {
  const node = reactFlowProps.latest?.nodes?.find((candidate) => candidate.id === nodeId)
  if (!node) throw new Error(`Missing projected node ${nodeId}`)
  return node
}

function contextSelectedNodeIds(): string[] {
  return (
    reactFlowProps.latest?.nodes
      ?.filter((node) => Boolean(node.data.isContextSelected))
      .map((node) => node.id) ?? []
  )
}

function normallySelectedNodeIds(): string[] {
  return reactFlowProps.latest?.nodes?.filter((node) => node.selected).map((node) => node.id) ?? []
}

function contextSelectedConnectionIds(): string[] {
  return (
    reactFlowProps.latest?.edges
      ?.filter((edge) => edge.className?.includes('terminal-workflow-edge--context-selected'))
      .map((edge) => edge.id) ?? []
  )
}

function createWorkbench(graph: BlockGraphSnapshot): WorkbenchSnapshot {
  return {
    agents: [reviewerAgent],
    gitBranches: [],
    graph,
    project: {
      id: 'project-1',
      name: 'Project',
      directory: '/repo',
      workspaces: [
        {
          workspaceId: 'main',
          directory: '/repo',
          gitBranch: null,
          workspaceKind: 'default',
          displayName: 'main',
          isCurrent: true
        }
      ]
    }
  }
}

const reviewerAgent = {
  agentId: 'reviewer',
  cleancodeMcpEnabled: true,
  layout: {
    position: { x: -480, y: 0 },
    size: { width: 420, height: 360 }
  },
  name: 'Reviewer',
  projectId: 'project-1',
  providerId: 'codex',
  workspaceId: 'main'
} as const

function createTerminalWorkflow(graph: BlockGraphSnapshot): ReturnType<typeof useTerminalWorkflow> {
  return {
    activeRootBlockIds: [],
    connect: vi.fn(async () => undefined),
    deleteEdges: vi.fn(async () => undefined),
    edges: createTerminalWorkflowEdges(graph, {}),
    isActive: false,
    isStopping: false,
    nodeStatuses: {},
    run: null,
    start: vi.fn(async () => undefined),
    startScope: vi.fn(async () => undefined),
    startTerminalCombination: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    updateExecutionConfig: vi.fn(async () => undefined)
  }
}

function createGraph(): BlockGraphSnapshot {
  return {
    id: 'graph-1',
    projectId: 'project-1',
    workspaceId: 'main',
    viewport: { x: 0, y: 0, zoom: 1 },
    blocks: [
      createBlock('workflow-a', 0),
      createBlock('workflow-b', 400),
      createBlock('workflow-c', 800),
      createBlock('standalone', 1200),
      createBlock('combination-a', 1600),
      createBlock('combination-b', 2000)
    ],
    connections: [
      {
        id: 'connection-a-b',
        sourceBlockId: 'workflow-a',
        targetBlockId: 'workflow-b'
      },
      {
        id: 'connection-b-c',
        sourceBlockId: 'workflow-b',
        targetBlockId: 'workflow-c'
      }
    ],
    terminalGroups: [
      {
        id: 'combination',
        type: 'terminal-group',
        name: 'Combination',
        position: { x: 1580, y: -20 },
        size: { width: 760, height: 340 },
        isCollapsed: false,
        memberBlockIds: ['combination-a', 'combination-b']
      }
    ],
    quickExecutionSlots: [
      { number: 1, target: null },
      { number: 2, target: null },
      { number: 3, target: null },
      { number: 4, target: null },
      { number: 5, target: null }
    ]
  }
}

function createBlock(id: string, x: number): BlockGraphSnapshot['blocks'][number] {
  return {
    id,
    type: 'terminal',
    name: id,
    description: '',
    launchCommand: `pnpm ${id}`,
    position: { x, y: 0 },
    size: { width: 320, height: 240 }
  }
}
