import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type * as ReactFlowModule from '@xyflow/react'
import type { ReactNode } from 'react'
import type * as WorkbenchCanvasSafeViewportModule from '../../../src/presentation/app-shell/workbenchCanvasSafeViewport'

import { AppShell } from '../../../src/presentation/app-shell/AppShell'
import type { WorkbenchSnapshot } from '../../../src/presentation/app-shell/types/workbenchSnapshot'
import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'

const reactFlowSpies = vi.hoisted(() => ({
  setCenter: vi.fn(async () => undefined),
  setViewport: vi.fn(async () => undefined)
}))
const creationGeometry = vi.hoisted(() => ({
  canvasSize: { height: 900, width: 1_400 },
  safeViewport: { height: 676, width: 1_352, x: 24, y: 200 }
}))

vi.mock(
  '../../../src/presentation/app-shell/workbenchCanvasSafeViewport',
  async (importOriginal) => ({
    ...(await importOriginal<typeof WorkbenchCanvasSafeViewportModule>()),
    readWorkbenchCanvasCreationGeometry: () => creationGeometry
  })
)

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
    stubReducedMotionPreference()
    reactFlowSpies.setCenter.mockClear()
    reactFlowSpies.setViewport.mockClear()
    window.localStorage.clear()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: undefined
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('creates with the default Provider immediately and focuses the returned Agent', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const firstAgent = createAgent('agent-1', workbench.project.id, {
      position: { x: 320, y: 140 },
      size: { width: 440, height: 520 }
    })
    const runtimeApi = createRuntimeApi({
      listWorkbenches: vi.fn(async () => [{ ...workbench, agents: [firstAgent] }])
    })
    runtimeApi.discoverCreatableAgentProviders.mockResolvedValue([
      createCreatableProvider('codex', 'Codex', true)
    ])
    runtimeApi.createWorkspaceAgent.mockImplementation(async (command) =>
      createAgent('agent-2', workbench.project.id, {
        position: command.initialPosition,
        size: { width: 720, height: 460 }
      })
    )

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })

    render(<AppShell />)

    const createButton = await screen.findByRole('button', { name: '新建 Agent' })
    await waitFor(() => expect(createButton).toBeEnabled())
    fireEvent.click(createButton)

    await waitFor(() =>
      expect(runtimeApi.createWorkspaceAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          initialPosition: {
            x: expect.any(Number),
            y: expect.any(Number)
          },
          providerId: 'codex'
        })
      )
    )
    const initialPosition = runtimeApi.createWorkspaceAgent.mock.calls[0]![0].initialPosition
    await waitFor(() =>
      expect(reactFlowSpies.setViewport).toHaveBeenCalledWith(
        {
          x: 700 - (initialPosition.x + 360),
          y: 538 - (initialPosition.y + 230),
          zoom: 1
        },
        {
          duration: 0
        }
      )
    )
    expect(reactFlowSpies.setCenter).not.toHaveBeenCalled()
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('creates with the Provider selected from the arrow menu without a second click', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const runtimeApi = createRuntimeApi({
      discoverCreatableAgentProviders: vi.fn(async () => [
        createCreatableProvider('codex', 'Codex', true),
        createCreatableProvider('claude-code', 'Claude Code', false)
      ]),
      listWorkbenches: vi.fn(async () => [workbench])
    })
    runtimeApi.createWorkspaceAgent.mockImplementation(async (command) =>
      createAgent(
        command.agentId,
        workbench.project.id,
        {
          position: { x: 540, y: 120 },
          size: { width: 720, height: 460 }
        },
        command.providerId
      )
    )

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })

    render(<AppShell />)

    await screen.findByRole('button', { name: '新建 Agent' })
    const menuButton = screen.getByRole('button', { name: '选择默认 Agent' })
    await waitFor(() => expect(menuButton).toBeEnabled())
    fireEvent.click(menuButton)
    expect(runtimeApi.createWorkspaceAgent).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Claude Code' }))

    await waitFor(() =>
      expect(runtimeApi.createWorkspaceAgent).toHaveBeenCalledWith(
        expect.objectContaining({ providerId: 'claude-code' })
      )
    )
    expect(runtimeApi.createWorkspaceAgent).toHaveBeenCalledOnce()
  })

  it('keeps both split-button segments disabled until creatable Provider discovery completes', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    let resolveDiscovery: (
      providers: readonly ReturnType<typeof createCreatableProvider>[]
    ) => void = () => undefined
    const discovery = new Promise<readonly ReturnType<typeof createCreatableProvider>[]>(
      (resolve) => {
        resolveDiscovery = resolve
      }
    )
    const runtimeApi = createRuntimeApi({
      discoverCreatableAgentProviders: vi.fn(() => discovery),
      listAgentProviders: vi.fn(async () => [
        createProviderDescriptor('codex', 'Codex', true),
        createProviderDescriptor('claude-code', 'Claude Code', false)
      ]),
      listWorkbenches: vi.fn(async () => [workbench])
    })

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })

    render(<AppShell />)
    const createButton = await screen.findByRole('button', { name: '新建 Agent' })
    const menuButton = screen.getByRole('button', { name: '选择默认 Agent' })
    expect(createButton).toBeDisabled()
    expect(menuButton).toBeDisabled()
    expect(runtimeApi.createWorkspaceAgent).not.toHaveBeenCalled()

    await act(async () => {
      resolveDiscovery([createCreatableProvider('codex', 'Codex', true)])
      await discovery
    })

    await waitFor(() => expect(menuButton).toBeEnabled())
    fireEvent.click(menuButton)
    expect(screen.getByRole('menuitemradio', { name: 'Codex' })).toBeVisible()
    expect(screen.queryByRole('menuitemradio', { name: 'Claude Code' })).not.toBeInTheDocument()
  })

  it('opens Agent settings without creating when no CLI is available', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const discoverCreatableAgentProviders = vi.fn(async () => [])
    const runtimeApi = createRuntimeApi({
      discoverCreatableAgentProviders,
      listWorkbenches: vi.fn(async () => [workbench])
    })

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })

    render(<AppShell />)
    const createButton = await screen.findByRole('button', { name: '新建 Agent' })
    await waitFor(() => expect(createButton).toBeEnabled())
    fireEvent.click(createButton)

    expect(await screen.findByRole('dialog', { name: '设置' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Agent' })).toBeVisible()
    expect(runtimeApi.createWorkspaceAgent).not.toHaveBeenCalled()
  })

  it('can retry discovery from Agent settings and then create directly', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const discoverCreatableAgentProviders = vi
      .fn()
      .mockRejectedValueOnce(new Error('probe failed'))
      .mockResolvedValueOnce([createCreatableProvider('codex', 'Codex', true)])
    const runtimeApi = createRuntimeApi({
      discoverCreatableAgentProviders,
      listWorkbenches: vi.fn(async () => [workbench])
    })

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })

    render(<AppShell />)
    const createButton = await screen.findByRole('button', { name: '新建 Agent' })
    await waitFor(() => expect(createButton).toBeEnabled())
    fireEvent.click(createButton)

    expect(await screen.findByRole('heading', { name: 'Agent' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '重新检测' }))
    await waitFor(() => expect(discoverCreatableAgentProviders).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: '返回工作区' }))
    await waitFor(() => expect(createButton).toBeEnabled())
    fireEvent.click(createButton)

    await waitFor(() =>
      expect(runtimeApi.createWorkspaceAgent).toHaveBeenCalledWith(
        expect.objectContaining({ providerId: 'codex' })
      )
    )
    expect(discoverCreatableAgentProviders).toHaveBeenCalledTimes(2)
  })

  it('reports creation failure without reopening Provider selection and allows retry', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const createdAgent = createAgent('agent-1', workbench.project.id, {
      position: { x: 320, y: 140 },
      size: { width: 440, height: 520 }
    })
    const runtimeApi = createRuntimeApi({
      discoverCreatableAgentProviders: vi.fn(async () => [
        createCreatableProvider('codex', 'Codex', true)
      ]),
      listWorkbenches: vi.fn(async () => [workbench])
    })
    runtimeApi.createWorkspaceAgent
      .mockRejectedValueOnce(new Error('CLI disappeared'))
      .mockResolvedValueOnce(createdAgent)

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })

    const notify = vi.fn(() => 'notification-1')
    render(
      <AppShell
        notifications={{
          dismiss: vi.fn(),
          notify,
          update: vi.fn(() => true)
        }}
      />
    )
    const createButton = await screen.findByRole('button', { name: '新建 Agent' })
    await waitFor(() => expect(createButton).toBeEnabled())
    fireEvent.click(createButton)
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'error', title: '无法创建 Agent' })
      )
    )
    expect(screen.queryByRole('dialog', { name: '选择 Agent Provider' })).not.toBeInTheDocument()
    fireEvent.click(createButton)

    await waitFor(() => expect(runtimeApi.createWorkspaceAgent).toHaveBeenCalledTimes(2))
    const firstCommand = runtimeApi.createWorkspaceAgent.mock.calls[0]![0]
    const currentWorkspace = workbench.project.workspaces[0]!
    expect(firstCommand).toEqual({
      agentId: expect.any(String),
      gitBranch: currentWorkspace.gitBranch,
      initialPosition: {
        x: expect.any(Number),
        y: expect.any(Number)
      },
      projectDirectory: workbench.project.directory,
      projectId: workbench.project.id,
      providerId: 'codex',
      workspaceDirectory: currentWorkspace.directory,
      workspaceId: currentWorkspace.workspaceId
    })
  })

  it('ignores a creation result that arrives after switching workspaces', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
      workspaces: [
        {
          workspaceId: 'workspace-main',
          workspaceKind: 'default',
          displayName: 'main',
          directory: '/tmp/alpha-project',
          gitBranch: 'main',
          isCurrent: true
        },
        {
          workspaceId: 'workspace-feature-agent',
          workspaceKind: 'linked-worktree',
          displayName: 'feature/agent',
          directory: '/tmp/alpha-feature',
          gitBranch: 'feature/agent',
          isCurrent: false
        }
      ]
    })
    const switchedWorkbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
      gitBranch: 'feature/agent',
      workspaceDirectory: '/tmp/alpha-feature',
      workspaceId: 'feature/agent',
      workspaces: [
        {
          workspaceId: 'workspace-main',
          workspaceKind: 'default',
          displayName: 'main',
          directory: '/tmp/alpha-project',
          gitBranch: 'main',
          isCurrent: false
        },
        {
          workspaceId: 'workspace-feature-agent',
          workspaceKind: 'linked-worktree',
          displayName: 'feature/agent',
          directory: '/tmp/alpha-feature',
          gitBranch: 'feature/agent',
          isCurrent: true
        }
      ]
    })
    let resolveCreation = (agent: ReturnType<typeof createAgent>): void => {
      void agent
    }
    const creation = new Promise<ReturnType<typeof createAgent>>((resolve) => {
      resolveCreation = resolve
    })
    const runtimeApi = createRuntimeApi({
      createWorkspaceAgent: vi.fn(() => creation),
      discoverCreatableAgentProviders: vi.fn(async () => [
        createCreatableProvider('codex', 'Codex', true)
      ]),
      listWorkbenches: vi.fn(async () => [workbench]),
      switchBranchWorkspace: vi.fn(async () => switchedWorkbench)
    })

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })

    render(<AppShell />)
    const createButton = await screen.findByRole('button', { name: '新建 Agent' })
    await waitFor(() => expect(createButton).toBeEnabled())
    fireEvent.click(createButton)

    const projectCard = await screen.findByRole('group', { name: '项目 alpha-project' })
    fireEvent.click(within(projectCard).getByRole('button', { name: 'feature/agent 独立工作区' }))
    await waitFor(() => expect(runtimeApi.switchBranchWorkspace).toHaveBeenCalledOnce())
    reactFlowSpies.setViewport.mockClear()

    await act(async () => {
      resolveCreation(
        createAgent('agent-stale', workbench.project.id, {
          position: { x: 540, y: 120 },
          size: { width: 720, height: 460 }
        })
      )
      await creation
    })

    expect(
      document.querySelector('[data-agent-console-node="agent-stale"]')
    ).not.toBeInTheDocument()
    expect(reactFlowSpies.setCenter).not.toHaveBeenCalled()
    expect(reactFlowSpies.setViewport).not.toHaveBeenCalled()
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
  readonly setViewport: typeof reactFlowSpies.setViewport
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
    setViewport: reactFlowSpies.setViewport,
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
    workspaceId: 'main'
  }
}

function createProviderDescriptor(id: string, displayName: string, cleancodeMcp: boolean) {
  return {
    capabilities: {
      activityTracking: false,
      cleancodeMcp,
      launchInstructions: cleancodeMcp,
      resume: id === 'codex',
      sessionIdentityCapture: id === 'codex',
      sessionRefCodec: id === 'codex'
    },
    displayName,
    icon: {
      paths: [{ d: 'M2 2h20v20H2z' }],
      viewBox: '0 0 24 24'
    },
    id
  }
}

function createCreatableProvider(id: string, displayName: string, cleancodeMcp: boolean) {
  return {
    availability: {
      providerId: id,
      status: 'installed' as const,
      version: 'test'
    },
    descriptor: createProviderDescriptor(id, displayName, cleancodeMcp)
  }
}
