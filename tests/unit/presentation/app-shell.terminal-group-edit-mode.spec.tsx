import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { NodeChange } from '@xyflow/react'
import type * as ReactFlowModule from '@xyflow/react'
import type { ReactNode } from 'react'

import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'
import { AppShell } from '../../../src/presentation/app-shell/AppShell'
import type {
  TerminalFlowNode,
  WorkbenchFlowNode,
  WorkbenchSnapshot
} from '../../../src/presentation/app-shell/types'

const reactFlowProps = vi.hoisted(() => ({
  latest: null as MockReactFlowProps | null,
  renderCount: 0
}))
const appShellRenderStats = vi.hoisted(() => ({ sidebarRenderCount: 0 }))

vi.mock('../../../src/presentation/app-shell/ProjectSidebar', async () => {
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

      return React.createElement('div', { 'data-testid': 'mock-react-flow' }, props.children)
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

  it('moves and immediately adds an ungrouped terminal dropped inside a group', async () => {
    const workbench = createWorkbenchWithTerminalGroup()
    const movedGraph = {
      ...workbench.graph,
      blocks: workbench.graph.blocks.map((block) =>
        block.id === 'worker-terminal' ? { ...block, position: { x: 420, y: 260 } } : block
      )
    }
    const groupedGraph = {
      ...movedGraph,
      terminalGroups: movedGraph.terminalGroups.map((group) =>
        group.id === 'development-group'
          ? { ...group, memberBlockIds: [...group.memberBlockIds, 'worker-terminal'] }
          : group
      )
    }
    const runtimeApi = createRuntimeApi({
      listWorkbenches: vi.fn(async () => [workbench])
    })
    runtimeApi.moveBlock.mockResolvedValue(movedGraph)
    runtimeApi.addTerminalToGroup.mockResolvedValue(groupedGraph)

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })

    render(<AppShell />)

    fireEvent.click(await screen.findByRole('button', { name: '组合终端' }))

    await waitFor(() => expect(reactFlowProps.latest?.nodes.length).toBeGreaterThan(0))

    const workerNode = reactFlowProps.latest?.nodes.find(
      (node): node is TerminalFlowNode => node.id === 'worker-terminal' && node.type === 'terminal'
    )

    expect(workerNode).toBeDefined()

    await act(async () => {
      await reactFlowProps.latest?.onNodeDragStop?.({} as MouseEvent, {
        ...workerNode!,
        position: { x: 420, y: 260 }
      })
    })

    await waitFor(() =>
      expect(runtimeApi.moveBlock).toHaveBeenCalledWith({
        projectDirectory: '/tmp/alpha-project',
        workspaceId: 'main',
        blockId: 'worker-terminal',
        position: { x: 420, y: 260 }
      })
    )
    await waitFor(() =>
      expect(runtimeApi.addTerminalToGroup).toHaveBeenCalledWith({
        projectDirectory: '/tmp/alpha-project',
        workspaceId: 'main',
        terminalGroupId: 'development-group',
        blockId: 'worker-terminal'
      })
    )
  })

  it('creates a new group from terminals selected before entering edit mode', async () => {
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
          name: '启动项目',
          position: { x: 288, y: 164 },
          size: { width: 984, height: 458 },
          isCollapsed: false,
          memberBlockIds: ['backend-terminal', 'frontend-terminal']
        }
      ]
    })

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })

    render(<AppShell />)

    await waitFor(() => expect(reactFlowProps.latest?.nodes.length).toBeGreaterThanOrEqual(2))

    const backendNode = reactFlowProps.latest?.nodes.find(
      (node): node is TerminalFlowNode => node.id === 'backend-terminal' && node.type === 'terminal'
    )
    const frontendNode = reactFlowProps.latest?.nodes.find(
      (node): node is TerminalFlowNode =>
        node.id === 'frontend-terminal' && node.type === 'terminal'
    )

    expect(backendNode).toBeDefined()
    expect(frontendNode).toBeDefined()

    backendNode?.data.onSelect?.(false)
    frontendNode?.data.onSelect?.(true)

    fireEvent.click(screen.getByRole('button', { name: '组合终端' }))
    fireEvent.click(await screen.findByRole('button', { name: '创建组合' }))

    await waitFor(() =>
      expect(runtimeApi.createTerminalGroup).toHaveBeenCalledWith({
        projectDirectory: '/tmp/alpha-project',
        workspaceId: 'main',
        name: '启动项目',
        memberBlockIds: ['backend-terminal', 'frontend-terminal']
      })
    )
  })

  it('does not create a group from one complete workflow', async () => {
    const baseWorkbench = createWorkbenchWithTerminalBlocks()
    const workbench = {
      ...baseWorkbench,
      graph: {
        ...baseWorkbench.graph,
        connections: [
          {
            id: 'backend-frontend',
            sourceBlockId: 'backend-terminal',
            targetBlockId: 'frontend-terminal'
          }
        ]
      }
    }
    const runtimeApi = createRuntimeApi({
      listWorkbenches: vi.fn(async () => [workbench])
    })
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })

    render(<AppShell />)
    await waitFor(() => expect(reactFlowProps.latest?.nodes.length).toBeGreaterThanOrEqual(2))
    const backendNode = reactFlowProps.latest?.nodes.find(
      (node): node is TerminalFlowNode => node.id === 'backend-terminal' && node.type === 'terminal'
    )

    backendNode?.data.onSelect?.(false)
    fireEvent.click(screen.getByRole('button', { name: '组合终端' }))
    const createGroupButton = await screen.findByRole('button', { name: '创建组合' })

    expect(createGroupButton).toBeDisabled()
    fireEvent.click(createGroupButton)
    expect(runtimeApi.createTerminalGroup).not.toHaveBeenCalled()
  })

  it('selects grouped member terminals while editing group membership', async () => {
    const workbench = createWorkbenchWithTerminalGroup()
    const runtimeApi = createRuntimeApi({
      listWorkbenches: vi.fn(async () => [workbench])
    })

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })

    render(<AppShell />)

    fireEvent.click(await screen.findByRole('button', { name: '组合终端' }))

    await waitFor(() => expect(reactFlowProps.latest?.nodes.length).toBeGreaterThan(0))

    const backendNode = reactFlowProps.latest?.nodes.find(
      (node): node is TerminalFlowNode => node.id === 'backend-terminal' && node.type === 'terminal'
    )

    expect(backendNode).toMatchObject({
      data: {
        canSelectForTerminalGroup: true
      }
    })

    backendNode?.data.onToggleTerminalGroupCandidate(backendNode.data.block)

    await waitFor(() => {
      const groupNode = reactFlowProps.latest?.nodes.find(
        (node) => node.id === 'development-group' && node.type === 'terminalGroup'
      )

      expect(groupNode).toMatchObject({
        data: {
          selectedMemberBlockIds: ['backend-terminal'],
          selectedUngroupedTerminalBlockIds: []
        }
      })
    })
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

    fireEvent.click(await screen.findByRole('button', { name: '组合终端' }))

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

  it('moves and immediately removes a member terminal dropped outside its group', async () => {
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
    runtimeApi.moveBlock.mockResolvedValue(movedGraph)
    runtimeApi.removeTerminalFromGroup.mockResolvedValue(ungroupedGraph)

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })

    render(<AppShell />)

    fireEvent.click(await screen.findByRole('button', { name: '组合终端' }))

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
      expect(runtimeApi.removeTerminalFromGroup).toHaveBeenCalledWith({
        projectDirectory: '/tmp/alpha-project',
        workspaceId: 'main',
        terminalGroupId: 'development-group',
        blockId: 'backend-terminal'
      })
    )
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
  readonly onNodeDragStop?: (event: MouseEvent, node: WorkbenchFlowNode) => void | Promise<void>
  readonly onNodesChange?: (changes: NodeChange<WorkbenchFlowNode>[]) => void
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
