import { act, fireEvent, render, screen } from '@testing-library/react'
import type * as ReactFlowModule from '@xyflow/react'
import type { ReactNode } from 'react'

import type { BlockTemplateSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockTemplateSnapshot'
import type { CanvasArrangementSnapshot } from '../../../src/contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'
import type { CanvasArrangementSelectionItem } from '../../../src/presentation/app-shell/canvasArrangementSelection'
import { createTerminalFlowNodes } from '../../../src/presentation/app-shell/terminalFlowNodes'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types'
import { WorkbenchCanvas } from '../../../src/presentation/app-shell/WorkbenchCanvas'
import { createWorkbenchNodeStore } from '../../../src/presentation/app-shell/workbenchNodeStore'

const reactFlowProps = vi.hoisted(() => ({
  latest: null as MockReactFlowProps | null
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
          getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
          setViewport: async () => undefined,
          screenToFlowPosition: (position: { readonly x: number; readonly y: number }) => position
        })
      }, [onInit])
      return React.createElement(
        'div',
        { className: 'react-flow__pane', 'data-testid': 'pane' },
        props.children,
        props.nodes?.map((node) =>
          React.createElement('div', {
            className: ['react-flow__node', node.className].filter(Boolean).join(' '),
            'data-testid': `flow-node-${node.id}`,
            key: node.id
          })
        )
      )
    }
  }
})

