import { act, fireEvent, render, screen } from '@testing-library/react'
import type { Edge, ReactFlowProps } from '@xyflow/react'
import type * as ReactFlowModule from '@xyflow/react'
import type { MouseEvent, ReactNode } from 'react'

import { I18nProvider } from '../../../src/presentation/i18n/I18nProvider'
import { inactiveTerminalWorkflowController } from '../../../src/presentation/app-shell/coordinators/inactiveTerminalWorkflowController'
import { createTerminalWorkflowEdges } from '../../../src/presentation/app-shell/projections/terminalWorkflowEdges'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import { WorkbenchCanvas } from '../../../src/presentation/app-shell/workbench/WorkbenchCanvas'
import { createWorkbenchNodeStore } from '../../../src/presentation/app-shell/workbench/nodes/workbenchNodeStore'
import type { WorkbenchCanvasProps } from '../../../src/presentation/app-shell/workbench/workbenchCanvasProps'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'
import { createGraph } from '../../fixtures/presentation/workbenchCanvasContextMenuGraph'

type FlowProps = ReactFlowProps<WorkbenchFlowNode, Edge>
const flow = vi.hoisted(() => ({ props: null as FlowProps | null }))

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactFlowModule>()
  const React = await import('react')
  return {
    ...actual,
    Background: () => null,
    Panel: ({ children }: { children?: ReactNode }) => React.createElement('div', null, children),
    ReactFlow: (props: FlowProps) => {
      flow.props = props
      return React.createElement('div', { className: 'react-flow' }, props.children)
    }
  }
})

describe('canvas connection deletion', () => {
  it.each(['Backspace', 'Delete'])(
    'selects and deletes only the chosen connection with %s',
    (key) => {
      const props = createProps()
      const { container } = render(<WorkbenchCanvas {...props} />)
      selectEdge('connection-a-b')

      expect(edge('connection-a-b').selected).toBe(true)
      expect(edge('connection-b-c').selected).not.toBe(true)
      expect(flow.props?.deleteKeyCode).toBeNull()
      fireEvent.keyDown(container.querySelector('.canvas-surface')!, { key })

      expect(props.terminalWorkflow!.deleteEdges).toHaveBeenCalledOnce()
      expect(props.terminalWorkflow!.deleteEdges).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'connection-a-b' })
      ])
      expect(props.onDeleteTerminalScope).not.toHaveBeenCalled()
    }
  )

  it('clears selection on the empty canvas and ignores removal changes until graph confirmation', () => {
    const props = createProps()
    const { container } = render(<WorkbenchCanvas {...props} />)
    selectEdge('connection-a-b')
    act(() => flow.props?.onEdgesChange?.([{ type: 'remove', id: 'connection-a-b' }]))
    expect(edge('connection-a-b').selected).toBe(true)
    act(() => flow.props?.onPaneClick?.({} as MouseEvent))
    expect(edge('connection-a-b').selected).not.toBe(true)
    fireEvent.keyDown(container.querySelector('.canvas-surface')!, { key: 'Backspace' })
    expect(props.terminalWorkflow!.deleteEdges).not.toHaveBeenCalled()
  })

  it.each(['textarea', 'input', 'editable', 'menu'])(
    'does not intercept deletion in %s',
    (kind) => {
      const props = createProps()
      const { container } = render(<WorkbenchCanvas {...props} />)
      selectEdge('connection-a-b')
      const target = document.createElement(kind === 'input' || kind === 'textarea' ? kind : 'div')
      if (kind === 'editable') target.setAttribute('contenteditable', 'true')
      if (kind === 'menu') target.setAttribute('role', 'menu')
      container.querySelector('.canvas-surface')!.append(target)
      fireEvent.keyDown(target, { key: 'Backspace' })
      expect(props.terminalWorkflow!.deleteEdges).not.toHaveBeenCalled()
    }
  )

  it('clears stale selection across workspaces even when connection IDs are reused', () => {
    const props = createProps()
    const { container, rerender } = render(<WorkbenchCanvas {...props} />)
    selectEdge('connection-a-b')
    const other = {
      ...props,
      currentWorkbench: {
        ...props.currentWorkbench!,
        graph: { ...props.currentWorkbench!.graph, workspaceId: 'other' }
      }
    }
    rerender(<WorkbenchCanvas {...other} />)
    rerender(<WorkbenchCanvas {...props} />)
    fireEvent.keyDown(container.querySelector('.canvas-surface')!, { key: 'Delete' })
    expect(props.terminalWorkflow!.deleteEdges).not.toHaveBeenCalled()
  })

  it('prevents duplicate disconnects while pending and keeps unconfirmed edges available', async () => {
    const props = createProps()
    let complete!: () => void
    const pending = new Promise<void>((resolve) => {
      complete = resolve
    })
    const disconnect = vi.fn(() => pending)
    const { container } = render(
      <WorkbenchCanvas
        {...props}
        terminalWorkflow={{ ...props.terminalWorkflow!, deleteEdges: disconnect }}
      />
    )
    selectEdge('connection-a-b')
    const canvas = container.querySelector('.canvas-surface')!
    fireEvent.keyDown(canvas, { key: 'Delete' })
    fireEvent.keyDown(canvas, { key: 'Delete' })
    expect(disconnect).toHaveBeenCalledOnce()
    await act(async () => {
      complete()
      await pending
    })
    expect(edge('connection-a-b').selected).toBe(true)
    fireEvent.keyDown(canvas, { key: 'Delete' })
    expect(disconnect).toHaveBeenCalledTimes(2)
  })

  it.each([
    { locale: 'zh-CN', label: '断开连接' },
    { locale: 'en', label: 'Disconnect' }
  ] as const)('disconnects exactly the right-clicked edge in $locale', ({ locale, label }) => {
    const props = createProps()
    render(
      <I18nProvider initialLocale={locale}>
        <WorkbenchCanvas {...props} />
      </I18nProvider>
    )
    openEdgeMenu('connection-b-c')
    fireEvent.click(screen.getByRole('menuitem', { name: label }))
    expect(props.terminalWorkflow!.deleteEdges).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'connection-b-c' })
    ])
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes the connection menu on Escape and restores canvas focus', () => {
    const props = createProps()
    const { container } = render(<WorkbenchCanvas {...props} />)
    openEdgeMenu('connection-a-b')
    fireEvent.keyDown(screen.getByRole('menuitem', { name: '断开连接' }), { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(container.querySelector('.canvas-surface')).toHaveFocus()
    expect(props.terminalWorkflow!.deleteEdges).not.toHaveBeenCalled()
  })

  it('does not allow approval edges or edges outside the edited group to be deleted', () => {
    const props = createProps()
    props.terminalWorkflow!.edges.push({
      id: 'approval:example',
      source: 'workflow-a',
      target: 'workflow-b',
      deletable: false
    })
    const { container } = render(
      <WorkbenchCanvas {...props} editingTerminalGroupId="combination" />
    )
    for (const id of ['approval:example', 'connection-a-b']) {
      selectEdge(id)
      expect(edge(id).selected).not.toBe(true)
      openEdgeMenu(id)
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    }
    fireEvent.keyDown(container.querySelector('.canvas-surface')!, { key: 'Delete' })
    expect(props.terminalWorkflow!.deleteEdges).not.toHaveBeenCalled()
  })
})

