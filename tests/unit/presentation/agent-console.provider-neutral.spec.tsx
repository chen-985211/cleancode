import { render, screen, waitFor } from '@testing-library/react'

import { AgentConsole } from '../../../src/presentation/app-shell/AgentConsole'
import type { AgentProviderDescriptor } from '../../../src/contexts/agent/application/ports/AgentProviderContribution'
import {
  createAgentSessionSnapshot,
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'

const futureProvider: AgentProviderDescriptor = {
  capabilities: {
    activityTracking: false,
    cleancodeMcp: 'unsupported',
    launchInstructions: true,
    resume: false,
    sessionIdentityCapture: false,
    sessionRefCodec: false
  },
  displayName: 'A Very Long Future Provider Name',
  id: 'fixture-provider'
}

describe('Agent console provider-neutral presentation', () => {
  afterEach(() => Reflect.deleteProperty(window, 'cleancode'))

  it('renders an unknown registered provider from its descriptor without optional controls', async () => {
    const workbench = createWorkbenchSnapshot('/repo/future', 'future')
    const agent = createAgent(futureProvider.id, workbench.project.id)
    const attachAgentSession = vi.fn(async (command) =>
      createAgentSessionSnapshot({
        agentId: command.agentId,
        projectDirectory: command.projectDirectory,
        projectId: command.projectId,
        providerId: command.providerId,
        runtime: {
          ...createAgentSessionSnapshot().runtime,
          activity: { status: 'working' }
        },
        workspaceDirectory: command.workspaceDirectory,
        workspaceName: command.workspaceName
      })
    )
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        attachAgentSession,
        listAgentProviders: vi.fn(async () => [futureProvider])
      })
    })

    const { container } = render(
      <AgentConsole
        agent={agent}
        currentWorkbench={workbench}
        currentWorkspace={workbench.project.workspaces[0]}
        onMcpCapabilityChange={vi.fn()}
        onRemove={vi.fn()}
        onRename={vi.fn()}
      />
    )

    await waitFor(() => expect(attachAgentSession).toHaveBeenCalledOnce())
    const identity = screen.getByTitle(futureProvider.displayName)
    expect(identity).toHaveTextContent(futureProvider.displayName)
    expect(identity).toHaveAttribute('aria-label', futureProvider.displayName)
    expect(container.querySelector('.agent-console__activity-indicator')).not.toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'CleanCode MCP' })).not.toBeInTheDocument()
  })

  it('does not optimistically show descriptor capabilities while the catalog is unresolved', async () => {
    const workbench = createWorkbenchSnapshot('/repo/future', 'future')
    const agent = createAgent(futureProvider.id, workbench.project.id)
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listAgentProviders: vi.fn(() => new Promise<readonly AgentProviderDescriptor[]>(() => {}))
      })
    })

    const { container } = render(
      <AgentConsole
        agent={agent}
        currentWorkbench={workbench}
        currentWorkspace={workbench.project.workspaces[0]}
        onMcpCapabilityChange={vi.fn()}
        onRemove={vi.fn()}
        onRename={vi.fn()}
      />
    )

    await waitFor(() => expect(window.cleancode?.attachAgentSession).toHaveBeenCalledOnce())
    expect(container.querySelector('.agent-console__activity-indicator')).not.toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'CleanCode MCP' })).not.toBeInTheDocument()
  })

  it('shows activity only when the provider declares activity tracking', async () => {
    const workbench = createWorkbenchSnapshot('/repo/future', 'future')
    const agent = createAgent(futureProvider.id, workbench.project.id)
    const trackedProvider = {
      ...futureProvider,
      capabilities: { ...futureProvider.capabilities, activityTracking: true }
    }
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        attachAgentSession: vi.fn(async (command) =>
          createAgentSessionSnapshot({
            agentId: command.agentId,
            providerId: command.providerId,
            runtime: {
              ...createAgentSessionSnapshot().runtime,
              activity: { status: 'working' }
            }
          })
        ),
        listAgentProviders: vi.fn(async () => [trackedProvider])
      })
    })

    const { container } = render(
      <AgentConsole
        agent={agent}
        currentWorkbench={workbench}
        currentWorkspace={workbench.project.workspaces[0]}
      />
    )

    await waitFor(() =>
      expect(container.querySelector('.agent-console__activity-indicator')).toBeInTheDocument()
    )
    expect(screen.getByLabelText(`${futureProvider.displayName}：工作中`)).toBeInTheDocument()
  })

  it('does not offer conversation restore when the provider does not declare resume support', async () => {
    const workbench = createWorkbenchSnapshot('/repo/future', 'future')
    const agent = createAgent(futureProvider.id, workbench.project.id)
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        attachAgentSession: vi.fn(async (command) =>
          createAgentSessionSnapshot({
            agentId: command.agentId,
            providerId: command.providerId,
            runtime: {
              ...createAgentSessionSnapshot().runtime,
              launch: { ...createAgentSessionSnapshot().runtime.launch, status: 'exited' }
            }
          })
        ),
        listAgentProviders: vi.fn(async () => [futureProvider])
      })
    })

    render(
      <AgentConsole
        agent={agent}
        currentWorkbench={workbench}
        currentWorkspace={workbench.project.workspaces[0]}
      />
    )

    expect(await screen.findByRole('button', { name: '新对话' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重新启动 Agent' })).not.toBeInTheDocument()
  })
})

function createAgent(providerId: string, projectId: string) {
  return {
    agentId: 'future-agent',
    cleancodeMcpEnabled: true,
    layout: { position: { x: 320, y: 140 }, size: { width: 440, height: 520 } },
    name: 'Future Agent',
    projectId,
    providerId,
    workspaceName: 'main'
  }
}
