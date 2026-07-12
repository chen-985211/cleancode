import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type * as ReactFlowModule from '@xyflow/react'
import type { ComponentType, ReactNode } from 'react'

import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'
import type { TerminalOutputEvent } from '../../../src/contexts/run/application/ports/TerminalProcessPort'
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
    Panel: ({
      children,
      className
    }: {
      readonly children?: ReactNode
      readonly className?: string
    }) => React.createElement('div', { className }, children),
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

          if (!NodeComponent) {
            return null
          }

          return React.createElement(NodeComponent, {
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
        }),
        children
      )
    }
  }
})

describe('app shell terminal launch command', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: undefined
    })
  })

  it('configures a missing launch command from the quick launch button', async () => {
    const workbench = createWorkbenchWithTerminal({ launchCommand: '' })
    const updateTerminalBlockMetadata = vi.fn(async (command) => ({
      ...workbench.graph,
      blocks: [
        {
          ...workbench.graph.blocks[0],
          name: command.name,
          description: command.description,
          launchCommand: command.launchCommand
        }
      ]
    }))

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench]),
        updateTerminalBlockMetadata,
        startTerminal: vi.fn(),
        writeTerminal: vi.fn()
      })
    })

    render(<AppShell />)

    const quickLaunchButton = await screen.findByRole('button', {
      name: 'Terminal 1 启动命令'
    })

    expect(quickLaunchButton).toBeEnabled()
    expect(quickLaunchButton).toHaveAttribute('data-launch-command-state', 'unconfigured')

    fireEvent.click(quickLaunchButton)

    const launchCommandInput = await screen.findByLabelText('启动命令')

    await waitFor(() => expect(launchCommandInput).toHaveFocus())
    expect(screen.getByLabelText('终端名称')).toHaveAttribute('placeholder', '例如：Web Server')
    expect(screen.getByLabelText('终端描述')).toHaveAttribute('placeholder', '例如：本地开发服务')
    expect(launchCommandInput).toHaveAttribute('placeholder', '例如：pnpm dev')
    fireEvent.change(screen.getByLabelText('启动命令'), {
      target: { value: ' pnpm dev ' }
    })
    fireEvent.click(screen.getByRole('button', { name: '保存终端信息' }))

    await waitFor(() =>
      expect(updateTerminalBlockMetadata).toHaveBeenCalledWith({
        projectDirectory: '/tmp/alpha-project',
        workspaceName: 'main',
        blockId: 'terminal-1',
        name: 'Terminal 1',
        description: '本地终端',
        launchCommand: 'pnpm dev'
      })
    )
    expect(window.cleancode?.startTerminal).not.toHaveBeenCalled()
    expect(window.cleancode?.writeTerminal).not.toHaveBeenCalled()
  })

  it('quick launches a configured terminal command in a replacement terminal session', async () => {
    const workbench = createWorkbenchWithTerminal({
      launchCommand: 'printf quick-launch-ok'
    })
    const startTerminal = vi.fn().mockResolvedValueOnce(createTerminalSessionSnapshot('session-1'))
    const writeTerminal = vi.fn(async () => createTerminalSessionSnapshot('session-written'))
    const terminateTerminal = vi.fn(async () => createTerminalSessionSnapshot('session-1'))

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench]),
        startTerminal,
        writeTerminal,
        terminateTerminal
      })
    })

    render(<AppShell />)

    const quickLaunchButton = await screen.findByRole('button', {
      name: 'Terminal 1 启动命令'
    })

    expect(quickLaunchButton).toHaveAttribute('data-launch-command-state', 'configured')

    fireEvent.click(quickLaunchButton)

    await waitFor(() =>
      expect(writeTerminal).toHaveBeenCalledWith({
        sessionId: 'session-1',
        input: 'printf quick-launch-ok\r'
      })
    )
    expect(writeTerminal).toHaveBeenCalledTimes(1)
    expect(startTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        terminalBlockId: 'terminal-1',
        workspaceName: 'main',
        workingDirectory: '/tmp/alpha-project'
      })
    )
  })

  it('clears the previous visible output when quick launching a replacement session', async () => {
    const workbench = createWorkbenchWithTerminal({
      launchCommand: 'printf quick-launch-fresh'
    })
    let emitTerminalOutput: ((event: TerminalOutputEvent) => void) | undefined
    const startTerminal = vi
      .fn()
      .mockResolvedValueOnce(createTerminalSessionSnapshot('session-1'))
      .mockResolvedValueOnce(createTerminalSessionSnapshot('session-2'))
    const writeTerminal = vi.fn(async () => createTerminalSessionSnapshot('session-written'))
    const terminateTerminal = vi.fn(async () => createTerminalSessionSnapshot('session-1'))
    const onTerminalOutput = vi.fn((listener: (event: TerminalOutputEvent) => void) => {
      emitTerminalOutput = listener
      return vi.fn()
    })

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench]),
        startTerminal,
        writeTerminal,
        terminateTerminal,
        onTerminalOutput
      })
    })

    render(<AppShell />)

    const quickLaunchButton = await screen.findByRole('button', {
      name: 'Terminal 1 启动命令'
    })

    fireEvent.click(quickLaunchButton)

    await waitFor(() =>
      expect(writeTerminal).toHaveBeenCalledWith({
        sessionId: 'session-1',
        input: 'printf quick-launch-fresh\r'
      })
    )

    expect(emitTerminalOutput).toEqual(expect.any(Function))

    act(() => {
      emitTerminalOutput?.({
        sessionId: 'session-1',
        data: 'stale-output'
      })
    })

    await waitFor(() =>
      expect(screen.getByLabelText('Terminal 1 文本输出')).toHaveTextContent('stale-output')
    )

    fireEvent.click(quickLaunchButton)

    await waitFor(() =>
      expect(writeTerminal).toHaveBeenLastCalledWith({
        sessionId: 'session-2',
        input: 'printf quick-launch-fresh\r'
      })
    )
    await waitFor(() =>
      expect(screen.getByLabelText('Terminal 1 文本输出')).not.toHaveTextContent('stale-output')
    )
  })

  it('clears the previous visible output when restarting a replacement session', async () => {
    const workbench = createWorkbenchWithTerminal({
      launchCommand: ''
    })
    let emitTerminalOutput: ((event: TerminalOutputEvent) => void) | undefined
    const startTerminal = vi
      .fn()
      .mockResolvedValueOnce(createTerminalSessionSnapshot('session-1'))
      .mockResolvedValueOnce(createTerminalSessionSnapshot('session-2'))
    const terminateTerminal = vi.fn(async () => createTerminalSessionSnapshot('session-1'))
    const onTerminalOutput = vi.fn((listener: (event: TerminalOutputEvent) => void) => {
      emitTerminalOutput = listener
      return vi.fn()
    })

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench]),
        startTerminal,
        terminateTerminal,
        onTerminalOutput
      })
    })

    render(<AppShell />)

    const moreButton = await screen.findByRole('button', {
      name: 'Terminal 1 更多终端操作'
    })

    fireEvent.click(moreButton)
    fireEvent.click(await screen.findByRole('button', { name: 'Terminal 1 重开空终端会话' }))
    await waitFor(() => expect(startTerminal).toHaveBeenCalledTimes(1))

    expect(emitTerminalOutput).toEqual(expect.any(Function))

    act(() => {
      emitTerminalOutput?.({
        sessionId: 'session-1',
        data: 'restart-stale-output'
      })
    })

    await waitFor(() =>
      expect(screen.getByLabelText('Terminal 1 文本输出')).toHaveTextContent('restart-stale-output')
    )

    fireEvent.click(moreButton)
    fireEvent.click(await screen.findByRole('button', { name: 'Terminal 1 重开空终端会话' }))

    await waitFor(() => expect(startTerminal).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(screen.getByLabelText('Terminal 1 文本输出')).not.toHaveTextContent(
        'restart-stale-output'
      )
    )
  })

  it('ignores duplicate quick launch clicks while the replacement session is starting', async () => {
    const workbench = createWorkbenchWithTerminal({
      launchCommand: 'printf quick-launch-once'
    })
    const replacementSession = createDeferred<TerminalSessionSnapshot>()
    const startTerminal = vi.fn(() => replacementSession.promise)
    const writeTerminal = vi.fn(async () => createTerminalSessionSnapshot('session-written'))
    const terminateTerminal = vi.fn(async () => createTerminalSessionSnapshot('session-old'))

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench]),
        startTerminal,
        writeTerminal,
        terminateTerminal
      })
    })

    render(<AppShell />)

    const quickLaunchButton = await screen.findByRole('button', {
      name: 'Terminal 1 启动命令'
    })

    fireEvent.click(quickLaunchButton)
    fireEvent.click(quickLaunchButton)

    await waitFor(() => expect(startTerminal).toHaveBeenCalledTimes(1))

    replacementSession.resolve(createTerminalSessionSnapshot('session-1'))

    await waitFor(() =>
      expect(writeTerminal).toHaveBeenCalledWith({
        sessionId: 'session-1',
        input: 'printf quick-launch-once\r'
      })
    )
    expect(writeTerminal).toHaveBeenCalledTimes(1)
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

function createWorkbenchWithTerminal(input: { readonly launchCommand: string }): WorkbenchSnapshot {
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
          launchCommand: input.launchCommand,
          position: { x: 160, y: 220 },
          size: { width: 420, height: 306 }
        }
      ]
    }
  }
}

function createTerminalSessionSnapshot(sessionId: string): TerminalSessionSnapshot {
  return {
    id: sessionId,
    terminalBlockId: 'terminal-1',
    workspaceName: 'main',
    workingDirectory: '/tmp/alpha-project',
    processId: 1001,
    status: 'running',
    inputHistory: [],
    exitCode: null,
    failureReason: null
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}
