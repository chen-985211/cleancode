import {
  AgentConversationScope,
  type AgentConversationScopeSnapshot
} from '../value-objects/AgentConversationScope'
import { CodexThreadId } from '../value-objects/CodexThreadId'

export interface PersistedAgentSessionSnapshot {
  readonly codexThreadId: string
  readonly scope: AgentConversationScopeSnapshot
}

export class AgentSession {
  private constructor(
    readonly scope: AgentConversationScope,
    private codexThreadId: CodexThreadId | null
  ) {}

  static start(scope: AgentConversationScope): AgentSession {
    return new AgentSession(scope, null)
  }

  static fromSnapshot(snapshot: PersistedAgentSessionSnapshot): AgentSession {
    return new AgentSession(
      AgentConversationScope.create(snapshot.scope),
      CodexThreadId.create(snapshot.codexThreadId)
    )
  }

  bindCodexThread(codexThreadId: CodexThreadId): void {
    this.codexThreadId = codexThreadId
  }

  get boundCodexThreadId(): string | null {
    return this.codexThreadId?.value ?? null
  }

  toSnapshot(): PersistedAgentSessionSnapshot {
    if (!this.codexThreadId) {
      throw createExpectedAppError(
        'AGENT_SESSION_INVALID',
        'An Agent session cannot be persisted before Codex identifies its thread.'
      )
    }

    return {
      codexThreadId: this.codexThreadId.value,
      scope: this.scope.toSnapshot()
    }
  }
}
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
