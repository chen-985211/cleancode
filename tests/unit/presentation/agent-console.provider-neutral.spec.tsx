import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { AgentConsole } from '../../../src/presentation/app-shell/AgentConsole'
import type { AgentProviderDescriptor } from '../../../src/contexts/agent/application/ports/AgentProviderContribution'
import {
  createAgentSessionSnapshot,
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'

const futureProvider = {
  capabilities: {
    activityTracking: false,
    cleancodeMcp: false,
    launchInstructions: true,
    resume: false,
    sessionIdentityCapture: false,
    sessionRefCodec: false
  },
  displayName: 'A Very Long Future Provider Name',
  icon: {
    paths: [{ d: 'M2 2h20v20H2z' }],
    viewBox: '0 0 24 24'
  },
  id: 'fixture-provider'
} as const satisfies AgentProviderDescriptor

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
        workspaceId: command.workspaceId
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
    const identity = screen.getByRole('img', { name: futureProvider.displayName })
    expect(identity).not.toHaveTextContent(futureProvider.displayName)
    expect(identity).toHaveAttribute('aria-label', futureProvider.displayName)
    expect(identity.querySelector('svg')).toHaveAttribute('viewBox', futureProvider.icon.viewBox)
    expect(identity.querySelector('path')).toHaveAttribute('d', futureProvider.icon.paths[0]?.d)
    expect(screen.queryByText(futureProvider.displayName)).not.toBeInTheDocument()
    expect(container.querySelector('.agent-console__activity-indicator')).not.toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'CleanCode MCP' })).not.toBeInTheDocument()
  })

  it('keeps provider identity, MCP, and actions in start, geometric-center, and end slots', async () => {
    const workbench = createWorkbenchSnapshot('/repo/future', 'future')
    const agent = createAgent(futureProvider.id, workbench.project.id)
    const mcpProvider = {
      ...futureProvider,
      capabilities: { ...futureProvider.capabilities, cleancodeMcp: true }
    }
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listAgentProviders: vi.fn(async () => [mcpProvider])
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

    await waitFor(() => expect(screen.getByRole('switch', { name: 'CleanCode MCP' })).toBeVisible())
    const start = container.querySelector('.agent-console-actions__start')
    const center = container.querySelector('.agent-console-actions__center')
    const end = container.querySelector('.agent-console-actions__end')

    expect(start).toContainElement(screen.getByRole('img', { name: futureProvider.displayName }))
    expect(start?.querySelector('.agent-console-actions__title')).toHaveTextContent('Future Agent')
    expect(center).toContainElement(screen.getByRole('switch', { name: 'CleanCode MCP' }))
    expect(end).toContainElement(screen.getByRole('button', { name: /Future Agent 更多操作/ }))
  })

  it('uses equal outer grid tracks so the MCP slot stays at the geometric center', () => {
    const styles = readFileSync(
      resolve(process.cwd(), 'src/presentation/app-shell/styles/agent-console.css'),
      'utf8'
    )
    const actionsRule = styles.split('.agent-console-actions {')[1]?.split('}')[0] ?? ''

    expect(actionsRule).toContain('grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);')
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

  it('keeps the Provider icon undecorated when activity tracking is available', async () => {
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
      expect(screen.getByRole('img', { name: futureProvider.displayName })).toBeInTheDocument()
    )
    expect(container.querySelector('.agent-console__activity-indicator')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: futureProvider.displayName })).toHaveAttribute(
      'aria-label',
      futureProvider.displayName
    )
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

    fireEvent.click(
      await screen.findByRole('button', {
        name: /^Future Agent 有 \d+ 个状态需要处理$/
      })
    )
    expect(screen.getByRole('button', { name: '新对话' })).toBeInTheDocument()
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
    workspaceId: 'main'
  }
}