function edge(id: string): Edge {
  return flow.props!.edges!.find((candidate) => candidate.id === id)!
}

function selectEdge(id: string) {
  expect(flow.props?.onEdgesChange).toBeTypeOf('function')
  act(() => flow.props!.onEdgesChange!([{ type: 'select', id, selected: true }]))
}

function openEdgeMenu(id: string) {
  expect(flow.props?.onEdgeContextMenu).toBeTypeOf('function')
  act(() =>
    flow.props!.onEdgeContextMenu!(
      {
        clientX: 200,
        clientY: 160,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      } as unknown as MouseEvent,
      edge(id)
    )
  )
}

function createProps(): WorkbenchCanvasProps {
  const snapshot = createWorkbenchSnapshot('/repo/app', 'app')
  const graph = createGraph()
  return {
    currentWorkbench: { ...snapshot, graph },
    currentWorkspace: snapshot.project.workspaces[0],
    isDesktopRuntime: true,
    terminalRuntimeAvailability: { phase: 'ready', epoch: 1, errorCode: null, retryable: false },
    terminalWorkflow: {
      ...inactiveTerminalWorkflowController,
      edges: createTerminalWorkflowEdges(graph, {}),
      deleteEdges: vi.fn(async () => undefined)
    },
    nodeStore: createWorkbenchNodeStore(),
    nodeTypes: {},
    reactFlowInstanceRef: { current: null },
    shortcutTooltips: {
      createAgent: '',
      createTerminal: '',
      fitCanvas: '',
      groupTerminals: '',
      toggleMinimap: '',
      zoomCanvasIn: '',
      zoomCanvasOut: ''
    },
    minimapNodeInteraction: { getLabel: (id) => id, setHoveredBlockId: vi.fn() },
    isMinimapCollapsed: true,
    isTerminalGroupSelectionMode: false,
    selectedTerminalGroupCandidateCount: 0,
    getMiniMapNodeClassName: () => '',
    getMiniMapNodeColor: () => '',
    getMiniMapNodeStrokeColor: () => '',
    onCreateTerminalBlock: vi.fn(),
    onCreateWorkspaceAgent: vi.fn(),
    onCreateTerminalGroup: vi.fn(),
    onCancelTerminalGroupSelection: vi.fn(),
    onToggleMinimap: vi.fn(),
    onZoomCanvasIn: vi.fn(),
    onZoomCanvasOut: vi.fn(),
    onFitCanvas: vi.fn(),
    onMinimapNodeClick: vi.fn(),
    onNodeClick: vi.fn(),
    onPaneClick: vi.fn(),
    onNodesChange: vi.fn(),
    onNodeDrag: vi.fn(),
    onNodeDragStart: vi.fn(),
    onNodeDragStop: vi.fn(),
    onViewportChange: vi.fn(),
    onDeleteTerminalScope: vi.fn()
  }
}
