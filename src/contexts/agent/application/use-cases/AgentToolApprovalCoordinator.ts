import type {
  AgentToolApprovalDecisionResult,
  AgentToolApprovalRequest
} from '../dto/AgentSessionProtocol'
import type { AgentMcpToolCallCommand } from '../ports/AgentMcpServerPort'
import { createAgentToolFailedResult } from '../dto/AgentToolFailure'
import type { AgentToolExecutionResult, ExecuteAgentToolCommand } from './ExecuteAgentToolUseCase'
import type { ManagedAgentSession } from './AgentSessionRuntimeState'

export interface AgentToolExecutionOperations {
  cancel(command: ExecuteAgentToolCommand, reason: string): Promise<AgentToolExecutionResult>
  execute(command: ExecuteAgentToolCommand): Promise<AgentToolExecutionResult>
}

interface PendingToolApproval {
  readonly command: ExecuteAgentToolCommand
  readonly completion: Promise<AgentToolExecutionResult>
  readonly request: AgentToolApprovalRequest
  readonly resolve: (result: AgentToolExecutionResult) => void
  readonly sessionId: string
  state: 'canceling' | 'executing' | 'waiting'
}

export class AgentToolApprovalCoordinator {
  private readonly pendingApprovals = new Map<string, PendingToolApproval>()

  constructor(
    private readonly toolExecution: AgentToolExecutionOperations,
    private readonly findSessionById: (sessionId: string) => ManagedAgentSession | undefined
  ) {}

  async execute(
    session: ManagedAgentSession,
    command: AgentMcpToolCallCommand
  ): Promise<AgentToolExecutionResult> {
    const toolCommand: ExecuteAgentToolCommand = {
      agentId: session.agentId,
      input: command.input,
      projectDirectory: session.projectDirectory,
      projectId: session.projectId,
      sessionId: session.sessionId,
      toolCallId: command.toolCallId,
      toolName: command.toolName,
      workspaceId: session.workspaceId
    }
    const firstResult = await this.executeSafely(toolCommand)

    if (firstResult.status === 'awaiting_approval') {
      if (!this.isSessionActive(session)) {
        return this.cancelSafely(
          toolCommand,
          'Agent session stopped before approval could be requested.'
        )
      }
      return this.waitForApproval(session, toolCommand, firstResult)
    }

    this.publishGraphUpdate(session, firstResult)
    return firstResult
  }

  async approve(approvalId: string): Promise<AgentToolApprovalDecisionResult> {
    const pending = this.pendingApprovals.get(approvalId)
    if (!pending || pending.state !== 'waiting') return { status: 'not_found' }
    const session = this.findSessionById(pending.sessionId)
    if (!session || !this.isSessionActive(session)) {
      await this.cancelPending(pending, 'Agent session stopped before approval was granted.')
      return toApprovalDecision(await pending.completion)
    }
    pending.state = 'executing'

    const result = await this.executeSafely({ ...pending.command, approved: true })
    if (this.pendingApprovals.get(approvalId) === pending) {
      this.pendingApprovals.delete(approvalId)
    }

    this.publishGraphUpdate(session, result)
    pending.resolve(result)
    return toApprovalDecision(result)
  }

  async reject(approvalId: string): Promise<void> {
    const pending = this.pendingApprovals.get(approvalId)
    if (!pending || pending.state !== 'waiting') return
    await this.cancelPending(pending, 'User rejected the tool call.')
  }

  async cancelSession(sessionId: string): Promise<void> {
    const matching = [...this.pendingApprovals.values()].filter(
      (pending) => pending.sessionId === sessionId
    )

    await Promise.all(
      matching.map((pending) =>
        pending.state === 'waiting'
          ? this.cancelPending(pending, 'Agent session was disposed.')
          : pending.completion.then(() => undefined)
      )
    )
  }

  list(): readonly AgentToolApprovalRequest[] {
    return [...this.pendingApprovals.values()].map((approval) => approval.request)
  }

