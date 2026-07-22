import type { AgentBlockGraphSnapshot } from './AgentBlockGraphProtocol'
import type { AgentToolErrorSnapshot } from './AgentToolProtocol'
import type { AgentToolName } from '../../domain/value-objects/AgentToolName'
import type { ProviderSessionRefSnapshot } from '../../domain/value-objects/ProviderSessionRef'

export type AgentTerminalSourceTheme = 'dark' | 'light'
export type AgentActivityStatus =
  'unavailable' | 'idle' | 'working' | 'waiting_input' | 'waiting_approval'

export interface AgentActivityChangedEvent {
  readonly activity: AgentActivityStatus
  readonly agentId: string
  readonly sessionId: string
}

export interface AgentTerminalViewIdentity {
  readonly blockId: string
  readonly generation: number
  readonly owner: { readonly id: string; readonly kind: 'agent' }
  readonly projectId: string
  readonly runId: string
  readonly sessionId: string
  readonly workspaceName: string
}

export interface AgentPtyExitEvent {
  readonly agentId: string
  readonly exitCode: number | null
  readonly sessionId: string
}

export interface AgentGraphUpdatedEvent {
  readonly agentId: string
  readonly change?: {
    readonly blockIds: readonly string[]
    readonly kind: 'terminal_layout_arranged'
    readonly operationId: string
    readonly terminalGroupIds: readonly string[]
  }
  readonly graph: AgentBlockGraphSnapshot
  readonly projectDirectory: string
  readonly sessionId: string
  readonly workspaceName: string
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
  readonly workspaceName: string
}

export interface AgentSessionSnapshot {
  readonly activity?: AgentActivityStatus
  readonly agentId: string
  readonly gitBranch: string | null
  readonly processId: number | null
  readonly projectDirectory: string
  readonly projectId: string
  readonly providerId: string
  readonly providerSessionRef: ProviderSessionRefSnapshot | null
  readonly sessionId: string
  readonly status: 'running' | 'suspended' | 'exited' | 'failed' | 'restore_failed'
  readonly terminalViewIdentity?: AgentTerminalViewIdentity | null
  readonly terminalSourceTheme: AgentTerminalSourceTheme
  readonly workspaceDirectory: string
  readonly workspaceName: string
}
