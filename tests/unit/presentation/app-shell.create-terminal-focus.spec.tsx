import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type * as ReactFlowModule from '@xyflow/react'
import type { ReactNode } from 'react'

import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'
import { AppShell } from '../../../src/presentation/app-shell/AppShell'
import type {
  WorkbenchFlowNode,
  WorkbenchSnapshot
} from '../../../src/presentation/app-shell/types'

const reactFlowSpies = vi.hoisted(() => ({
  fitView: vi.fn(async () => undefined),
  setCenter: vi.fn(async () => undefined),
  setViewport: vi.fn(async () => undefined),
  zoomIn: vi.fn(async () => undefined),
  zoomOut: vi.fn(async () => undefined)
}))

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
    ReactFlow: ({ children, nodes = [], onInit }: MockReactFlowProps) => {
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
        children,
        nodes.map((node) =>
          React.createElement('div', {
            key: node.id,
            'data-selected': String(Boolean(node.selected)),
            'data-testid': `mock-node-${node.id}`
          })
        )
      )
    }
  }
})

describe('app shell create terminal focus', () => {
  beforeEach(() => {
    reactFlowSpies.fitView.mockClear()
    reactFlowSpies.setCenter.mockClear()
    reactFlowSpies.setViewport.mockClear()
    reactFlowSpies.zoomIn.mockClear()
    reactFlowSpies.zoomOut.mockClear()
    window.localStorage.clear()
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: undefined
    })
  })

  it('animates toward the terminal block returned by creation before the next graph render catches up', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const createdBlock = createTerminalBlockSnapshot()
    const runtimeApi = createRuntimeApi({
      listWorkbenches: vi.fn(async () => [workbench])
    })

    runtimeApi.createTerminalBlock.mockResolvedValue({
      ...workbench.graph,
      blocks: [createdBlock]
    })

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })

    render(<AppShell />)

    fireEvent.click(await screen.findByRole('button', { name: '新建终端积木' }))

    await waitFor(() =>
      expect(reactFlowSpies.setCenter).toHaveBeenCalledWith(730, 420, {
        zoom: 1,
        duration: 220
      })
    )
  })

  it('fits the canvas when entering terminal group selection mode', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [
          {
            ...workbench,
            graph: {
              ...workbench.graph,
              blocks: [
                createTerminalBlockSnapshot({ id: 'terminal-1', name: 'Terminal 1' }),
                createTerminalBlockSnapshot({
                  id: 'terminal-2',
                  name: 'Terminal 2',
                  position: { x: 980, y: 240 }
                })
              ]
            }
          }
        ])
      })
    })

    render(<AppShell />)

    fireEvent.click(await screen.findByRole('button', { name: '组合终端' }))

    await waitFor(() =>
      expect(reactFlowSpies.fitView).toHaveBeenCalledWith({
        padding: 0.22,
        duration: 180
      })
    )
  })

  it('dispatches canvas shortcuts to the current React Flow instance', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench])
      })
    })

    render(<AppShell />)

    await screen.findByTestId('mock-react-flow')
    await waitFor(() => expect(screen.getByRole('button', { name: '新建终端积木' })).toBeEnabled())

    reactFlowSpies.fitView.mockClear()
    const primaryModifier = /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
      ? { metaKey: true }
      : { ctrlKey: true }

    fireEvent.keyDown(document, { key: '=', ...primaryModifier })
    fireEvent.keyDown(document, { key: '-', ...primaryModifier })
    fireEvent.keyDown(document, { key: '0', ...primaryModifier })

    expect(reactFlowSpies.zoomIn).toHaveBeenCalledWith({ duration: 160 })
    expect(reactFlowSpies.zoomOut).toHaveBeenCalledWith({ duration: 160 })
    expect(reactFlowSpies.fitView).toHaveBeenCalledWith({
      padding: 0.22,
      duration: 180
    })
  })

  it('selects canvas nodes by direction without animated panning and toggles the minimap', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [
          {
            ...workbench,
            graph: {
              ...workbench.graph,
              blocks: [
                createTerminalBlockSnapshot({ id: 'left-terminal', position: { x: 100, y: 240 } }),
                createTerminalBlockSnapshot({
                  id: 'right-terminal',
                  position: { x: 700, y: 240 }
                })
              ]
            }
          }
        ])
      })
    })

    render(<AppShell />)

    await screen.findByTestId('mock-react-flow')
    await waitFor(() => expect(screen.getByRole('button', { name: '收起小地图' })).toBeEnabled())
    await screen.findByTestId('mock-node-right-terminal')
    const primaryModifier = /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
      ? { metaKey: true }
      : { ctrlKey: true }
    reactFlowSpies.setViewport.mockClear()
    expect(screen.queryByTestId('mock-node-agent:default-agent')).not.toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'ArrowRight', ...primaryModifier })

    await waitFor(() =>
      expect(screen.getByTestId('mock-node-right-terminal')).toHaveAttribute(
        'data-selected',
        'true'
      )
    )
    expect(reactFlowSpies.setViewport).not.toHaveBeenCalled()

    fireEvent.keyDown(document, { key: 'ArrowLeft', ...primaryModifier })

    await waitFor(() =>
      expect(screen.getByTestId('mock-node-left-terminal')).toHaveAttribute('data-selected', 'true')
    )

    fireEvent.keyDown(document, { key: 'm', shiftKey: true, ...primaryModifier })

    expect(screen.getByRole('button', { name: '展开小地图' })).toBeInTheDocument()
  })
})

interface MockReactFlowProps {
  readonly children?: ReactNode
  readonly nodes?: readonly WorkbenchFlowNode[]
  readonly onInit?: (instance: MockReactFlowInstance) => void
}

interface MockReactFlowInstance {
  readonly getNode: () => undefined
  readonly getViewport: () => WorkbenchSnapshot['graph']['viewport']
  readonly getZoom: () => number
  readonly setCenter: typeof reactFlowSpies.setCenter
  readonly setViewport: typeof reactFlowSpies.setViewport
  readonly zoomOut: typeof reactFlowSpies.zoomOut
  readonly zoomIn: typeof reactFlowSpies.zoomIn
  readonly fitView: typeof reactFlowSpies.fitView
}

function createMockReactFlowInstance(): MockReactFlowInstance {
  return {
    getNode: () => undefined,
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    getZoom: () => 1,
    setCenter: reactFlowSpies.setCenter,
    setViewport: reactFlowSpies.setViewport,
    zoomOut: reactFlowSpies.zoomOut,
    zoomIn: reactFlowSpies.zoomIn,
    fitView: reactFlowSpies.fitView
  }
}

function createTerminalBlockSnapshot(
  input: {
    readonly id?: string
    readonly name?: string
    readonly position?: { readonly x: number; readonly y: number }
  } = {}
) {
  return {
    id: input.id ?? 'created-terminal',
    type: 'terminal' as const,
    name: input.name ?? 'Terminal 1',
    description: '本地终端',
    launchCommand: '',
    position: input.position ?? { x: 450, y: 240 },
    size: { width: 560, height: 360 }
  }
}
