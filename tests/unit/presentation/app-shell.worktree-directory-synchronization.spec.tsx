import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type * as ReactFlowModule from '@xyflow/react'
import type { ComponentType, ReactNode } from 'react'

import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'
import type { TerminalSessionSnapshot } from '../../../src/contexts/run/application/dto/TerminalSessionSnapshot'
import { AppShell } from '../../../src/presentation/app-shell/AppShell'
import type { WorkbenchSnapshot } from '../../../src/presentation/app-shell/types'

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

describe('app shell worktree directory synchronization', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: undefined
    })
  })

  it('switches to the worktree matching a running terminal cwd without terminating terminals', async () => {
    const workbench = createWorkbenchWithTerminal('main')
    const switchedWorkbench = createWorkbenchWithTerminal('feature/sidebar')
    const startTerminal = vi.fn(async () =>
      createTerminalSessionSnapshot('session-main', 'main', '/tmp/alpha-project')
    )
    const listTerminalWorkingDirectories = vi.fn(async () => [
      createTerminalWorkingDirectorySnapshot(
        'session-main',
        '/tmp/alpha-project-worktrees/feature-sidebar/src'
      )
    ])
    const switchBranchWorkspace = vi.fn(async () => switchedWorkbench)
    const terminateTerminal = vi.fn()

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench]),
        listTerminalWorkingDirectories,
        startTerminal,
        switchBranchWorkspace,
        terminateTerminal
      })
    })

    render(<AppShell />)

    fireEvent.click(await screen.findByRole('button', { name: 'Terminal 1 重开空终端会话' }))

    await waitFor(() => expect(startTerminal).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(listTerminalWorkingDirectories).toHaveBeenCalledWith({
        sessionIds: ['session-main']
      })
    )
    await waitFor(() =>
      expect(switchBranchWorkspace).toHaveBeenCalledWith({
        projectDirectory: '/tmp/alpha-project',
        workspaceName: 'feature/sidebar'
      })
    )
    expect(terminateTerminal).not.toHaveBeenCalled()
    await screen.findByText('/tmp/alpha-project-worktrees/feature-sidebar')
  })

  it('creates a terminal block in the matched worktree when the target graph has no host block', async () => {
    const workbench = createWorkbenchWithTerminal('main')
    const switchedWorkbench = createWorkbenchWithTerminal('feature/sidebar', {
      withoutTerminal: true
    })
    const createdGraph = {
      ...switchedWorkbench.graph,
      blocks: [
        {
          id: 'terminal-worktree',
          type: 'terminal' as const,
          name: 'Terminal 1',
          description: '本地终端',
          launchCommand: '',
          position: { x: 160, y: 220 },
          size: { width: 420, height: 306 }
        }
      ]
    }
    const startTerminal = vi.fn(async () =>
      createTerminalSessionSnapshot('session-main', 'main', '/tmp/alpha-project')
    )
    const listTerminalWorkingDirectories = vi.fn(async () => [
      createTerminalWorkingDirectorySnapshot(
        'session-main',
        '/tmp/alpha-project-worktrees/feature-sidebar/src'
      )
    ])
    const createTerminalBlock = vi.fn(async () => createdGraph)
    const switchBranchWorkspace = vi.fn(async () => switchedWorkbench)

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        createTerminalBlock,
        listWorkbenches: vi.fn(async () => [workbench]),
        listTerminalWorkingDirectories,
        startTerminal,
        switchBranchWorkspace
      })
    })

    render(<AppShell />)

    fireEvent.click(await screen.findByRole('button', { name: 'Terminal 1 重开空终端会话' }))

    await waitFor(() =>
      expect(createTerminalBlock).toHaveBeenCalledWith({
        projectDirectory: '/tmp/alpha-project',
        workspaceName: 'feature/sidebar',
        name: 'Terminal 1',
        description: '本地终端',
        position: { x: 160, y: 220 }
      })
    )
    await screen.findByText('/tmp/alpha-project-worktrees/feature-sidebar')
    await screen.findByRole('button', { name: 'Terminal 1 停止当前命令' })
  })

  it('keeps a manually selected workspace when an existing terminal cwd still points at a worktree', async () => {
    const workbench = createWorkbenchWithTerminal('main')
    const startTerminal = vi
      .fn()
      .mockResolvedValueOnce(
        createTerminalSessionSnapshot('session-main', 'main', '/tmp/alpha-project')
      )
      .mockResolvedValueOnce(
        createTerminalSessionSnapshot('session-main-return', 'main', '/tmp/alpha-project')
      )
    const listTerminalWorkingDirectories = vi.fn(
      async (command: { readonly sessionIds: readonly string[] }) =>
        command.sessionIds.map((sessionId) =>
          sessionId === 'session-main'
            ? createTerminalWorkingDirectorySnapshot(
                sessionId,
                '/tmp/alpha-project-worktrees/feature-sidebar/src'
              )
            : createTerminalWorkingDirectorySnapshot(sessionId, '/tmp/alpha-project')
        )
    )
    const switchBranchWorkspace = vi.fn(async (command) =>
      createWorkbenchWithTerminal(command.workspaceName)
    )

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench]),
        listTerminalWorkingDirectories,
        startTerminal,
        switchBranchWorkspace
      })
    })

    render(<AppShell />)

    fireEvent.click(await screen.findByRole('button', { name: 'Terminal 1 重开空终端会话' }))

    await waitFor(() =>
      expect(switchBranchWorkspace).toHaveBeenCalledWith({
        projectDirectory: '/tmp/alpha-project',
        workspaceName: 'feature/sidebar'
      })
    )

    fireEvent.click(await screen.findByRole('button', { name: '切换到默认工作区 main' }))

    await waitFor(() =>
      expect(switchBranchWorkspace).toHaveBeenCalledWith({
        projectDirectory: '/tmp/alpha-project',
        workspaceName: 'main'
      })
    )
    await waitForStableWorkspaceSelectionWindow()
    expect(listTerminalWorkingDirectories).toHaveBeenCalled()
    expect(switchBranchWorkspace.mock.calls.map(([command]) => command.workspaceName)).toEqual([
      'feature/sidebar',
      'main'
    ])
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
  readonly setCenter: () => Promise<void>
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
    setCenter: async () => undefined,
    setViewport: async () => undefined,
    zoomOut: async () => undefined,
    zoomIn: async () => undefined,
    fitView: async () => undefined
  }
}

