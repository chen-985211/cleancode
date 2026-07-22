import type { AgentConversationScope } from '../value-objects/AgentConversationScope'
import {
  ProviderSessionRef,
  type ProviderSessionRefSnapshot
} from '../value-objects/ProviderSessionRef'

export interface AgentLayoutSnapshot {
  readonly position: { readonly x: number; readonly y: number }
  readonly size: { readonly height: number; readonly width: number }
}

export const defaultAgentLayoutPosition = { x: 540, y: 120 } as const
export const defaultAgentLayoutSize = { width: 720, height: 460 } as const

interface AgentConversationBindingSnapshot {
  readonly gitBranch: string | null
  readonly sessionRef: ProviderSessionRefSnapshot
}

export interface PersistedAgentSessionSnapshot {
  readonly agentId: string
  readonly cleancodeMcpEnabled: boolean
  readonly conversations: readonly AgentConversationBindingSnapshot[]
  readonly layout: AgentLayoutSnapshot
  readonly name: string
  readonly projectId: string
  readonly providerId: string
  readonly workspaceName: string
}

export interface CreateAgentSessionInput {
  readonly agentId: string
  readonly cleancodeMcpEnabled?: boolean
  readonly layout: AgentLayoutSnapshot
  readonly name: string
  readonly projectId: string
  readonly providerId: string
  readonly workspaceName: string
}

interface AgentConversationBinding {
  readonly gitBranch: string | null
  readonly sessionRef: ProviderSessionRef
}

export class AgentSession {
  private constructor(
    readonly id: string,
    readonly projectId: string,
    readonly workspaceName: string,
    readonly providerId: string,
    private agentName: string,
    private agentLayout: AgentLayoutSnapshot,
    private isCleancodeMcpEnabled: boolean,
    private readonly conversations: Map<string, AgentConversationBinding>,
    private activeScope: AgentConversationScope | null = null
  ) {}

  static create(input: CreateAgentSessionInput): AgentSession {
    return new AgentSession(
      requireValue(input.agentId, 'agentId'),
      requireValue(input.projectId, 'projectId'),
      requireValue(input.workspaceName, 'workspaceName'),
      requireValue(input.providerId, 'providerId'),
      normalizeName(input.name),
      normalizeLayout(input.layout),
      input.cleancodeMcpEnabled ?? true,
      new Map()
    )
  }

  static start(scope: AgentConversationScope, providerId = 'codex'): AgentSession {
    const snapshot = scope.toSnapshot()
    const session = AgentSession.create({
      agentId: snapshot.agentId,
      layout: {
        position: defaultAgentLayoutPosition,
        size: defaultAgentLayoutSize
      },
      name: 'Agent 1',
      projectId: snapshot.projectId,
      providerId,
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
      requireValue(snapshot.providerId, 'providerId'),
      normalizeName(snapshot.name),
      normalizeLayout(snapshot.layout),
      snapshot.cleancodeMcpEnabled,
      new Map(
        snapshot.conversations.map((conversation) => [
          branchKey(conversation.gitBranch),
          {
            gitBranch: normalizeBranch(conversation.gitBranch),
            sessionRef: ProviderSessionRef.create(conversation.sessionRef)
          }
        ])
      ),
      activeScope
    )
    return session
  }

  bindProviderSession(sessionRef: ProviderSessionRef): void
  bindProviderSession(scope: AgentConversationScope, sessionRef: ProviderSessionRef): void
  bindProviderSession(
    scopeOrSessionRef: AgentConversationScope | ProviderSessionRef,
    explicitSessionRef?: ProviderSessionRef
  ): void {
    const scope = explicitSessionRef
      ? (scopeOrSessionRef as AgentConversationScope)
      : this.activeScope
    const sessionRef = explicitSessionRef ?? (scopeOrSessionRef as ProviderSessionRef)

    if (!scope) {
      throw createExpectedAppError(
        'AGENT_SESSION_INVALID',
        'An Agent conversation scope is required before binding a Provider session.'
      )
    }

    this.assertOwnsScope(scope)
    const gitBranch = scope.toSnapshot().gitBranch
    this.conversations.set(branchKey(gitBranch), {
      gitBranch,
      sessionRef
    })
  }

  get boundProviderSessionRef(): ProviderSessionRef | null {
    return this.activeScope
      ? this.findProviderSessionRef(this.activeScope.toSnapshot().gitBranch)
      : null
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

  findProviderSessionRef(gitBranch: string | null): ProviderSessionRef | null {
    return this.conversations.get(branchKey(gitBranch))?.sessionRef ?? null
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

  clearProviderSession(gitBranch: string | null): void {
    this.conversations.delete(branchKey(gitBranch))
  }

  toSnapshot(): PersistedAgentSessionSnapshot {
    return {
      agentId: this.id,
      cleancodeMcpEnabled: this.isCleancodeMcpEnabled,
      conversations: [...this.conversations.values()].map((conversation) => ({
        gitBranch: conversation.gitBranch,
        sessionRef: conversation.sessionRef.toSnapshot()
      })),
      layout: copyLayout(this.agentLayout),
      name: this.agentName,
      projectId: this.projectId,
      providerId: this.providerId,
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