describe('workbench canvas Command selection and block template placement', () => {
  beforeEach(() => {
    reactFlowProps.latest = null
  })

  it('replaces Command-drag favorite with restrained stack and grid actions', () => {
    const onArrangeCanvasSelection = vi.fn()
    const onRequestSaveBlockTemplate = vi.fn()
    renderCanvas({ onArrangeCanvasSelection, onRequestSaveBlockTemplate })
    const pane = screen.getByTestId('pane')

    fireEvent.pointerDown(pane, {
      button: 0,
      clientX: 80,
      clientY: 80,
      metaKey: true,
      pointerId: 1
    })
    fireEvent.pointerMove(pane, { clientX: 600, clientY: 500, pointerId: 1 })
    fireEvent.pointerUp(pane, { clientX: 600, clientY: 500, pointerId: 1 })

    expect(screen.getByRole('toolbar', { name: '整理所选画布对象' })).toBeInTheDocument()
    expect(screen.queryByText('收藏所选内容')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '堆叠所选对象' }))
    expect(onArrangeCanvasSelection).toHaveBeenCalledWith(
      'stack',
      expect.arrayContaining([
        expect.objectContaining({ key: 'terminal:terminal-a' }),
        expect.objectContaining({ key: 'terminal:terminal-b' })
      ])
    )
    expect(onRequestSaveBlockTemplate).not.toHaveBeenCalled()
  })

  it('previews every intersecting object while dragging and removes only the marquee on release', () => {
    renderCanvas({ onArrangeCanvasSelection: vi.fn() })
    const pane = screen.getByTestId('pane')

    fireEvent.pointerDown(pane, {
      button: 0,
      clientX: 290,
      clientY: 200,
      metaKey: true,
      pointerId: 1
    })
    fireEvent.pointerMove(pane, { clientX: 460, clientY: 360, pointerId: 1 })

    expect(document.querySelector('.canvas-arrangement-selection')).toBeInTheDocument()
    expect(screen.getByTestId('flow-node-terminal-a')).toHaveClass(
      'canvas-arrangement-node--selected'
    )
    expect(screen.getByTestId('flow-node-terminal-b')).toHaveClass(
      'canvas-arrangement-node--selected'
    )
    expect(screen.queryByRole('toolbar', { name: '整理所选画布对象' })).not.toBeInTheDocument()

    fireEvent.pointerUp(pane, { clientX: 460, clientY: 360, pointerId: 1 })

    expect(document.querySelector('.canvas-arrangement-selection')).not.toBeInTheDocument()
    expect(screen.getByTestId('flow-node-terminal-a')).toHaveClass(
      'canvas-arrangement-node--selected'
    )
    expect(screen.getByTestId('flow-node-terminal-b')).toHaveClass(
      'canvas-arrangement-node--selected'
    )
    expect(screen.getByRole('toolbar', { name: '整理所选画布对象' })).toBeInTheDocument()
  })

  it('places the whole template at the nearest free origin and stays quiet', () => {
    const onPlaceBlockTemplate = vi.fn(async () => undefined)
    const onPaneClick = vi.fn()
    renderCanvas({
      onPaneClick,
      onPlaceBlockTemplate,
      placementTemplate: createTemplate()
    })
    const pane = screen.getByTestId('pane')

    fireEvent.pointerMove(pane, { clientX: 500, clientY: 400 })
    fireEvent.click(pane, { clientX: 500, clientY: 400 })

    expect(onPlaceBlockTemplate).toHaveBeenCalledWith({ x: 614, y: 350 })
    expect(onPaneClick).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/碰撞|重叠|避让/)).not.toBeInTheDocument()
  })

  it('previews a stack as one draggable object and restores every member when commit fails', async () => {
    const onMoveCanvasStack = vi.fn(async () => false)
    const onCancelNodeDrag = vi.fn()
    const nodeStore = renderCanvas({
      canvasArrangement: {
        projectId: 'project-1',
        workspaceId: 'main',
        stacks: [
          {
            id: 'stack-1',
            anchor: { x: 100, y: 100 },
            items: [
              { kind: 'terminal', terminalId: 'terminal-a' },
              { kind: 'terminal', terminalId: 'terminal-b' }
            ]
          }
        ]
      },
      onCancelNodeDrag,
      onMoveCanvasStack
    })
    const activeNode = nodeStore.getNodes().find((node) => node.id === 'terminal-a')!
    const movedNode = { ...activeNode, position: { x: 150, y: 140 } }

    act(() => {
      reactFlowProps.latest?.onNodeDragStart?.({} as MouseEvent, activeNode)
      reactFlowProps.latest?.onNodeDrag?.({} as MouseEvent, movedNode)
    })

    expect(nodeStore.getNodes().find((node) => node.id === 'terminal-a')?.position).toEqual({
      x: 150,
      y: 140
    })
    expect(nodeStore.getNodes().find((node) => node.id === 'terminal-b')?.position).toEqual({
      x: 500,
      y: 390
    })

    await act(async () => {
      reactFlowProps.latest?.onNodeDragStop?.({} as MouseEvent, movedNode)
      await Promise.resolve()
    })

    expect(onCancelNodeDrag).toHaveBeenCalledWith('terminal-a')
    expect(onMoveCanvasStack).toHaveBeenCalledWith(
      'stack-1',
      { x: 100, y: 100 },
      { x: 150, y: 140 },
      expect.arrayContaining([
        expect.objectContaining({ key: 'terminal:terminal-a' }),
        expect.objectContaining({ key: 'terminal:terminal-b' })
      ])
    )
    expect(nodeStore.getNodes().find((node) => node.id === 'terminal-a')?.position).toEqual({
      x: 100,
      y: 100
    })
    expect(nodeStore.getNodes().find((node) => node.id === 'terminal-b')?.position).toEqual({
      x: 450,
      y: 350
    })
  })
})

interface MockReactFlowProps {
  readonly children?: ReactNode
  readonly nodes?: readonly WorkbenchFlowNode[]
  readonly onInit?: (instance: {
    readonly getViewport: () => { readonly x: number; readonly y: number; readonly zoom: number }
    readonly setViewport: () => Promise<void>
    readonly screenToFlowPosition: (position: { readonly x: number; readonly y: number }) => {
      readonly x: number
      readonly y: number
    }
  }) => void
  readonly onPaneClick?: (event: MouseEvent) => void
  readonly onNodeDrag?: (event: MouseEvent, node: WorkbenchFlowNode) => void
  readonly onNodeDragStart?: (event: MouseEvent, node: WorkbenchFlowNode) => void
  readonly onNodeDragStop?: (event: MouseEvent, node: WorkbenchFlowNode) => void
}

