import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { AgentConsole } from '../../../src/presentation/app-shell/AgentConsole'
import type { AgentToolApprovalController } from '../../../src/presentation/app-shell/agentToolApprovalTypes'
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

    expect(await screen.findByText('AI 操作审批')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('switch', { name: 'CleanCode MCP' }))

    await waitFor(() => expect(onMcpCapabilityChange).toHaveBeenCalledWith(agent, false))
    expect(clearForAgent).toHaveBeenCalledWith(agent.agentId)
  })
})
