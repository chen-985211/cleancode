import { fireEvent, render, screen } from '@testing-library/react'
import type * as ReactFlowModule from '@xyflow/react'
import type { ReactNode } from 'react'

import type { BlockTemplateSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockTemplateSnapshot'
import { createTerminalFlowNodes } from '../../../src/presentation/app-shell/terminalFlowNodes'
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
        props.children
      )
    }
  }
})

describe('workbench canvas block template interaction', () => {
  beforeEach(() => {
    reactFlowProps.latest = null
  })

  it('enters lasso selection only for Command-drag on macOS blank canvas', () => {
    const onRequestSaveBlockTemplate = vi.fn()
    renderCanvas({ onRequestSaveBlockTemplate })
    const pane = screen.getByTestId('pane')

    fireEvent.pointerDown(pane, {
      button: 0,
      clientX: 80,
      clientY: 80,
      metaKey: true,
      pointerId: 1
    })
    fireEvent.pointerMove(pane, { clientX: 350, clientY: 250, pointerId: 1 })
    fireEvent.pointerUp(pane, { clientX: 350, clientY: 250, pointerId: 1 })

    fireEvent.click(screen.getByRole('button', { name: '收藏所选内容' }))
    expect(onRequestSaveBlockTemplate).toHaveBeenCalledWith(['terminal-a'])
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
})

interface MockReactFlowProps {
  readonly children?: ReactNode
  readonly onInit?: (instance: {
    readonly getViewport: () => { readonly x: number; readonly y: number; readonly zoom: number }
    readonly setViewport: () => Promise<void>
    readonly screenToFlowPosition: (position: { readonly x: number; readonly y: number }) => {
      readonly x: number
      readonly y: number
    }
  }) => void
  readonly onPaneClick?: (event: MouseEvent) => void
}

function renderCanvas({
  onPaneClick = vi.fn(),
  onPlaceBlockTemplate,
  onRequestSaveBlockTemplate,
  placementTemplate
}: {
  readonly onPaneClick?: () => void
  readonly onPlaceBlockTemplate?: (origin: { readonly x: number; readonly y: number }) => void
  readonly onRequestSaveBlockTemplate?: (blockIds: readonly string[]) => void
  readonly placementTemplate?: BlockTemplateSnapshot
}): void {
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
      nodeStore={createWorkbenchNodeStore(nodes)}
      nodeTypes={{}}
      reactFlowInstanceRef={{ current: null }}
      minimapNodeInteraction={{ getLabel: (id) => id, setHoveredBlockId: vi.fn() }}
      placementTemplate={placementTemplate}
      onPlaceBlockTemplate={onPlaceBlockTemplate}
      onRequestSaveBlockTemplate={onRequestSaveBlockTemplate}
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
      onNodeDragStop={vi.fn()}
      onViewportChange={vi.fn()}
      onMinimapNodeClick={vi.fn()}
      onToggleMinimap={vi.fn()}
      getMiniMapNodeColor={() => '#fff'}
      getMiniMapNodeStrokeColor={() => '#000'}
      getMiniMapNodeClassName={() => ''}
    />
  )
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
