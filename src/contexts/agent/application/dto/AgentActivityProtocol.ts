import type { AgentActivityStatus } from './AgentSessionProtocol'

export type AgentActivityTerminalOwner =
  { readonly id: string; readonly kind: 'agent' } | { readonly id: string; readonly kind: 'block' }

/**
 * Agent-owned anti-corruption snapshot of a Run terminal identity. Keeping the
 * shape here prevents the Agent application layer from importing Run internals.
 */
export interface AgentActivityTerminalScope {
  readonly blockId: string
  readonly generation: number
  readonly gitBranch: string | null
  readonly owner?: AgentActivityTerminalOwner
  readonly projectDirectory: string
  readonly projectId: string
  readonly runId: string
  readonly sessionId: string
  readonly workspaceDirectory: string
  readonly workspaceId: string
}

interface ManagedAgentActivityIdentity {
  readonly agentId: string
  readonly agentName?: string
  readonly agentSessionId: string
  readonly providerLaunchGeneration: number
}

export interface AgentActivityIdentity {
  readonly invocationId: string
  readonly managed?: ManagedAgentActivityIdentity
  readonly providerId: string
  readonly terminal: AgentActivityTerminalScope
}

export type AgentActivitySignal =
  | { readonly status: AgentActivityStatus; readonly type: 'status_changed' }
  | { readonly type: 'turn_completed' }
  | { readonly type: 'invocation_exited' }

export interface RecordAgentActivityCommand {
  readonly identity: AgentActivityIdentity
  readonly signal: AgentActivitySignal
  /** Monotonic within one complete AgentActivityIdentity. */
  readonly sourceRevision: number
}

export interface AgentActivityInvocationSnapshot {
  readonly invocationId: string
  readonly managed?: ManagedAgentActivityIdentity
  readonly providerId: string
  readonly status: AgentActivityStatus
}

export interface TerminalAgentActivitySnapshot {
  readonly invocations: readonly AgentActivityInvocationSnapshot[]
  readonly revision: number
  readonly status: AgentActivityStatus
  readonly terminal: AgentActivityTerminalScope
}

export interface AgentTurnCompletedEvent {
  readonly completedAt: number
  readonly completionId: string
  readonly identity: AgentActivityIdentity
  readonly reason: 'became_idle' | 'reported'
  readonly terminalRevision: number
}

export type AgentActivityRegistryEvent =
  | {
      readonly snapshot: TerminalAgentActivitySnapshot
      readonly type: 'activity_changed'
    }
  | {
      readonly completion: AgentTurnCompletedEvent
      readonly type: 'turn_completed'
    }
