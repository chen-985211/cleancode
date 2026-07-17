import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { ExecuteAgentToolCommand } from './ExecuteAgentToolUseCase'
import type { AgentToolExecutionOperations } from './AgentToolApprovalCoordinator'

export class AgentToolInvocationCoordinator implements AgentToolExecutionOperations {
  private readonly activeSessionCalls = new Map<string, Set<Promise<unknown>>>()
  private readonly closingSessionIds = new Set<string>()
  private readonly workspaceTails = new Map<string, Promise<void>>()

  constructor(private readonly toolExecution: AgentToolExecutionOperations) {}

  execute(command: ExecuteAgentToolCommand) {
    return this.runInWorkspace(command, () => this.toolExecution.execute(command))
  }

  cancel(command: ExecuteAgentToolCommand, reason: string) {
    return this.runInWorkspace(command, () => this.toolExecution.cancel(command, reason))
  }

  runSessionToolCall<Result>(sessionId: string, operation: () => Promise<Result>): Promise<Result> {
    if (!this.isSessionOpen(sessionId)) {
      return Promise.reject(
        createExpectedAppError(
          'AGENT_SESSION_NOT_FOUND',
          'Agent session is no longer accepting MCP tool calls.'
        )
      )
    }

    const activeCalls = this.activeSessionCalls.get(sessionId) ?? new Set<Promise<unknown>>()
    this.activeSessionCalls.set(sessionId, activeCalls)
    let operationPromise: Promise<Result>
    try {
      operationPromise = operation()
    } catch (error) {
      operationPromise = Promise.reject(error)
    }

    const trackedPromise = operationPromise.finally(() => {
      activeCalls.delete(trackedPromise)
      if (activeCalls.size === 0) this.activeSessionCalls.delete(sessionId)
    })
    activeCalls.add(trackedPromise)
    return trackedPromise
  }

  beginSessionClosing(sessionId: string): void {
    this.closingSessionIds.add(sessionId)
  }

  reopenSession(sessionId: string): void {
    this.closingSessionIds.delete(sessionId)
  }

  isSessionOpen(sessionId: string): boolean {
    return !this.closingSessionIds.has(sessionId)
  }

  async waitForSession(sessionId: string): Promise<void> {
    while (this.activeSessionCalls.has(sessionId)) {
      await Promise.allSettled([...(this.activeSessionCalls.get(sessionId) ?? [])])
    }
  }

  forgetSession(sessionId: string): void {
    this.closingSessionIds.delete(sessionId)
    if (this.activeSessionCalls.get(sessionId)?.size === 0) {
      this.activeSessionCalls.delete(sessionId)
    }
  }

  private runInWorkspace<Result>(
    command: ExecuteAgentToolCommand,
    operation: () => Promise<Result>
  ): Promise<Result> {
    const workspaceKey = JSON.stringify([command.projectDirectory, command.workspaceName])
    const previous = this.workspaceTails.get(workspaceKey) ?? Promise.resolve()
    const result = previous.then(operation)
    const tail = result.then(
      () => undefined,
      () => undefined
    )
    this.workspaceTails.set(workspaceKey, tail)
    void tail.then(() => {
      if (this.workspaceTails.get(workspaceKey) === tail) this.workspaceTails.delete(workspaceKey)
    })
    return result
  }
}
