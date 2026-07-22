import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { UpdateWorkspaceAgentMcpCapabilityResult } from '../../../src/contexts/agent/application/use-cases/UpdateWorkspaceAgentMcpCapabilityUseCase'
import { AgentConsole } from '../../../src/presentation/app-shell/AgentConsole'
import type { AgentToolApprovalController } from '../../../src/presentation/app-shell/agentToolApprovalTypes'
import {
  createAgentSessionSnapshot,
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'

describe('Agent console CleanCode MCP toggle', () => {
  it('hides the MCP control when the current Provider does not contribute that capability', async () => {
    const workbench = createWorkbenchSnapshot('/repo/app', 'app')
    const currentWorkspace = workbench.project.workspaces[0]!
    const runtime = createRuntimeApi({
      listAgentProviders: vi.fn(async () => [
        {
          capabilities: {
            activityTracking: false,
            cleancodeMcp: 'unsupported',
            launchInstructions: false,
            resume: false,
            sessionIdentityCapture: false,
            sessionRefCodec: false
          },
          displayName: 'OpenCode',
          id: 'opencode'
        }
      ])
    })
    Object.defineProperty(window, 'cleancode', { configurable: true, value: runtime })

    render(
      <AgentConsole
        agent={{
          ...createAgent(workbench.project.id, currentWorkspace.name),
          providerId: 'opencode'
        }}
        currentWorkbench={workbench}
        currentWorkspace={currentWorkspace}
        onMcpCapabilityChange={vi.fn()}
        onRemove={vi.fn()}
        onRename={vi.fn()}
      />
    )

    await waitFor(() => expect(runtime.listAgentProviders).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.queryByRole('switch', { name: 'CleanCode MCP' })).not.toBeInTheDocument()
    )
  })

  it('keeps the switch in the title bar and clears stale deletion approval after restart', async () => {
    const workbench = createWorkbenchSnapshot('/repo/app', 'app')
    const currentWorkspace = workbench.project.workspaces[0]!
    const agent = {
      agentId: 'agent-1',
      cleancodeMcpEnabled: true,
      layout: { position: { x: 540, y: 120 }, size: { width: 720, height: 460 } },
      name: 'Agent 1',
      projectId: workbench.project.id,
      providerId: 'codex',
      workspaceName: currentWorkspace.name
    }
    const clearForAgent = vi.fn()
    const approvalController: AgentToolApprovalController = {
      approvals: [
        {
          phase: 'awaiting',
          request: {
            agentId: agent.agentId,
            approvalId: 'approval-1',
            projectDirectory: workbench.project.directory,
            sessionId: 'agent-session-1',
            summary: '删除终端积木 terminal-1',
            target: { blockId: 'terminal-1', kind: 'terminal_block' },
            toolName: 'delete_block',
            workspaceName: currentWorkspace.name
          }
        }
      ],
      approve: vi.fn(async () => undefined),
      clearForAgent,
      dismiss: vi.fn(),
      locate: vi.fn(),
      reject: vi.fn(async () => undefined)
    }
    const onMcpCapabilityChange = vi.fn(async () => ({
      agent: { ...agent, cleancodeMcpEnabled: false },
      session: createAgentSessionSnapshot({
        agentId: agent.agentId,
        gitBranch: null,
        projectDirectory: workbench.project.directory,
        projectId: workbench.project.id,
        providerId: 'codex',
        sessionId: 'agent-session-restarted',
        terminalSourceTheme: 'light' as const,
        workspaceDirectory: currentWorkspace.directory,
        workspaceName: currentWorkspace.name
      })
    }))
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi()
    })

    const { container } = render(
      <AgentConsole
        agent={agent}
        approvalController={approvalController}
        currentWorkbench={workbench}
        currentWorkspace={currentWorkspace}
        onMcpCapabilityChange={onMcpCapabilityChange}
        onRemove={vi.fn(async () => undefined)}
        onRename={vi.fn(async () => undefined)}
      />
    )
    await waitFor(() => expect(window.cleancode?.attachAgentSession).toHaveBeenCalled())
    expect(container.querySelector('.agent-console__header [role="switch"]')).toBeInTheDocument()

    expect(await screen.findByRole('heading', { name: '删除终端' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('switch', { name: 'CleanCode MCP' }))

    await waitFor(() => expect(onMcpCapabilityChange).toHaveBeenCalledWith(agent, false))
    expect(clearForAgent).toHaveBeenCalledWith(agent.agentId)
  })

  it('does not bind a late MCP restart result to a different workspace', async () => {
    const mainWorkbench = createWorkbenchSnapshot('/repo/app', 'app')
    const featureWorkbench = createWorkbenchSnapshot('/repo/app', 'app', {
      gitBranch: 'feature',
      workspaceDirectory: '/repo/app-worktrees/feature',
      workspaceName: 'feature'
    })
    const mainWorkspace = mainWorkbench.project.workspaces[0]!
    const featureWorkspace = featureWorkbench.project.workspaces[0]!
    const mainAgent = createAgent(mainWorkbench.project.id, 'main')
    const featureAgent = createAgent(featureWorkbench.project.id, 'feature')
    const pendingUpdate = createDeferred<UpdateWorkspaceAgentMcpCapabilityResult>()
    const onMcpCapabilityChange = vi.fn(() => pendingUpdate.promise)
    const writeAgentSession = vi.fn(async () => undefined)
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({ writeAgentSession })
    })
    const actions = {
      onRemove: vi.fn(async () => undefined),
      onRename: vi.fn(async () => undefined)
    }
    const { rerender } = render(
      <AgentConsole
        {...actions}
        agent={mainAgent}
        currentWorkbench={mainWorkbench}
        currentWorkspace={mainWorkspace}
        onMcpCapabilityChange={onMcpCapabilityChange}
      />
    )

    await waitFor(() => expect(window.cleancode?.attachAgentSession).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('switch', { name: 'CleanCode MCP' }))
    await waitFor(() => expect(onMcpCapabilityChange).toHaveBeenCalled())
    rerender(
      <AgentConsole
        {...actions}
        agent={featureAgent}
        currentWorkbench={featureWorkbench}
        currentWorkspace={featureWorkspace}
        onMcpCapabilityChange={onMcpCapabilityChange}
      />
    )
    await waitFor(() =>
      expect(window.cleancode?.attachAgentSession).toHaveBeenLastCalledWith(
        expect.objectContaining({ workspaceName: 'feature' })
      )
    )

    await act(async () => {
      pendingUpdate.resolve({
        agent: { ...mainAgent, cleancodeMcpEnabled: false },
        session: createAgentSessionSnapshot({
          agentId: mainAgent.agentId,
          gitBranch: null,
          projectDirectory: '/repo/app',
          projectId: mainWorkbench.project.id,
          providerId: 'codex',
          sessionId: 'agent-main-restarted',
          terminalSourceTheme: 'light',
          workspaceDirectory: '/repo/app',
          workspaceName: 'main'
        })
      })
    })
    fireEvent.change(screen.getByLabelText('Codex CLI 输入'), {
      target: { value: 'feature input' }
    })

    expect(writeAgentSession).toHaveBeenLastCalledWith({
      input: 'feature input',
      sessionId: 'agent-feature'
    })
  })
})

function createAgent(projectId: string, workspaceName: string) {
  return {
    agentId: 'agent-1',
    cleancodeMcpEnabled: true,
    layout: { position: { x: 540, y: 120 }, size: { width: 720, height: 460 } },
    name: 'Agent 1',
    projectId,
    providerId: 'codex',
    workspaceName
  }
}

function createDeferred<T>(): { readonly promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}
