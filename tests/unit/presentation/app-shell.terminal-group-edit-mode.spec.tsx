import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { NodeChange } from '@xyflow/react'
import type * as ReactFlowModule from '@xyflow/react'
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'

import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'
import { AppShell } from '../../../src/presentation/app-shell/AppShell'
import type { TerminalFlowNode } from '../../../src/presentation/app-shell/types/terminalFlowNode'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import type { WorkbenchSnapshot } from '../../../src/presentation/app-shell/types/workbenchSnapshot'

const reactFlowProps = vi.hoisted(() => ({
  latest: null as MockReactFlowProps | null,
  renderCount: 0
}))
const appShellRenderStats = vi.hoisted(() => ({ sidebarRenderCount: 0 }))

vi.mock('../../../src/contexts/project/presentation/components/ProjectSidebar', async () => {
  const React = await import('react')

  return {
    ProjectSidebar: () => {
      appShellRenderStats.sidebarRenderCount += 1
      return React.createElement('aside', { 'data-testid': 'mock-project-sidebar' })
    }
  }
})

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactFlowModule>()
  const React = await import('react')

  return {
    ...actual,
    Background: () => null,
    Controls: () => null,
    Handle: () => null,
    NodeResizeControl: () => null,
    Panel: ({ children }: { readonly children?: ReactNode }) =>
      React.createElement('div', null, children),
    ReactFlow: (props: MockReactFlowProps) => {
      const hasInitializedRef = React.useRef(false)
      reactFlowProps.renderCount += 1
      reactFlowProps.latest = props

      React.useEffect(() => {
        if (hasInitializedRef.current) {
          return
        }

        hasInitializedRef.current = true
        props.onInit?.(createMockReactFlowInstance())
      }, [props])

      return React.createElement(
        'div',
        { 'data-testid': 'mock-react-flow', onContextMenu: props.onPaneContextMenu },
        props.children
      )
    }
  }
})

