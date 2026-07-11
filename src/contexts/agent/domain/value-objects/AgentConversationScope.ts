export interface AgentConversationScopeSnapshot {
  readonly gitBranch: string | null
  readonly projectId: string
  readonly workspaceName: string
}

export class AgentConversationScope {
  private constructor(private readonly snapshot: AgentConversationScopeSnapshot) {}

  static create(input: AgentConversationScopeSnapshot): AgentConversationScope {
    return new AgentConversationScope({
      gitBranch: normalizeOptionalValue(input.gitBranch),
      projectId: requireValue(input.projectId, 'projectId'),
      workspaceName: requireValue(input.workspaceName, 'workspaceName')
    })
  }

  get key(): string {
    return JSON.stringify([
      this.snapshot.projectId,
      this.snapshot.workspaceName,
      this.snapshot.gitBranch
    ])
  }

  toSnapshot(): AgentConversationScopeSnapshot {
    return { ...this.snapshot }
  }
}

function requireValue(value: string, fieldName: string): string {
  const normalizedValue = value.trim()

  if (!normalizedValue) {
    throw createExpectedAppError(
      'AGENT_SESSION_INVALID',
      `Agent conversation scope ${fieldName} cannot be empty.`,
      { fieldName }
    )
  }

  return normalizedValue
}

function normalizeOptionalValue(value: string | null): string | null {
  const normalizedValue = value?.trim()
  return normalizedValue ? normalizedValue : null
}
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
