import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type * as ReactFlowModule from '@xyflow/react'
import type { ReactNode } from 'react'

import { AppShell } from '../../../src/presentation/app-shell/AppShell'
import type { WorkbenchSnapshot } from '../../../src/presentation/app-shell/types'
import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'

const reactFlowSpies = vi.hoisted(() => ({
  setCenter: vi.fn(async () => undefined)
}))

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactFlowModule>()
  const React = await import('react')

  return {
    ...actual,
    Background: () => null,
    Handle: () => null,
    NodeResizeControl: () => null,
    Panel: ({ children }: { readonly children?: ReactNode }) =>
      React.createElement('div', null, children),
    ReactFlow: ({ children, onInit }: MockReactFlowProps) => {
      const hasInitializedRef = React.useRef(false)

      React.useEffect(() => {
        if (hasInitializedRef.current) return
        hasInitializedRef.current = true
        onInit?.(createMockReactFlowInstance())
      }, [onInit])

      return React.createElement('div', { 'data-testid': 'mock-react-flow' }, children)
    }
  }
})

describe('app shell create Agent focus', () => {
  beforeEach(() => {
    reactFlowSpies.setCenter.mockClear()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: undefined
    })
  })

  it('focuses the Agent returned by creation before its flow node has rendered', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const firstAgent = createAgent('agent-1', workbench.project.id, {
      position: { x: 320, y: 140 },
      size: { width: 440, height: 520 }
    })
    const createdAgent = createAgent('agent-2', workbench.project.id, {
      position: { x: 900, y: 240 },
      size: { width: 720, height: 460 }
    })
    const runtimeApi = createRuntimeApi({
      listWorkbenches: vi.fn(async () => [{ ...workbench, agents: [firstAgent] }])
    })
    runtimeApi.createWorkspaceAgent.mockResolvedValue(createdAgent)

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })

    render(<AppShell />)

    fireEvent.click(await screen.findByRole('button', { name: '新建 Agent' }))

    await waitFor(() =>
      expect(reactFlowSpies.setCenter).toHaveBeenCalledWith(1_260, 470, {
        zoom: 0.9,
        duration: 220
      })
    )
    expect(runtimeApi.createWorkspaceAgent).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'codex' })
    )
  })

  it('creates a new Agent only after selecting one of multiple registered Providers', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const runtimeApi = createRuntimeApi({
      listAgentProviders: vi.fn(async () => [
        createProviderDescriptor('codex', 'Codex', true),
        createProviderDescriptor('claude-code', 'Claude Code', false)
      ]),
      listWorkbenches: vi.fn(async () => [workbench])
    })
    runtimeApi.createWorkspaceAgent.mockImplementation(async (command) =>
      createAgent(
        'agent-1',
        workbench.project.id,
        {
          position: command.layout.position,
          size: command.layout.size
        },
        command.providerId
      )
    )

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })

    render(<AppShell />)

    fireEvent.click(await screen.findByRole('button', { name: '新建 Agent' }))

    expect(await screen.findByRole('dialog', { name: '选择 Agent Provider' })).toBeVisible()
    expect(runtimeApi.createWorkspaceAgent).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Claude Code/ }))

    await waitFor(() =>
      expect(runtimeApi.createWorkspaceAgent).toHaveBeenCalledWith(
        expect.objectContaining({ providerId: 'claude-code' })
      )
    )
    expect(screen.queryByRole('dialog', { name: '选择 Agent Provider' })).not.toBeInTheDocument()
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
  readonly fitView: () => Promise<void>
}

function createMockReactFlowInstance(): MockReactFlowInstance {
  return {
    getNode: () => undefined,
    getViewport: () => ({ x: 0, y: 0, zoom: 0.6 }),
    getZoom: () => 0.6,
    setCenter: reactFlowSpies.setCenter,
    setViewport: async () => undefined,
    zoomOut: async () => undefined,
    zoomIn: async () => undefined,
    fitView: async () => undefined
  }
}

function createAgent(
  agentId: string,
  projectId: string,
  layout: {
    readonly position: { readonly x: number; readonly y: number }
    readonly size: { readonly width: number; readonly height: number }
  },
  providerId = 'codex'
) {
  return {
    agentId,
    cleancodeMcpEnabled: true,
    layout,
    name: agentId === 'agent-1' ? 'Agent 1' : 'Agent 2',
    projectId,
    providerId,
    workspaceName: 'main'
  }
}

function createProviderDescriptor(id: string, displayName: string, cleancodeMcp: boolean) {
  return {
    capabilities: {
      activityTracking: false,
      cleancodeMcp: cleancodeMcp ? ('best_effort' as const) : ('unsupported' as const),
      launchInstructions: cleancodeMcp,
      resume: id === 'codex',
      sessionIdentityCapture: id === 'codex',
      sessionRefCodec: id === 'codex'
    },
    displayName,
    id
  }
}