describe('app shell terminal group edit mode', () => {
  beforeEach(() => {
    stubReducedMotionPreference()
    reactFlowProps.latest = null
    reactFlowProps.renderCount = 0
    appShellRenderStats.sidebarRenderCount = 0
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: undefined
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not re-render the canvas for a terminal drag preview outside group edit mode', async () => {
    const workbench = createWorkbenchWithTerminalGroup()
    const runtimeApi = createRuntimeApi({
      listWorkbenches: vi.fn(async () => [workbench])
    })

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })

    render(<AppShell />)

    await waitFor(() => expect(reactFlowProps.latest?.nodes.length).toBeGreaterThan(0))

    const terminalNode = reactFlowProps.latest?.nodes.find(
      (node): node is TerminalFlowNode => node.id === 'backend-terminal' && node.type === 'terminal'
    )
    const renderCountBeforePreview = reactFlowProps.renderCount

    expect(terminalNode).toBeDefined()

    act(() => {
      reactFlowProps.latest?.onNodeDrag?.({} as MouseEvent, terminalNode!)
    })

    expect(reactFlowProps.renderCount).toBe(renderCountBeforePreview)
  })

  it('updates dragged node geometry without re-rendering the app shell sidebar', async () => {
    const workbench = createWorkbenchWithTerminalBlocks()
    const runtimeApi = createRuntimeApi({
      listWorkbenches: vi.fn(async () => [workbench])
    })
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })

    render(<AppShell />)

    await waitFor(() => expect(reactFlowProps.latest?.nodes.length).toBeGreaterThan(0))
    const sidebarRenderCountBeforeDrag = appShellRenderStats.sidebarRenderCount

    act(() => {
      reactFlowProps.latest?.onNodesChange?.([
        {
          id: 'backend-terminal',
          type: 'position',
          position: { x: 860, y: 520 },
          dragging: true
        }
      ])
    })

    await waitFor(() =>
      expect(
        reactFlowProps.latest?.nodes.find((node) => node.id === 'backend-terminal')?.position
      ).toEqual({ x: 860, y: 520 })
    )
    expect(appShellRenderStats.sidebarRenderCount).toBe(sidebarRenderCountBeforeDrag)
  })

  it('reports a failed layout commit after restoring the terminal position', async () => {
    const workbench = createWorkbenchWithTerminalBlocks()
    const runtimeApi = createRuntimeApi({
      listWorkbenches: vi.fn(async () => [workbench])
    })
    const notify = vi.fn(() => 'notification-1')
    runtimeApi.moveBlock.mockRejectedValue(new Error('layout commit failed'))
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })

    render(<AppShell notifications={{ dismiss: vi.fn(), notify, update: vi.fn(() => false) }} />)

    await waitFor(() => expect(reactFlowProps.latest?.nodes.length).toBeGreaterThan(0))
    const terminalNode = reactFlowProps.latest?.nodes.find(
      (node): node is TerminalFlowNode => node.id === 'backend-terminal' && node.type === 'terminal'
    )

    if (!terminalNode) throw new Error('Expected backend terminal node')

    const movedNode = { ...terminalNode, position: { x: 860, y: 520 } }

    act(() => {
      reactFlowProps.latest?.onNodesChange?.([
        { id: terminalNode.id, type: 'position', position: movedNode.position, dragging: false }
      ])
      reactFlowProps.latest?.onNodeDragStop?.({} as MouseEvent, movedNode)
    })

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith({
        kind: 'error',
        message: '节点已恢复到保存前的位置，请重试。',
        title: '无法保存画布布局'
      })
    )
  })

  it('moves a complete terminal workflow into the edited group in one operation', async () => {
    const workbench = createWorkbenchWithTerminalGroup()
    const absorbedPosition = { x: 740, y: 228 }
    const arrangedGraph = {
      ...workbench.graph,
      blocks: workbench.graph.blocks.map((block) =>
        block.id === 'worker-terminal' ? { ...block, position: absorbedPosition } : block
      )
    }
    const groupedGraph = {
      ...arrangedGraph,
      terminalGroups: arrangedGraph.terminalGroups.map((group) =>
        group.id === 'development-group'
          ? { ...group, memberBlockIds: [...group.memberBlockIds, 'worker-terminal'] }
          : group
      )
    }
    const runtimeApi = createRuntimeApi({
      listWorkbenches: vi.fn(async () => [workbench])
    })
    runtimeApi.moveTerminalWorkflowToGroup.mockResolvedValue(groupedGraph)

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })

    render(<AppShell />)

    await enterTerminalGroupEditMode()

    await waitFor(() => expect(reactFlowProps.latest?.nodes.length).toBeGreaterThan(0))

    const workerNode = reactFlowProps.latest?.nodes.find(
      (node): node is TerminalFlowNode => node.id === 'worker-terminal' && node.type === 'terminal'
    )

    expect(workerNode).toBeDefined()

    act(() => {
      reactFlowProps.latest?.onNodeDragStart?.({} as MouseEvent, workerNode!)
    })
    await act(async () => {
      await reactFlowProps.latest?.onNodeDragStop?.({} as MouseEvent, {
        ...workerNode!,
        position: { x: 420, y: 260 }
      })
    })

    await waitFor(() =>
      expect(runtimeApi.moveTerminalWorkflowToGroup).toHaveBeenCalledWith({
        projectDirectory: '/tmp/alpha-project',
        workspaceId: 'main',
        blockId: 'worker-terminal',
        targetTerminalGroupId: 'development-group',
        position: { x: 420, y: 260 }
      })
    )
    expect(runtimeApi.moveBlock).not.toHaveBeenCalled()
    expect(runtimeApi.addTerminalToGroup).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(
        reactFlowProps.latest?.nodes.find((node) => node.id === 'worker-terminal')?.position
      ).toEqual(absorbedPosition)
    )
  })

  it('creates an empty group at the context-menu coordinate and enters its edit space', async () => {
    const workbench = createWorkbenchWithTerminalBlocks()
    const runtimeApi = createRuntimeApi({
      listWorkbenches: vi.fn(async () => [workbench])
    })
    runtimeApi.createTerminalGroup.mockResolvedValue({
      ...workbench.graph,
      terminalGroups: [
        {
          id: 'new-group',
          type: 'terminal-group',
          name: '终端组合 1',
          position: { x: 320, y: 240 },
          size: { width: 520, height: 320 },
          isCollapsed: false,
          memberBlockIds: []
        }
      ]
    })

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })

    render(<AppShell />)

    await waitFor(() => expect(reactFlowProps.latest?.nodes.length).toBeGreaterThanOrEqual(2))

    fireEvent.contextMenu(screen.getByTestId('mock-react-flow'), { clientX: 320, clientY: 240 })
    fireEvent.click(await screen.findByRole('menuitem', { name: '组合终端' }))

    await waitFor(() =>
      expect(runtimeApi.createTerminalGroup).toHaveBeenCalledWith({
        projectDirectory: '/tmp/alpha-project',
        workspaceId: 'main',
        name: '终端组合 1',
        position: { x: 320, y: 240 }
      })
    )
    await waitFor(() =>
      expect(reactFlowProps.latest?.nodes.find((node) => node.id === 'new-group')).toMatchObject({
        data: { isEditing: true }
      })
    )
  })

  it('does not offer nested group creation while editing a group space', async () => {
    const workbench = createWorkbenchWithTerminalGroup()
    const runtimeApi = createRuntimeApi({
      listWorkbenches: vi.fn(async () => [workbench])
    })
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })

    render(<AppShell />)
    await enterTerminalGroupEditMode()
    fireEvent.contextMenu(screen.getByTestId('mock-react-flow'), { clientX: 320, clientY: 240 })
    const createGroupItem = await screen.findByRole('menuitem', { name: '组合终端' })

    expect(createGroupItem).toBeDisabled()
    expect(runtimeApi.createTerminalGroup).not.toHaveBeenCalled()
  })

  it('marks the container as editing without changing terminal selection semantics', async () => {
    const workbench = createWorkbenchWithTerminalGroup()
    const runtimeApi = createRuntimeApi({
      listWorkbenches: vi.fn(async () => [workbench])
    })

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })

    render(<AppShell />)

    await enterTerminalGroupEditMode()

    await waitFor(() => expect(reactFlowProps.latest?.nodes.length).toBeGreaterThan(0))

    const backendNode = reactFlowProps.latest?.nodes.find(
      (node): node is TerminalFlowNode => node.id === 'backend-terminal' && node.type === 'terminal'
    )

    expect(backendNode).toMatchObject({
      data: {
        canSelectForTerminalGroup: false,
        isTerminalGroupSelectionMode: false
      }
    })
    expect(
      reactFlowProps.latest?.nodes.find(
        (node) => node.id === 'development-group' && node.type === 'terminalGroup'
      )
    ).toMatchObject({ data: { isEditing: true } })
  })

  it('keeps the container editing when ordinary canvas selection is cleared', async () => {
    const workbench = createWorkbenchWithTerminalGroup()
    const runtimeApi = createRuntimeApi({
      listWorkbenches: vi.fn(async () => [workbench])
    })

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })

    render(<AppShell />)

    await enterTerminalGroupEditMode()
    await waitFor(() =>
      expect(
        reactFlowProps.latest?.nodes.find(
          (node) => node.id === 'development-group' && node.type === 'terminalGroup'
        )
      ).toMatchObject({ data: { isEditing: true } })
    )

    act(() => reactFlowProps.latest?.onPaneClick?.())

    await waitFor(() =>
      expect(
        reactFlowProps.latest?.nodes.find(
          (node) => node.id === 'development-group' && node.type === 'terminalGroup'
        )
      ).toMatchObject({ data: { isEditing: true } })
    )
  })

  it('keeps the group shell size stable while dragging a member in edit mode', async () => {
    const workbench = createWorkbenchWithTerminalGroup()
    const runtimeApi = createRuntimeApi({
      listWorkbenches: vi.fn(async () => [workbench])
    })

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })

    render(<AppShell />)

    await enterTerminalGroupEditMode()

    await waitFor(() => expect(reactFlowProps.latest?.nodes.length).toBeGreaterThan(0))

    reactFlowProps.latest?.onNodesChange?.([
      {
        id: 'frontend-terminal',
        type: 'position',
        position: { x: 1320, y: 260 },
        dragging: true
      }
    ])

    await waitFor(() => {
      const groupNode = reactFlowProps.latest?.nodes.find(
        (node) => node.id === 'development-group' && node.type === 'terminalGroup'
      )

      expect(groupNode).toMatchObject({
        position: { x: 288, y: 164 },
        style: { width: 984, height: 458 }
      })
    })
  })

  it('moves a complete terminal workflow out of the edited group in one operation', async () => {
    const workbench = createWorkbenchWithTerminalGroup({
      memberBlockIds: ['backend-terminal', 'frontend-terminal', 'worker-terminal']
    })
    const movedGraph = {
      ...workbench.graph,
      blocks: workbench.graph.blocks.map((block) =>
        block.id === 'backend-terminal' ? { ...block, position: { x: 1280, y: 260 } } : block
      )
    }
    const ungroupedGraph = {
      ...movedGraph,
      terminalGroups: movedGraph.terminalGroups.map((group) =>
        group.id === 'development-group'
          ? { ...group, memberBlockIds: ['frontend-terminal', 'worker-terminal'] }
          : group
      )
    }
    const runtimeApi = createRuntimeApi({
      listWorkbenches: vi.fn(async () => [workbench])
    })
    runtimeApi.moveTerminalWorkflowToGroup.mockResolvedValue(ungroupedGraph)

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })

    render(<AppShell />)

    await enterTerminalGroupEditMode()

    await waitFor(() => expect(reactFlowProps.latest?.nodes.length).toBeGreaterThan(0))

    const backendNode = reactFlowProps.latest?.nodes.find(
      (node): node is TerminalFlowNode => node.id === 'backend-terminal' && node.type === 'terminal'
    )

    expect(backendNode).toBeDefined()

    await reactFlowProps.latest?.onNodeDragStop?.({} as MouseEvent, {
      ...backendNode!,
      position: { x: 1280, y: 260 }
    })

    await waitFor(() =>
      expect(runtimeApi.moveTerminalWorkflowToGroup).toHaveBeenCalledWith({
        projectDirectory: '/tmp/alpha-project',
        workspaceId: 'main',
        blockId: 'backend-terminal',
        targetTerminalGroupId: null,
        position: { x: 1280, y: 260 }
      })
    )
    expect(runtimeApi.moveBlock).not.toHaveBeenCalled()
    expect(runtimeApi.removeTerminalFromGroup).not.toHaveBeenCalled()
  })

  it('serializes repeated moves of the same terminal group', async () => {
    const workbench = createWorkbenchWithTerminalGroup()
    const first = createDeferred<WorkbenchSnapshot['graph']>()
    const second = createDeferred<WorkbenchSnapshot['graph']>()
    const runtimeApi = createRuntimeApi({
      listWorkbenches: vi.fn(async () => [workbench])
    })
    runtimeApi.moveTerminalGroup
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })

    render(<AppShell />)
    await waitFor(() => expect(reactFlowProps.latest?.nodes.length).toBeGreaterThan(0))

    const groupNode = reactFlowProps.latest?.nodes.find(
      (node) => node.id === 'development-group' && node.type === 'terminalGroup'
    )

    expect(groupNode).toBeDefined()

    act(() => {
      reactFlowProps.latest?.onNodeDragStop?.({} as MouseEvent, {
        ...groupNode!,
        position: { x: 420, y: 180 }
      })
      reactFlowProps.latest?.onNodeDragStop?.({} as MouseEvent, {
        ...groupNode!,
        position: { x: 760, y: 220 }
      })
    })

    expect(runtimeApi.moveTerminalGroup).toHaveBeenCalledOnce()

    first.resolve(workbench.graph)
    await waitFor(() => expect(runtimeApi.moveTerminalGroup).toHaveBeenCalledTimes(2))
    second.resolve(workbench.graph)
  })
})

