import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode, type PropsWithChildren } from 'react'

import type { AgentToolApprovalRequest } from '../../../src/contexts/agent/application/dto/AgentSessionProtocol'
import { AgentSessionBindingContext } from '../../../src/presentation/app-shell/coordinators/agentSessionBindingContext'
import { AgentSessionBindingStore } from '../../../src/presentation/app-shell/coordinators/agentSessionBindingStore'
import { useAgentSessionAttachment } from '../../../src/presentation/app-shell/coordinators/useAgentSessionAttachment'
import { useAgentToolApprovals } from '../../../src/presentation/app-shell/coordinators/useAgentToolApprovals'
import {
  createAgentSessionSnapshot,
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'

afterEach(() => {
  Object.defineProperty(window, 'cleancode', { configurable: true, value: undefined })
})

it.each(['before leaving', 'while hidden'] as const)(
  'restores an approval requested %s on a hot workspace return without attaching the Agent',
  async (requestedAt) => {
    const fixture = createFixture()
    const { result, rerender } = renderHook(fixture.useWorkspace, {
      initialProps: { workspaceId: 'main' },
      wrapper: fixture.wrapper
    })
    if (requestedAt === 'before leaving') {
      act(() => fixture.requestApproval())
      expect(result.current.approvals.approvals).toHaveLength(1)
    }

    rerender({ workspaceId: 'other' })
    expect(result.current.approvals.approvals).toEqual([])
    if (requestedAt === 'while hidden') act(() => fixture.requestApproval())
    expect(result.current.approvals.approvals).toEqual([])

    rerender({ workspaceId: 'main' })

    expect(result.current.attachment.session).toBe(fixture.sessions.main)
    expect(fixture.api.attachAgentSession).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(result.current.approvals.approvals).toEqual([
        { phase: 'awaiting', request: fixture.request }
      ])
    )
    act(() => fixture.requestApproval())
    expect(result.current.approvals.approvals).toHaveLength(1)

    await act(async () => {
      await result.current.approvals.approve(fixture.request)
    })
    expect(fixture.api.approveAgentTool).toHaveBeenCalledExactlyOnceWith({
      approvalId: fixture.request.approvalId
    })
    expect(result.current.approvals.approvals).toEqual([])
    rerender({ workspaceId: 'other' })
    rerender({ workspaceId: 'main' })
    expect(result.current.approvals.approvals).toEqual([])
    expect(fixture.api.attachAgentSession).not.toHaveBeenCalled()
  }
)

function createFixture() {
  const listeners = new Set<(request: AgentToolApprovalRequest) => void>()
  const pending = new Map<string, AgentToolApprovalRequest>()
  const workbench = createWorkbenchSnapshot('/repo/app', 'app')
  const dimensionsRef = { current: null }
  const reactFlowInstanceRef = { current: null }
  const setCurrentGraph = vi.fn()
  const store = new AgentSessionBindingStore({ hasRetained: () => true, forget: vi.fn() })
  const agents = Object.fromEntries(
    ['main', 'other'].map((workspaceId) => [
      workspaceId,
      {
        agentId: `agent-${workspaceId}`,
        cleancodeMcpEnabled: true,
        layout: { position: { x: 0, y: 0 }, size: { height: 360, width: 640 } },
        name: `Agent ${workspaceId}`,
        projectId: workbench.project.id,
        providerId: 'codex',
        workspaceId
      }
    ])
  )
  const sessions = Object.fromEntries(
    Object.values(agents).map((agent) => {
      const initial = createAgentSessionSnapshot()
      const session = createAgentSessionSnapshot({
        agentId: agent.agentId,
        projectId: agent.projectId,
        sessionId: `session-${agent.workspaceId}`,
        runtime: {
          ...initial.runtime,
          terminal: {
            ...initial.runtime.terminal,
            viewIdentity: {
              blockId: agent.agentId,
              generation: 1,
              owner: { id: agent.agentId, kind: 'agent' },
              projectId: agent.projectId,
              runId: `run-${agent.workspaceId}`,
              sessionId: `pty-${agent.workspaceId}`,
              workspaceId: agent.workspaceId
            }
          }
        },
        workspaceId: agent.workspaceId
      })
      store.remember({ agentName: agent.name, session, workspaceKey: agent.workspaceId })
      return [agent.workspaceId, session]
    })
  )
  const request: AgentToolApprovalRequest = {
    agentId: agents.main!.agentId,
    approvalId: 'approval-main',
    projectDirectory: '/repo/app',
    sessionId: sessions.main!.sessionId,
    summary: '删除终端 terminal-1',
    target: { blockId: 'terminal-1', kind: 'terminal_block' },
    toolName: 'delete_block',
    workspaceId: 'main'
  }
  const api = {
    ...createRuntimeApi({
      approveAgentTool: vi.fn(async ({ approvalId }: { approvalId: string }) => {
        pending.delete(approvalId)
        return { graph: workbench.graph, status: 'completed' as const }
      }),
      onAgentToolApprovalRequested: vi.fn((listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      })
    }),
    replayAgentToolApprovals: vi.fn(
      async (scope: { projectDirectory: string; workspaceId: string }) => {
        for (const approval of pending.values()) {
          if (
            approval.projectDirectory === scope.projectDirectory &&
            approval.workspaceId === scope.workspaceId
          ) {
            for (const listener of listeners) listener(approval)
          }
        }
      }
    )
  }
  Object.defineProperty(window, 'cleancode', { configurable: true, value: api })
  return {
    api,
    request,
    requestApproval: () => {
      pending.set(request.approvalId, request)
      for (const listener of listeners) listener(request)
    },
    sessions,
    useWorkspace: ({ workspaceId }: { workspaceId: string }) => ({
      approvals: useAgentToolApprovals({
        graph: workbench.graph,
        projectDirectory: '/repo/app',
        reactFlowInstanceRef,
        setCurrentGraph,
        workspaceId
      }),
      attachment: useAgentSessionAttachment({
        activeAgent: agents[workspaceId]!,
        currentWorkbench: workbench,
        currentWorkspace: { ...workbench.project.workspaces[0]!, workspaceId },
        currentWorkspaceKey: workspaceId,
        dimensionsRef,
        measuredTerminalKey: workspaceId
      })
    }),
    wrapper: ({ children }: PropsWithChildren) => (
      <StrictMode>
        <AgentSessionBindingContext.Provider value={store}>
          {children}
        </AgentSessionBindingContext.Provider>
      </StrictMode>
    )
  }
}
