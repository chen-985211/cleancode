import type { AgentConversationScope } from '../value-objects/AgentConversationScope'
import { CodexThreadId } from '../value-objects/CodexThreadId'

export interface AgentLayoutSnapshot {
  readonly position: { readonly x: number; readonly y: number }
  readonly size: { readonly height: number; readonly width: number }
}

export const defaultAgentLayoutPosition = { x: 540, y: 120 } as const
export const defaultAgentLayoutSize = { width: 720, height: 460 } as const

export interface AgentConversationBindingSnapshot {
  readonly codexThreadId: string
  readonly gitBranch: string | null
}

export interface PersistedAgentSessionSnapshot {
  readonly agentId: string
  readonly cleancodeMcpEnabled: boolean
  readonly conversations: readonly AgentConversationBindingSnapshot[]
  readonly layout: AgentLayoutSnapshot
  readonly name: string
  readonly projectId: string
  readonly workspaceName: string
}

export interface CreateAgentSessionInput {
  readonly agentId: string
  readonly cleancodeMcpEnabled?: boolean
  readonly layout: AgentLayoutSnapshot
  readonly name: string
  readonly projectId: string
  readonly workspaceName: string
}

export class AgentSession {
  private constructor(
    readonly id: string,
    readonly projectId: string,
    readonly workspaceName: string,
    private agentName: string,
    private agentLayout: AgentLayoutSnapshot,
    private isCleancodeMcpEnabled: boolean,
    private readonly conversations: Map<string, AgentConversationBindingSnapshot>,
    private activeScope: AgentConversationScope | null = null
  ) {}

  static create(input: CreateAgentSessionInput): AgentSession {
    return new AgentSession(
      requireValue(input.agentId, 'agentId'),
      requireValue(input.projectId, 'projectId'),
      requireValue(input.workspaceName, 'workspaceName'),
      normalizeName(input.name),
      normalizeLayout(input.layout),
      input.cleancodeMcpEnabled ?? true,
      new Map()
    )
  }

  static start(scope: AgentConversationScope): AgentSession {
    const snapshot = scope.toSnapshot()
    const session = AgentSession.create({
      agentId: snapshot.agentId,
      layout: {
        position: defaultAgentLayoutPosition,
        size: defaultAgentLayoutSize
      },
      name: 'Agent 1',
      projectId: snapshot.projectId,
      workspaceName: snapshot.workspaceName
    })
    session.activeScope = scope
    return session
  }

  static fromSnapshot(
    snapshot: PersistedAgentSessionSnapshot,
    activeScope: AgentConversationScope | null = null
  ): AgentSession {
    const session = new AgentSession(
      requireValue(snapshot.agentId, 'agentId'),
      requireValue(snapshot.projectId, 'projectId'),
      requireValue(snapshot.workspaceName, 'workspaceName'),
      normalizeName(snapshot.name),
      normalizeLayout(snapshot.layout),
      snapshot.cleancodeMcpEnabled,
      new Map(
        snapshot.conversations.map((conversation) => [
          branchKey(conversation.gitBranch),
          {
            codexThreadId: CodexThreadId.create(conversation.codexThreadId).value,
            gitBranch: normalizeBranch(conversation.gitBranch)
          }
        ])
      ),
      activeScope
    )
    return session
  }

  bindCodexThread(codexThreadId: CodexThreadId): void
  bindCodexThread(scope: AgentConversationScope, codexThreadId: CodexThreadId): void
  bindCodexThread(
    scopeOrThread: AgentConversationScope | CodexThreadId,
    explicitThread?: CodexThreadId
  ): void {
    const scope = explicitThread ? (scopeOrThread as AgentConversationScope) : this.activeScope
    const thread = explicitThread ?? (scopeOrThread as CodexThreadId)

    if (!scope) {
      throw createExpectedAppError(
        'AGENT_SESSION_INVALID',
        'An Agent conversation scope is required before binding a Codex thread.'
      )
    }

    this.assertOwnsScope(scope)
    const gitBranch = scope.toSnapshot().gitBranch
    this.conversations.set(branchKey(gitBranch), {
      codexThreadId: thread.value,
      gitBranch
    })
  }

  get boundCodexThreadId(): string | null {
    return this.activeScope ? this.findCodexThreadId(this.activeScope.toSnapshot().gitBranch) : null
  }

  get name(): string {
    return this.agentName
  }

  get layout(): AgentLayoutSnapshot {
    return copyLayout(this.agentLayout)
  }

  get cleancodeMcpEnabled(): boolean {
    return this.isCleancodeMcpEnabled
  }

  findCodexThreadId(gitBranch: string | null): string | null {
    return this.conversations.get(branchKey(gitBranch))?.codexThreadId ?? null
  }

  rename(name: string): void {
    this.agentName = normalizeName(name)
  }

  updateLayout(layout: AgentLayoutSnapshot): void {
    this.agentLayout = normalizeLayout(layout)
  }

  setCleancodeMcpEnabled(enabled: boolean): void {
    this.isCleancodeMcpEnabled = enabled
  }

  clearCodexThread(gitBranch: string | null): void {
    this.conversations.delete(branchKey(gitBranch))
  }

  toSnapshot(): PersistedAgentSessionSnapshot {
    return {
      agentId: this.id,
      cleancodeMcpEnabled: this.isCleancodeMcpEnabled,
      conversations: [...this.conversations.values()],
      layout: copyLayout(this.agentLayout),
      name: this.agentName,
      projectId: this.projectId,
      workspaceName: this.workspaceName
    }
  }

  private assertOwnsScope(scope: AgentConversationScope): void {
    const snapshot = scope.toSnapshot()

    if (
      snapshot.agentId !== this.id ||
      snapshot.projectId !== this.projectId ||
      snapshot.workspaceName !== this.workspaceName
    ) {
      throw createExpectedAppError(
        'AGENT_SESSION_INVALID',
        'Agent conversation scope does not belong to this Agent.'
      )
    }
  }
}
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

function requireValue(value: string, fieldName: string): string {
  const normalized = value.trim()

  if (!normalized) {
    throw createExpectedAppError('AGENT_SESSION_INVALID', `Agent ${fieldName} cannot be empty.`, {
      fieldName
    })
  }

  return normalized
}

function normalizeName(name: string): string {
  return requireValue(name, 'name')
}

function normalizeLayout(layout: AgentLayoutSnapshot): AgentLayoutSnapshot {
  const values = [layout.position.x, layout.position.y, layout.size.width, layout.size.height]

  if (!values.every(Number.isFinite) || layout.size.width <= 0 || layout.size.height <= 0) {
    throw createExpectedAppError('AGENT_SESSION_INVALID', 'Agent layout is invalid.')
  }

  return copyLayout(layout)
}

function copyLayout(layout: AgentLayoutSnapshot): AgentLayoutSnapshot {
  return {
    position: { ...layout.position },
    size: { ...layout.size }
  }
}

function normalizeBranch(gitBranch: string | null): string | null {
  const normalized = gitBranch?.trim()
  return normalized ? normalized : null
}

function branchKey(gitBranch: string | null): string {
  return normalizeBranch(gitBranch) ?? '\0no-branch'
}
