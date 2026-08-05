import { act, render, waitFor } from '@testing-library/react'
import type { Edge } from '@xyflow/react'
import type * as ReactFlowModule from '@xyflow/react'
import type { ReactNode } from 'react'

import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'
import { AppShell } from '../../../src/presentation/app-shell/AppShell'
import type {
  TerminalGroupFlowNode,
  WorkbenchFlowNode,
  WorkbenchSnapshot
} from '../../../src/presentation/app-shell/types'

const reactFlowProps = vi.hoisted(() => ({
  latest: null as MockReactFlowProps | null
}))

vi.mock('../../../src/presentation/app-shell/ProjectSidebar', async () => {
  const React = await import('react')
  return { ProjectSidebar: () => React.createElement('aside') }
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
      reactFlowProps.latest = props

      React.useEffect(() => {
        if (hasInitializedRef.current) return
        hasInitializedRef.current = true
        props.onInit?.(createMockReactFlowInstance())
      }, [props])

      return React.createElement('div', null, props.children)
    }
  }
})

describe('app shell terminal group object motion', () => {
  beforeEach(() => {
    reactFlowProps.latest = null
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    )
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: undefined
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('projects expanded group members from the collapsed group shell', async () => {
    const workbench = createWorkbenchWithTerminalGroup(true)
    const expandedGraph = withGroupCollapsed(workbench.graph, false)
    const runtimeApi = createRuntimeApi({
      listWorkbenches: vi.fn(async () => [workbench])
    })
    runtimeApi.setTerminalGroupCollapsed.mockResolvedValue(expandedGraph)
    installRuntimeApi(runtimeApi)

    render(<AppShell />)
    const groupNode = await findGroupNode(true)

    await act(async () => {
      await groupNode.data.onToggleGroupCollapsed(groupNode.data.group, false)
    })

    await expectMemberMotion('group-expand')
    expect(reactFlowProps.latest?.edges).toEqual([
      expect.objectContaining({
        id: 'backend-frontend',
        className: expect.stringContaining('workbench-object-edge--motion-pending')
      })
    ])
  })

  it('keeps collapsed group members as presentation-only reverse-path exits', async () => {
    const workbench = createWorkbenchWithTerminalGroup(false)
    const collapsedGraph = withGroupCollapsed(workbench.graph, true)
    const runtimeApi = createRuntimeApi({
      listWorkbenches: vi.fn(async () => [workbench])
    })
    runtimeApi.setTerminalGroupCollapsed.mockResolvedValue(collapsedGraph)
    installRuntimeApi(runtimeApi)

    render(<AppShell />)
    const groupNode = await findGroupNode(false)

    await act(async () => {
      await groupNode.data.onToggleGroupCollapsed(groupNode.data.group, true)
    })

    await expectMemberMotion('group-collapse')
    expect(findCurrentGroupNode()?.data.group.isCollapsed).toBe(true)
  })
})

interface MockReactFlowProps {
  readonly children?: ReactNode
  readonly edges: Edge[]
  readonly nodes: WorkbenchFlowNode[]
  readonly onInit?: (instance: MockReactFlowInstance) => void
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

async function findGroupNode(isCollapsed: boolean): Promise<TerminalGroupFlowNode> {
  await waitFor(() => expect(findCurrentGroupNode()?.data.group.isCollapsed).toBe(isCollapsed))
  const groupNode = findCurrentGroupNode()
  if (!groupNode) throw new Error('Expected terminal group node')
  return groupNode
}

function findCurrentGroupNode(): TerminalGroupFlowNode | undefined {
  return reactFlowProps.latest?.nodes.find(
    (node): node is TerminalGroupFlowNode => node.type === 'terminalGroup'
  )
}

async function expectMemberMotion(kind: 'group-collapse' | 'group-expand'): Promise<void> {
  await waitFor(() => {
    const memberNodes = reactFlowProps.latest?.nodes.filter(
      (node) => node.id === 'backend-terminal' || node.id === 'frontend-terminal'
    )
    expect(memberNodes).toHaveLength(2)
    expect(memberNodes?.map((node) => node.data.objectMotion?.kind)).toEqual([kind, kind])
  })
}

function createWorkbenchWithTerminalGroup(isCollapsed: boolean): WorkbenchSnapshot {
  const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
  const blocks = [
    createTerminalBlock('backend-terminal', { x: 320, y: 240 }),
    createTerminalBlock('frontend-terminal', { x: 780, y: 240 })
  ]

  return {
    ...workbench,
    graph: {
      ...workbench.graph,
      blocks,
      connections: [
        {
          id: 'backend-frontend',
          sourceBlockId: 'backend-terminal',
          targetBlockId: 'frontend-terminal'
        }
      ],
      terminalGroups: [
        {
          id: 'development-group',
          type: 'terminal-group',
          name: '启动项目',
          position: { x: 288, y: 164 },
          size: { width: 984, height: 458 },
          isCollapsed,
          memberBlockIds: blocks.map((block) => block.id)
        }
      ]
    }
  }
}

function withGroupCollapsed(
  graph: WorkbenchSnapshot['graph'],
  isCollapsed: boolean
): WorkbenchSnapshot['graph'] {
  return {
    ...graph,
    terminalGroups: graph.terminalGroups.map((group) => ({ ...group, isCollapsed }))
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

function installRuntimeApi(runtimeApi: ReturnType<typeof createRuntimeApi>): void {
  Object.defineProperty(window, 'cleancode', {
    configurable: true,
    value: runtimeApi
  })
}
