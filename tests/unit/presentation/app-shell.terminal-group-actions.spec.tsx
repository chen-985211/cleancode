import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type * as ReactFlowModule from '@xyflow/react'
import type { ComponentType, ReactNode } from 'react'

import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'
import type { TerminalSessionSnapshot } from '../../../src/contexts/run/application/dto/TerminalSessionSnapshot'
import { AppShell } from '../../../src/presentation/app-shell/AppShell'
import type { WorkbenchSnapshot } from '../../../src/presentation/app-shell/types'

const reactFlowSpies = vi.hoisted(() => ({
  setCenter: vi.fn(async () => undefined)
}))

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactFlowModule>()
  const React = await import('react')

  return {
    ...actual,
    Background: () => null,
    Controls: () => null,
    Handle: () => null,
    NodeResizer: () => null,
    Panel: ({ children }: { readonly children?: ReactNode }) =>
      React.createElement('div', null, children),
    ReactFlow: ({ children, nodes = [], nodeTypes = {}, onInit }: MockReactFlowProps) => {
      const hasInitializedRef = React.useRef(false)

      React.useEffect(() => {
        if (hasInitializedRef.current) {
          return
        }

        hasInitializedRef.current = true
        onInit?.(createMockReactFlowInstance())
      }, [onInit])

      return React.createElement(
        'div',
        { 'data-testid': 'mock-react-flow' },
        nodes.map((node) => {
          const NodeComponent = node.type ? nodeTypes[node.type] : undefined

          return NodeComponent
            ? React.createElement(NodeComponent, {
                id: node.id,
                type: node.type,
                data: node.data,
                dragging: false,
                zIndex: node.zIndex ?? 0,
                selectable: true,
                deletable: true,
                selected: node.selected ?? false,
                draggable: true,
                isConnectable: false,
                positionAbsoluteX: node.position.x,
                positionAbsoluteY: node.position.y,
                key: node.id
              })
            : null
        }),
        children
      )
    }
  }
})

describe('app shell terminal group actions', () => {
  beforeEach(() => {
    reactFlowSpies.setCenter.mockClear()
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: undefined
    })
  })

  it('starts configured group members through their launch commands', async () => {
    const workbench = createWorkbenchWithTerminalGroup()
    const startTerminal = vi.fn(async (command) =>
      createTerminalSessionSnapshot(command.terminalBlockId)
    )
    const writeTerminal = vi.fn(async () => createTerminalSessionSnapshot('written-terminal'))

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench]),
        startTerminal,
        writeTerminal
      })
    })

    render(<AppShell />)

    fireEvent.click(await screen.findByRole('button', { name: '启动项目 启动全部' }))

    await waitFor(() => expect(startTerminal).toHaveBeenCalledTimes(2))
    expect(startTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ terminalBlockId: 'backend-terminal' })
    )
    expect(startTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ terminalBlockId: 'frontend-terminal' })
    )
    await waitFor(() =>
      expect(writeTerminal).toHaveBeenCalledWith({
        sessionId: 'backend-terminal-session',
        input: 'pnpm dev:api\r'
      })
    )
    expect(writeTerminal).toHaveBeenCalledTimes(1)
  })

  it('restarts group members without centering member terminals', async () => {
    const workbench = createWorkbenchWithTerminalGroup()
    const runtimeApi = createRuntimeApi({
      listWorkbenches: vi.fn(async () => [workbench]),
      startTerminal: vi.fn(async (command) =>
        createTerminalSessionSnapshot(command.terminalBlockId)
      )
    })

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })

    render(<AppShell />)

    fireEvent.click(await screen.findByRole('button', { name: '启动项目 重启全部' }))

    await waitFor(() => expect(runtimeApi.startTerminal).toHaveBeenCalledTimes(2))
    await act(async () => {
      await delay(120)
    })
    expect(reactFlowSpies.setCenter).not.toHaveBeenCalled()
    expect(runtimeApi.moveTerminalGroup).not.toHaveBeenCalled()
  })
})

interface MockReactFlowNode {
  readonly id: string
  readonly type?: string
  readonly data: unknown
  readonly selected?: boolean
  readonly position: { readonly x: number; readonly y: number }
  readonly zIndex?: number
}

interface MockReactFlowProps {
  readonly children?: ReactNode
  readonly nodes?: readonly MockReactFlowNode[]
  readonly nodeTypes?: Record<string, ComponentType<MockReactFlowNodeProps>>
  readonly onInit?: (instance: MockReactFlowInstance) => void
}

interface MockReactFlowNodeProps extends Omit<MockReactFlowNode, 'position'> {
  readonly dragging: boolean
  readonly zIndex: number
  readonly selectable: boolean
  readonly deletable: boolean
  readonly draggable: boolean
  readonly isConnectable: boolean
  readonly positionAbsoluteX: number
  readonly positionAbsoluteY: number
}

interface MockReactFlowInstance {
  readonly getNode: () => undefined
  readonly getViewport: () => { readonly x: number; readonly y: number; readonly zoom: number }
  readonly getZoom: () => number
  readonly setCenter: typeof reactFlowSpies.setCenter
  readonly setViewport: () => Promise<void>
  readonly zoomOut: () => Promise<void>
  readonly zoomIn: () => Promise<void>
  readonly fitView: () => Promise<void>
}

function createMockReactFlowInstance(): MockReactFlowInstance {
  return {
    getNode: () => undefined,
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    getZoom: () => 1,
    setCenter: reactFlowSpies.setCenter,
    setViewport: async () => undefined,
    zoomOut: async () => undefined,
    zoomIn: async () => undefined,
    fitView: async () => undefined
  }
}

function createWorkbenchWithTerminalGroup(): WorkbenchSnapshot {
  const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')

  return {
    ...workbench,
    graph: {
      ...workbench.graph,
      blocks: [
        {
          id: 'backend-terminal',
          type: 'terminal',
          name: 'Backend',
          description: 'API',
          launchCommand: 'pnpm dev:api',
          position: { x: 160, y: 220 },
          size: { width: 420, height: 306 }
        },
        {
          id: 'frontend-terminal',
          type: 'terminal',
          name: 'Frontend',
          description: 'Web',
          launchCommand: '',
          position: { x: 620, y: 220 },
          size: { width: 420, height: 306 }
        }
      ],
      terminalGroups: [
        {
          id: 'development-group',
          type: 'terminal-group',
          name: '启动项目',
          position: { x: 128, y: 144 },
          size: { width: 984, height: 458 },
          isCollapsed: false,
          memberBlockIds: ['backend-terminal', 'frontend-terminal']
        }
      ]
    }
  }
}

function createTerminalSessionSnapshot(terminalBlockId: string): TerminalSessionSnapshot {
  return {
    id: `${terminalBlockId}-session`,
    terminalBlockId,
    workspaceName: 'main',
    workingDirectory: '/tmp/alpha-project',
    processId: 1001,
    status: 'running',
    inputHistory: [],
    exitCode: null,
    failureReason: null
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}
