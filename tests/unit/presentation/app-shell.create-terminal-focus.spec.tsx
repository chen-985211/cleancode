import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type * as ReactFlowModule from '@xyflow/react'
import type { ReactNode } from 'react'

import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'
import { AppShell } from '../../../src/presentation/app-shell/AppShell'
import type { WorkbenchSnapshot } from '../../../src/presentation/app-shell/types'

const reactFlowSpies = vi.hoisted(() => ({
  fitView: vi.fn(async () => undefined),
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
    NodeResizeControl: () => null,
    Panel: ({ children }: { readonly children?: ReactNode }) =>
      React.createElement('div', null, children),
    ReactFlow: ({ children, onInit }: MockReactFlowProps) => {
      const hasInitializedRef = React.useRef(false)

      React.useEffect(() => {
        if (hasInitializedRef.current) {
          return
        }

        hasInitializedRef.current = true
        onInit?.(createMockReactFlowInstance())
      }, [onInit])

      return React.createElement('div', { 'data-testid': 'mock-react-flow' }, children)
    }
  }
})

describe('app shell create terminal focus', () => {
  beforeEach(() => {
    reactFlowSpies.fitView.mockClear()
    reactFlowSpies.setCenter.mockClear()
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: undefined
    })
  })

  it('centers the terminal block returned by creation before the next graph render catches up', async () => {
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
      expect(reactFlowSpies.setCenter).toHaveBeenCalledWith(660, 393, {
        zoom: 1,
        duration: 0
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
})

interface MockReactFlowProps {
  readonly children?: ReactNode
  readonly onInit?: (instance: MockReactFlowInstance) => void
}

interface MockReactFlowInstance {
  readonly getNode: () => undefined
  readonly getViewport: () => WorkbenchSnapshot['graph']['viewport']
  readonly getZoom: () => number
  readonly setCenter: typeof reactFlowSpies.setCenter
  readonly setViewport: () => Promise<void>
  readonly zoomOut: () => Promise<void>
  readonly zoomIn: () => Promise<void>
  readonly fitView: typeof reactFlowSpies.fitView
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
    size: { width: 420, height: 306 }
  }
}