function createWorkbenchWithTerminal(
  currentWorkspaceName: string,
  options: { readonly withoutTerminal?: boolean } = {}
): WorkbenchSnapshot {
  const isMainWorkspace = currentWorkspaceName === 'main'
  const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
    workspaceName: currentWorkspaceName,
    workspaceDirectory: isMainWorkspace
      ? '/tmp/alpha-project'
      : '/tmp/alpha-project-worktrees/feature-sidebar',
    gitBranch: isMainWorkspace ? 'main' : 'feature/sidebar',
    workspaces: [
      {
        name: 'main',
        directory: '/tmp/alpha-project',
        gitBranch: 'main',
        isCurrent: isMainWorkspace
      },
      {
        name: 'feature/sidebar',
        directory: '/tmp/alpha-project-worktrees/feature-sidebar',
        gitBranch: 'feature/sidebar',
        isCurrent: !isMainWorkspace
      }
    ]
  })

  return {
    ...workbench,
    graph: {
      ...workbench.graph,
      blocks: options.withoutTerminal
        ? []
        : [
            {
              id: 'terminal-1',
              type: 'terminal',
              name: 'Terminal 1',
              description: '本地终端',
              launchCommand: '',
              position: { x: 160, y: 220 },
              size: { width: 420, height: 306 }
            }
          ]
    }
  }
}

function createTerminalSessionSnapshot(
  sessionId: string,
  workspaceName: string,
  workingDirectory: string
): TerminalSessionSnapshot {
  return {
    id: sessionId,
    terminalBlockId: 'terminal-1',
    workspaceName,
    workingDirectory,
    processId: 1001,
    status: 'running',
    inputHistory: [],
    exitCode: null,
    failureReason: null
  }
}

function createTerminalWorkingDirectorySnapshot(sessionId: string, workingDirectory: string) {
  return {
    sessionId,
    workingDirectory
  }
}

async function waitForStableWorkspaceSelectionWindow(): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 1700))
}