function renderCanvas({
  onPaneClick = vi.fn(),
  onArrangeCanvasSelection,
  canvasArrangement = { projectId: 'project-1', workspaceId: 'main', stacks: [] },
  onCancelNodeDrag,
  onMoveCanvasStack,
  onPlaceBlockTemplate,
  onRequestSaveBlockTemplate,
  placementTemplate
}: {
  readonly onPaneClick?: () => void
  readonly onArrangeCanvasSelection?: (
    action: 'expand' | 'grid' | 'stack',
    items: readonly unknown[]
  ) => void
  readonly canvasArrangement?: CanvasArrangementSnapshot
  readonly onCancelNodeDrag?: (nodeId: string) => void
  readonly onMoveCanvasStack?: (
    stackId: string,
    previousAnchor: { readonly x: number; readonly y: number },
    nextAnchor: { readonly x: number; readonly y: number },
    items: readonly CanvasArrangementSelectionItem[]
  ) => Promise<boolean> | boolean
  readonly onPlaceBlockTemplate?: (origin: { readonly x: number; readonly y: number }) => void
  readonly onRequestSaveBlockTemplate?: (blockIds: readonly string[]) => void
  readonly placementTemplate?: BlockTemplateSnapshot
}) {
  const graph = createGraph()
  const nodes = createTerminalFlowNodes({
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
    terminalStates: {}
  })

  const nodeStore = createWorkbenchNodeStore(nodes)
  render(
    <WorkbenchCanvas
      shortcutPlatform="mac"
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
      currentWorkbench={{
        agents: [],
        canvasArrangement,
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
      }}
      currentWorkspace={{
        workspaceId: 'main',
        directory: '/repo',
        gitBranch: null,
        workspaceKind: 'default',
        displayName: 'main',
        isCurrent: true
      }}
      nodeStore={nodeStore}
      nodeTypes={{}}
      reactFlowInstanceRef={{ current: null }}
      minimapNodeInteraction={{ getLabel: (id) => id, setHoveredBlockId: vi.fn() }}
      placementTemplate={placementTemplate}
      onPlaceBlockTemplate={onPlaceBlockTemplate}
      onRequestSaveBlockTemplate={onRequestSaveBlockTemplate}
      onArrangeCanvasSelection={onArrangeCanvasSelection}
      onMoveCanvasStack={onMoveCanvasStack}
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
      onNodeClick={vi.fn()}
      onPaneClick={onPaneClick}
      onNodeDrag={vi.fn()}
      onNodeDragStart={vi.fn()}
      onCancelNodeDrag={onCancelNodeDrag}
      onNodeDragStop={vi.fn()}
      onViewportChange={vi.fn()}
      onMinimapNodeClick={vi.fn()}
      onToggleMinimap={vi.fn()}
      getMiniMapNodeColor={() => '#fff'}
      getMiniMapNodeStrokeColor={() => '#000'}
      getMiniMapNodeClassName={() => ''}
    />
  )
  return nodeStore
}

function createGraph() {
  return {
    id: 'graph-1',
    projectId: 'project-1',
    workspaceId: 'main',
    viewport: { x: 0, y: 0, zoom: 1 },
    blocks: [
      {
        id: 'terminal-a',
        type: 'terminal' as const,
        name: 'A',
        description: '',
        launchCommand: 'pnpm a',
        position: { x: 100, y: 100 },
        size: { width: 200, height: 120 }
      },
      {
        id: 'terminal-b',
        type: 'terminal' as const,
        name: 'B',
        description: '',
        launchCommand: 'pnpm b',
        position: { x: 450, y: 350 },
        size: { width: 100, height: 100 }
      }
    ],
    connections: [],
    terminalGroups: []
  }
}

function createTemplate(): BlockTemplateSnapshot {
  return {
    id: 'template-1',
    type: 'terminal',
    name: 'New',
    description: '',
    scope: { type: 'global' },
    createdAt: '2026-07-30T00:00:00.000Z',
    updatedAt: '2026-07-30T00:00:00.000Z',
    nodes: [
      {
        templateNodeId: 'node-1',
        name: 'New',
        description: '',
        launchCommand: 'pnpm new',
        executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null },
        position: { x: 0, y: 0 },
        size: { width: 100, height: 100 }
      }
    ],
    connections: []
  }
}
