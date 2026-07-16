import type {
  AgentToolApprovalDecisionResult,
  AgentToolApprovalRequest
} from '../dto/AgentSessionProtocol'
import type { AgentToolExecutionResult, ExecuteAgentToolCommand } from './ExecuteAgentToolUseCase'
import { createCanceledAgentToolResult, type ManagedAgentSession } from './AgentSessionRuntimeState'

interface PendingToolApproval {
  readonly command: ExecuteAgentToolCommand
  readonly reject: (error: unknown) => void
  readonly request: AgentToolApprovalRequest
  readonly resolve: (result: AgentToolExecutionResult) => void
  readonly sessionId: string
  state: 'executing' | 'waiting'
}

export class AgentToolApprovalCoordinator {
  private readonly pendingApprovals = new Map<string, PendingToolApproval>()

  constructor(
    private readonly executeAgentTool: (
      command: ExecuteAgentToolCommand
    ) => Promise<AgentToolExecutionResult>,
    private readonly findSessionById: (sessionId: string) => ManagedAgentSession | undefined
  ) {}

  waitForApproval(
    session: ManagedAgentSession,
    command: ExecuteAgentToolCommand,
    result: Extract<AgentToolExecutionResult, { readonly status: 'awaiting_approval' }>
  ): Promise<AgentToolExecutionResult> {
    const request: AgentToolApprovalRequest = {
      agentId: session.agentId,
      approvalId: result.toolCallId,
      projectDirectory: session.projectDirectory,
      sessionId: session.sessionId,
      summary: result.approval.summary,
      target: result.approval.target,
      toolName: result.approval.toolName,
      workspaceName: session.workspaceName
    }

    return new Promise((resolve, reject) => {
      this.pendingApprovals.set(request.approvalId, {
        command,
        reject,
        request,
        resolve,
        sessionId: session.sessionId,
        state: 'waiting'
      })
      session.callbacks.onToolApprovalRequested(request)
    })
  }

  async approve(approvalId: string): Promise<AgentToolApprovalDecisionResult> {
    const pendingApproval = this.pendingApprovals.get(approvalId)

    if (!pendingApproval || pendingApproval.state === 'executing') {
      return { status: 'not_found' }
    }

    pendingApproval.state = 'executing'

    try {
      const result = await this.executeAgentTool({ ...pendingApproval.command, approved: true })
      const isStillPending = this.pendingApprovals.get(approvalId) === pendingApproval
      const session = this.findSessionById(pendingApproval.sessionId)

      if (!isStillPending || !session) {
        return { status: 'canceled' }
      }

      this.pendingApprovals.delete(approvalId)
      if (result.status === 'completed') {
        session.callbacks.onGraphUpdated({
          agentId: session.agentId,
          graph: result.graph,
          projectDirectory: session.projectDirectory,
          sessionId: session.sessionId,
          workspaceName: session.workspaceName
        })
        pendingApproval.resolve(result)
        return { graph: result.graph, status: 'completed' }
      }

      pendingApproval.resolve(result)
      return { status: 'canceled' }
    } catch (error) {
      if (this.pendingApprovals.get(approvalId) === pendingApproval) {
        this.pendingApprovals.delete(approvalId)
        pendingApproval.reject(error)
      }
      throw error
    }
  }

  reject(approvalId: string): void {
    const pendingApproval = this.pendingApprovals.get(approvalId)

    if (!pendingApproval || pendingApproval.state === 'executing') {
      return
    }

    this.pendingApprovals.delete(approvalId)
    pendingApproval.resolve(
      createCanceledAgentToolResult(approvalId, 'User rejected the tool call.')
    )
  }

  cancelSession(sessionId: string): void {
    for (const [approvalId, pendingApproval] of this.pendingApprovals.entries()) {
      if (pendingApproval.sessionId !== sessionId) continue

      this.pendingApprovals.delete(approvalId)
      pendingApproval.resolve(
        createCanceledAgentToolResult(approvalId, 'Agent session was disposed.')
      )
    }
  }

  list(): readonly AgentToolApprovalRequest[] {
    return [...this.pendingApprovals.values()].map((approval) => approval.request)
  }
}
