import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { AgentToolApprovalRequest } from '../../../src/contexts/agent/application/dto/AgentSessionProtocol'
import { AgentConsole } from '../../../src/presentation/app-shell/AgentConsole'
import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'

describe('Agent console CleanCode MCP toggle', () => {
  it('keeps the switch in the title bar and clears stale deletion approval after restart', async () => {
    const workbench = createWorkbenchSnapshot('/repo/app', 'app')
    const currentWorkspace = workbench.project.workspaces[0]!
    const agent = {
      agentId: 'agent-1',
      cleancodeMcpEnabled: true,
      layout: { position: { x: 540, y: 120 }, size: { width: 720, height: 460 } },
      name: 'Agent 1',
      projectId: workbench.project.id,
      workspaceName: currentWorkspace.name
    }
    let approvalListener: ((approval: AgentToolApprovalRequest) => void) | undefined
    const onMcpCapabilityChange = vi.fn(async () => ({
      agent: { ...agent, cleancodeMcpEnabled: false },
      session: {
        agentId: agent.agentId,
        codexThreadId: null,
        gitBranch: null,
        processId: 2,
        projectDirectory: workbench.project.directory,
        projectId: workbench.project.id,
        sessionId: 'agent-session-restarted',
        status: 'running' as const,
        workspaceDirectory: currentWorkspace.directory,
        workspaceName: currentWorkspace.name
      }
    }))
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        onAgentToolApprovalRequested: vi.fn((listener) => {
          approvalListener = listener
          return vi.fn()
        })
      })
    })

    const { container } = render(
      <AgentConsole
        agent={agent}
        currentWorkbench={workbench}
        currentWorkspace={currentWorkspace}
        onMcpCapabilityChange={onMcpCapabilityChange}
        onRemove={vi.fn(async () => undefined)}
        onRename={vi.fn(async () => undefined)}
      />
    )
    await waitFor(() => expect(window.cleancode?.attachAgentSession).toHaveBeenCalled())
    expect(container.querySelector('.agent-console__header [role="switch"]')).toBeInTheDocument()

    approvalListener?.({
      agentId: agent.agentId,
      approvalId: 'approval-1',
      projectDirectory: workbench.project.directory,
      sessionId: 'agent-session-1',
      summary: '删除终端积木 terminal-1',
      toolName: 'delete_block',
      workspaceName: currentWorkspace.name
    })
    expect(await screen.findByText('需要授权')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('switch', { name: 'CleanCode MCP' }))

    await waitFor(() => expect(onMcpCapabilityChange).toHaveBeenCalledWith(agent, false))
    await waitFor(() => expect(screen.queryByText('需要授权')).not.toBeInTheDocument())
  })
})
