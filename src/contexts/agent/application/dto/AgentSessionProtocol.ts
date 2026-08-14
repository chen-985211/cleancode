import type { AgentBlockGraphSnapshot } from './AgentBlockGraphProtocol'
import type { AgentToolErrorSnapshot } from './AgentToolProtocol'
import type { AgentToolName } from '../../domain/value-objects/AgentToolName'
import type { ProviderSessionRefSnapshot } from '../../domain/value-objects/ProviderSessionRef'

export type AgentTerminalSourceTheme = 'dark' | 'light'
export type AgentActivityStatus =
  'unavailable' | 'idle' | 'working' | 'waiting_input' | 'waiting_approval'

export interface AgentTerminalViewIdentity {
  readonly blockId: string
  readonly generation: number
  readonly owner: { readonly id: string; readonly kind: 'agent' }
  readonly projectId: string
  readonly runId: string
  readonly sessionId: string
  readonly workspaceId: string
}

export type AgentTerminalRuntimeStatus =
  'not_started' | 'starting' | 'running' | 'suspended' | 'exited' | 'failed'

/**
 * Why an Agent terminal left the running state. `requested` covers every stop the
 * application asked for; `unexpected` covers a PTY that ended on its own. Only
 * `exited` and `suspended` carry a reason: `failed` means nothing ever ran to stop.
 */
export type AgentTerminalStopReason = 'requested' | 'unexpected'

export type AgentLaunchRuntimeStatus =
  'not_started' | 'launching' | 'running' | 'exited' | 'stopped' | 'failed'

export type AgentBindingRuntimeStatus =
  'unbound' | 'persisting' | 'persisted' | 'persistence_failed'

export type AgentMcpRuntimeStatus =
  'disabled' | 'unsupported' | 'inactive' | 'initializing' | 'ready' | 'degraded' | 'failed'

export interface AgentRuntimeSnapshot {
  readonly activity: { readonly status: AgentActivityStatus }
  readonly binding: { readonly status: AgentBindingRuntimeStatus }
  readonly launch: {
    readonly exitCode: number | null
    readonly failureKind: 'restore' | 'start' | null
    readonly generation: number
    readonly launchId: string | null
    readonly status: AgentLaunchRuntimeStatus
  }
  readonly mcp: { readonly status: AgentMcpRuntimeStatus }
  readonly revision: number
  readonly terminal: {
    readonly exitCode: number | null
    readonly processId: number | null
    readonly status: AgentTerminalRuntimeStatus
    readonly stopReason: AgentTerminalStopReason | null
    readonly viewIdentity: AgentTerminalViewIdentity | null
  }
}

export interface AgentRuntimeChangedEvent {
  readonly agentId: string
  readonly runtime: AgentRuntimeSnapshot
  readonly sessionId: string
}

export interface AgentGraphUpdatedEvent {
  readonly agentId: string
  readonly change?: AgentGraphChange
  readonly graph: AgentBlockGraphSnapshot
  readonly projectDirectory: string
  readonly sessionId: string
  readonly workspaceId: string
}

export type AgentGraphChange =
  | {
      readonly blockIds: readonly string[]
      readonly kind: 'terminal_layout_arranged'
      readonly operationId: string
      readonly terminalGroupIds: readonly string[]
    }
  | {
      readonly blockIds: readonly string[]
      readonly connectionIds: readonly string[]
      readonly kind: 'terminal_build_created'
      readonly operationId: string
      readonly terminalGroupIds: readonly string[]
    }

export type AgentToolApprovalTarget =
  | {
      readonly blockId: string
      readonly kind: 'terminal_block'
    }
  | {
      readonly kind: 'terminal_group'
      readonly terminalGroupId: string
    }
  | {
      readonly connectionId: string
      readonly kind: 'terminal_connection'
    }

export type AgentToolApprovalDecisionResult =
  | {
      readonly graph: AgentBlockGraphSnapshot
      readonly status: 'completed'
    }
  | {
      readonly error: AgentToolErrorSnapshot
      readonly status: 'failed'
    }
  | {
      readonly status: 'canceled' | 'not_found'
    }

export interface AgentToolApprovalRequest {
  readonly agentId: string
  readonly approvalId: string
  readonly projectDirectory: string
  readonly sessionId: string
  readonly summary: string
  readonly target: AgentToolApprovalTarget
  readonly toolName: AgentToolName
  readonly workspaceId: string
}

export interface AgentSessionSnapshot {
  readonly agentId: string
  readonly gitBranch: string | null
  readonly projectDirectory: string
  readonly projectId: string
  readonly providerId: string
  readonly providerSessionRef: ProviderSessionRefSnapshot | null
  readonly runtime: AgentRuntimeSnapshot
  readonly sessionId: string
  readonly terminalSourceTheme: AgentTerminalSourceTheme
  readonly workspaceDirectory: string
  readonly workspaceId: string
}