interface MockReactFlowProps {
  readonly children?: ReactNode
  readonly nodes: WorkbenchFlowNode[]
  readonly onInit?: (instance: MockReactFlowInstance) => void
  readonly onNodeClick?: (event: MouseEvent, node: WorkbenchFlowNode) => void
  readonly onNodeDrag?: (event: MouseEvent, node: WorkbenchFlowNode) => void
  readonly onNodeDragStart?: (event: MouseEvent, node: WorkbenchFlowNode) => void
  readonly onNodeDragStop?: (event: MouseEvent, node: WorkbenchFlowNode) => void | Promise<void>
  readonly onNodesChange?: (changes: NodeChange<WorkbenchFlowNode>[]) => void
  readonly onPaneClick?: () => void
  readonly onPaneContextMenu?: (event: ReactMouseEvent) => void
}

async function enterTerminalGroupEditMode(): Promise<void> {
  await waitFor(() =>
    expect(
      reactFlowProps.latest?.nodes.find(
        (node) => node.id === 'development-group' && node.type === 'terminalGroup'
      )
    ).toBeDefined()
  )
  const groupNode = reactFlowProps.latest?.nodes.find(
    (node) => node.id === 'development-group' && node.type === 'terminalGroup'
  )
  if (groupNode?.type !== 'terminalGroup') throw new Error('Expected terminal group node.')
  act(() => groupNode.data.onEditGroup?.(groupNode.data.group))
}

