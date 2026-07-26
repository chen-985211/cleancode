import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type * as ReactFlowModule from '@xyflow/react'
import type { ComponentType, ReactNode } from 'react'

import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'
import { createDeferred } from '../../fixtures/deferred'
import type { TerminalRunEvent } from '../../../src/contexts/run/application/dto/TerminalRunEvent'
import type { TerminalSessionSnapshot } from '../../../src/contexts/run/application/dto/TerminalSessionSnapshot'
import { AppShell } from '../../../src/presentation/app-shell/AppShell'
import type { AppNotificationController } from '../../../src/presentation/app-shell/appNotifications'
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
    ReactFlow: ({ children, nodes = [], nodeTypes = {} }: MockReactFlowProps) =>
      React.createElement(
        'div',
        null,
        nodes.map((node) => {
          const NodeComponent = node.type ? nodeTypes[node.type] : undefined
          return NodeComponent
            ? React.createElement(NodeComponent, {
                ...node,
                dragging: false,
                zIndex: node.zIndex ?? 0,
                selectable: true,
                deletable: true,
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
})

describe('app shell managed terminal launch', () => {
  it('shows a user-facing notification when a managed launch fails', async () => {
    const workbench = createWorkbenchWithTerminal()
    const launchTerminal = vi.fn(async () => {
      throw new Error('managed launch failed')
    })
    const runtimeApi = createRuntimeApi({
      listWorkbenches: vi.fn(async () => [workbench]),
      terminateTerminal: vi.fn()
    })
    const notifications = createNotificationController()
    Object.assign(runtimeApi, { launchTerminal })
    Object.defineProperty(window, 'cleancode', { configurable: true, value: runtimeApi })

    render(<AppShell notifications={notifications} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Terminal 1 启动命令' }))

    await waitFor(() =>
      expect(notifications.notify).toHaveBeenCalledWith({
        kind: 'error',
        title: '启动命令失败',
        message: '启动命令失败，请检查终端输出后重试。'
      })
    )
  })

  it('enables running-session actions without repeating session state in the header', async () => {
    const workbench = createWorkbenchWithTerminal()
    const replacementSession = createDeferred<{
      readonly session: TerminalSessionSnapshot
      readonly endpoint: null
    }>()
    let emitRunEvent: ((event: TerminalRunEvent) => void) | undefined
    const runtimeApi = createRuntimeApi({
      listWorkbenches: vi.fn(async () => [workbench]),
      terminateTerminal: vi.fn()
    })
    Object.assign(runtimeApi, {
      launchTerminal: vi.fn(() => replacementSession.promise),
      onTerminalRunEvent: vi.fn((listener: (event: TerminalRunEvent) => void) => {
        emitRunEvent = listener
        return vi.fn()
      })
    })
    Object.defineProperty(window, 'cleancode', { configurable: true, value: runtimeApi })

    render(<AppShell />)
    fireEvent.click(await screen.findByRole('button', { name: 'Terminal 1 启动命令' }))
    await waitFor(() => expect(emitRunEvent).toEqual(expect.any(Function)))

    act(() => {
      emitRunEvent?.({
        type: 'service-run-started',
        scope: {
          projectId: 'project-alpha-project',
          workspaceId: 'main',
          blockId: 'terminal-1',
          sessionId: 'session-pending',
          runId: 'run-pending',
          generation: 1
        }
      })
    })

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Terminal 1 停止当前命令' })).toBeEnabled()
    )
    expect(screen.queryByText('运行中')).not.toBeInTheDocument()
    expect(screen.queryByText('新会话')).not.toBeInTheDocument()

    replacementSession.resolve({
      session: createTerminalSessionSnapshot('session-pending'),
      endpoint: null
    })
  })

  it('does not let a stale launch response overwrite a newer run event', async () => {
    const replacementSession = createDeferred<{
      readonly session: TerminalSessionSnapshot
      readonly endpoint: null
    }>()
    let emitRunEvent: ((event: TerminalRunEvent) => void) | undefined
    const runtimeApi = createRuntimeApi({
      listWorkbenches: vi.fn(async () => [createWorkbenchWithTerminal()]),
      terminateTerminal: vi.fn()
    })
    Object.assign(runtimeApi, {
      launchTerminal: vi.fn(() => replacementSession.promise),
      onTerminalRunEvent: vi.fn((listener: (event: TerminalRunEvent) => void) => {
        emitRunEvent = listener
        return vi.fn()
      })
    })
    Object.defineProperty(window, 'cleancode', { configurable: true, value: runtimeApi })

    render(<AppShell />)
    fireEvent.click(await screen.findByRole('button', { name: 'Terminal 1 启动命令' }))
    await waitFor(() => expect(emitRunEvent).toEqual(expect.any(Function)))
    act(() => emitRunEvent?.({ type: 'service-run-started', scope: runIdentity('newer', 2) }))

    await act(async () => {
      replacementSession.resolve({
        session: createTerminalSessionSnapshot('stale', 1),
        endpoint: null
      })
      await replacementSession.promise
    })

    expect(screen.getByLabelText('Terminal 1 文本输出')).toHaveAttribute(
      'data-terminal-session-id',
      'newer'
    )
  })
})

interface MockNode {
  readonly id: string
  readonly type?: string
  readonly data: unknown
  readonly position: { readonly x: number; readonly y: number }
  readonly zIndex?: number
}

interface MockReactFlowProps {
  readonly children?: ReactNode
  readonly nodes?: readonly MockNode[]
  readonly nodeTypes?: Record<string, ComponentType<Record<string, unknown>>>
}

function createWorkbenchWithTerminal(): WorkbenchSnapshot {
  const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
  return {
    ...workbench,
    graph: {
      ...workbench.graph,
      blocks: [
        {
          id: 'terminal-1',
          type: 'terminal',
          name: 'Terminal 1',
          description: '本地终端',
          launchCommand: 'pnpm dev',
          position: { x: 160, y: 220 },
          size: { width: 420, height: 306 }
        }
      ]
    }
  }
}

function createTerminalSessionSnapshot(sessionId: string, generation = 1): TerminalSessionSnapshot {
  return {
    id: sessionId,
    projectId: 'project-alpha-project',
    projectDirectory: '/tmp/alpha-project',
    workspaceId: 'main',
    workspaceDirectory: '/tmp/alpha-project',
    gitBranch: null,
    blockId: 'terminal-1',
    terminalBlockId: 'terminal-1',
    sessionId,
    runId: `${sessionId}-run`,
    generation,
    workingDirectory: '/tmp/alpha-project',
    processId: 1001,
    status: 'running',
    kind: 'direct',
    retentionPolicy: 'terminate-on-application-exit',
    recoveryKind: 'fresh',
    terminalSourceTheme: 'dark',
    inputHistory: [],
    exitCode: null,
    failureReason: null
  }
}

function runIdentity(sessionId: string, generation: number) {
  return {
    projectId: 'project-alpha-project',
    workspaceId: 'main',
    blockId: 'terminal-1',
    sessionId,
    runId: `${sessionId}-run`,
    generation
  }
}

function createNotificationController(): AppNotificationController {
  return {
    dismiss: vi.fn(),
    notify: vi.fn(() => 'notification-1'),
    update: vi.fn(() => true)
  }
}
