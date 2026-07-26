import type { AgentConversationScope } from '../value-objects/AgentConversationScope'
import {
  ProviderSessionRef,
  type ProviderSessionRefSnapshot
} from '../value-objects/ProviderSessionRef'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

export interface AgentLayoutSnapshot {
  readonly position: { readonly x: number; readonly y: number }
  readonly size: { readonly height: number; readonly width: number }
}

export const defaultAgentLayoutPosition = { x: 540, y: 120 } as const
export const defaultAgentLayoutSize = { width: 720, height: 460 } as const

export interface PersistedAgentSessionSnapshot {
  readonly agentId: string
  readonly cleancodeMcpEnabled: boolean
  readonly layout: AgentLayoutSnapshot
  readonly name: string
  readonly projectId: string
  readonly providerId: string
  readonly providerSessionRef: ProviderSessionRefSnapshot | null
  readonly workspaceId: string
}

export interface CreateAgentSessionInput {
  readonly agentId: string
  readonly cleancodeMcpEnabled?: boolean
  readonly layout: AgentLayoutSnapshot
  readonly name: string
  readonly projectId: string
  readonly providerId: string
  readonly workspaceId: string
}

export class AgentSession {
  private constructor(
    readonly id: string,
    readonly projectId: string,
    readonly workspaceId: string,
    readonly providerId: string,
    private agentName: string,
    private agentLayout: AgentLayoutSnapshot,
    private isCleancodeMcpEnabled: boolean,
    private providerSession: ProviderSessionRef | null,
    private activeScope: AgentConversationScope | null = null
  ) {}

  static create(input: CreateAgentSessionInput): AgentSession {
    return new AgentSession(
      requireValue(input.agentId, 'agentId'),
      requireValue(input.projectId, 'projectId'),
      requireValue(input.workspaceId, 'workspaceId'),
      requireValue(input.providerId, 'providerId'),
      normalizeName(input.name),
      normalizeLayout(input.layout),
      input.cleancodeMcpEnabled ?? true,
      null
    )
  }

  static start(scope: AgentConversationScope, providerId: string): AgentSession {
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
      workspaceId: snapshot.workspaceId
    })
    session.activeScope = scope
    return session
  }

  static fromSnapshot(
    snapshot: PersistedAgentSessionSnapshot,
    activeScope: AgentConversationScope | null = null
  ): AgentSession {
    return new AgentSession(
      requireValue(snapshot.agentId, 'agentId'),
      requireValue(snapshot.projectId, 'projectId'),
      requireValue(snapshot.workspaceId, 'workspaceId'),
      requireValue(snapshot.providerId, 'providerId'),
      normalizeName(snapshot.name),
      normalizeLayout(snapshot.layout),
      snapshot.cleancodeMcpEnabled,
      snapshot.providerSessionRef
        ? ProviderSessionRef.create(snapshot.providerSessionRef, snapshot.providerId)
        : null,
      activeScope
    )
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
    this.providerSession = sessionRef.forProvider(this.providerId)
  }

  get boundProviderSessionRef(): ProviderSessionRef | null {
    return this.activeScope ? this.providerSession : null
  }

  get providerSessionRef(): ProviderSessionRef | null {
    return this.providerSession
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

  rename(name: string): void {
    this.agentName = normalizeName(name)
  }

  updateLayout(layout: AgentLayoutSnapshot): void {
    this.agentLayout = normalizeLayout(layout)
  }

  setCleancodeMcpEnabled(enabled: boolean): void {
    this.isCleancodeMcpEnabled = enabled
  }

  clearProviderSession(): void {
    this.providerSession = null
  }

  toSnapshot(): PersistedAgentSessionSnapshot {
    return {
      agentId: this.id,
      cleancodeMcpEnabled: this.isCleancodeMcpEnabled,
      layout: copyLayout(this.agentLayout),
      name: this.agentName,
      projectId: this.projectId,
      providerId: this.providerId,
      providerSessionRef: this.providerSession?.toSnapshot() ?? null,
      workspaceId: this.workspaceId
    }
  }

  private assertOwnsScope(scope: AgentConversationScope): void {
    const snapshot = scope.toSnapshot()

    if (
      snapshot.agentId !== this.id ||
      snapshot.projectId !== this.projectId ||
      snapshot.workspaceId !== this.workspaceId
    ) {
      throw createExpectedAppError(
        'AGENT_SESSION_INVALID',
        'Agent conversation scope does not belong to this Agent.'
      )
    }
  }
}

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