interface MockReactFlowInstance {
  readonly getNode: () => undefined
  readonly getNodes: () => readonly WorkbenchFlowNode[]
  readonly getNodesBounds: () => {
    readonly height: number
    readonly width: number
    readonly x: number
    readonly y: number
  }
  readonly getViewport: () => WorkbenchSnapshot['graph']['viewport']
  readonly getZoom: () => number
  readonly setCenter: () => Promise<void>
  readonly setViewport: () => Promise<void>
  readonly zoomOut: () => Promise<void>
  readonly zoomIn: () => Promise<void>
  readonly fitView: () => Promise<void>
}

function createMockReactFlowInstance(): MockReactFlowInstance {
  return {
    getNode: () => undefined,
    getNodes: () => reactFlowProps.latest?.nodes ?? [],
    getNodesBounds: () => ({ height: 460, width: 880, x: 320, y: 240 }),
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    getZoom: () => 1,
    setCenter: async () => undefined,
    setViewport: async () => undefined,
    zoomOut: async () => undefined,
    zoomIn: async () => undefined,
    fitView: async () => undefined
  }
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

function createWorkbenchWithTerminalBlocks(): WorkbenchSnapshot {
  const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')

  return {
    ...workbench,
    graph: {
      ...workbench.graph,
      blocks: [
        createTerminalBlock('backend-terminal', { x: 320, y: 240 }),
        createTerminalBlock('frontend-terminal', { x: 780, y: 240 }),
        createTerminalBlock('worker-terminal', { x: 1120, y: 240 })
      ],
      terminalGroups: []
    }
  }
}

function createWorkbenchWithTerminalGroup(
  input: {
    readonly memberBlockIds?: readonly string[]
  } = {}
): WorkbenchSnapshot {
  const workbench = createWorkbenchWithTerminalBlocks()
  const memberBlockIds = input.memberBlockIds ?? ['backend-terminal', 'frontend-terminal']

  return {
    ...workbench,
    graph: {
      ...workbench.graph,
      terminalGroups: [
        {
          id: 'development-group',
          type: 'terminal-group',
          name: '启动项目',
          position: { x: 288, y: 164 },
          size: { width: 984, height: 458 },
          isCollapsed: false,
          memberBlockIds
        }
      ]
    }
  }
}

function createTerminalBlock(id: string, position: { readonly x: number; readonly y: number }) {
  return {
    id,
    type: 'terminal' as const,
    name: id,
    description: '本地终端',
    launchCommand: '',
    position,
    size: { width: 420, height: 306 }
  }
}

function createDeferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })

  return { promise, resolve }
}
