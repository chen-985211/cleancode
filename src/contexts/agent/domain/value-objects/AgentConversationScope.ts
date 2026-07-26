import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import { createCanvasObjectIdentityKey } from '../../../../shared-kernel/domain/value-objects/CanvasObjectIdentity'

export interface AgentConversationScopeSnapshot {
  readonly agentId: string
  readonly projectId: string
  readonly workspaceId: string
}

export class AgentConversationScope {
  private constructor(private readonly snapshot: AgentConversationScopeSnapshot) {}

  static create(input: AgentConversationScopeSnapshot): AgentConversationScope {
    return new AgentConversationScope({
      agentId: requireValue(input.agentId, 'agentId'),
      projectId: requireValue(input.projectId, 'projectId'),
      workspaceId: requireValue(input.workspaceId, 'workspaceId')
    })
  }

  get key(): string {
    return createCanvasObjectIdentityKey({
      projectId: this.snapshot.projectId,
      workspaceId: this.snapshot.workspaceId,
      objectKind: 'agent',
      objectId: this.snapshot.agentId
    })
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