  replayWaiting(session: ManagedAgentSession): void {
    for (const pending of this.pendingApprovals.values()) {
      if (pending.sessionId !== session.sessionId || pending.state !== 'waiting') continue
      try {
        session.callbacks.onToolApprovalRequested(pending.request)
      } catch {
        // Keep the request pending so a later renderer attachment can replay it again.
      }
    }
  }

  private waitForApproval(
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
      workspaceId: session.workspaceId
    }
    let resolveCompletion!: (result: AgentToolExecutionResult) => void
    const completion = new Promise<AgentToolExecutionResult>((resolve) => {
      resolveCompletion = resolve
    })
    const pending: PendingToolApproval = {
      command,
      completion,
      request,
      resolve: resolveCompletion,
      sessionId: session.sessionId,
      state: 'waiting'
    }
    this.pendingApprovals.set(request.approvalId, pending)
    try {
      session.callbacks.onToolApprovalRequested(request)
    } catch {
      this.pendingApprovals.delete(request.approvalId)
      void this.cancelSafely(command, 'Approval request could not be delivered.').then((result) =>
        pending.resolve(result)
      )
    }
    return completion
  }

  private async cancelPending(pending: PendingToolApproval, reason: string): Promise<void> {
    pending.state = 'canceling'
    const result = await this.cancelSafely(pending.command, reason)
    if (this.pendingApprovals.get(pending.request.approvalId) === pending) {
      this.pendingApprovals.delete(pending.request.approvalId)
    }
    pending.resolve(result)
  }

  private publishGraphUpdate(session: ManagedAgentSession, result: AgentToolExecutionResult): void {
    if (result.status !== 'completed' || !result.graphChanged || !('graph' in result)) return

    const graphChange =
      result.output.type === 'terminal_workflow_created'
        ? {
            blockIds: result.output.createdTerminals.map((terminal) => terminal.blockId),
            connectionIds: result.output.createdConnections.map(
              (connection) => connection.connectionId
            ),
            kind: 'terminal_workflow_created' as const,
            operationId: result.toolCallId,
            terminalGroupIds: result.output.createdTerminalGroupId
              ? [result.output.createdTerminalGroupId]
              : []
          }
        : result.output.arrangedBlockIds && result.output.arrangedTerminalGroupIds
          ? {
              blockIds: result.output.arrangedBlockIds,
              kind: 'terminal_layout_arranged' as const,
              operationId: result.toolCallId,
              terminalGroupIds: result.output.arrangedTerminalGroupIds
            }
          : undefined

    try {
      session.callbacks.onGraphUpdated({
        agentId: session.agentId,
        ...(graphChange ? { change: graphChange } : {}),
        graph: result.graph,
        projectDirectory: session.projectDirectory,
        sessionId: session.sessionId,
        workspaceId: session.workspaceId
      })
    } catch {
      // A presentation projection failure must not rewrite an already committed tool result.
    }
  }

  private async executeSafely(command: ExecuteAgentToolCommand): Promise<AgentToolExecutionResult> {
    try {
      return await this.toolExecution.execute(command)
    } catch (error) {
      return createAgentToolFailedResult(command.toolCallId, error)
    }
  }

  private async cancelSafely(
    command: ExecuteAgentToolCommand,
    reason: string
  ): Promise<AgentToolExecutionResult> {
    try {
      return await this.toolExecution.cancel(command, reason)
    } catch (error) {
      return createAgentToolFailedResult(command.toolCallId, error)
    }
  }

  private isSessionActive(session: ManagedAgentSession): boolean {
    return (
      this.findSessionById(session.sessionId) === session &&
      session.runtime.terminal.status === 'running' &&
      session.runtime.launch.status === 'running' &&
      !session.isStopping
    )
  }
}

function toApprovalDecision(result: AgentToolExecutionResult): AgentToolApprovalDecisionResult {
  if (result.status === 'failed') return { error: result.error, status: 'failed' }
  return result.status === 'completed' && 'graph' in result
    ? { graph: result.graph, status: 'completed' }
    : { status: 'canceled' }
}
