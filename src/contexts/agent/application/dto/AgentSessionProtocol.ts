import type { BlockGraphSnapshot } from '../../../block-graph/application/dto/BlockGraphSnapshot'
import type { AgentToolErrorSnapshot } from './AgentToolProtocol'
import type { AgentToolName } from '../../domain/value-objects/AgentToolName'

export type AgentTerminalSourceTheme = 'dark' | 'light'

export interface AgentPtyOutputEvent {
  readonly agentId: string
  readonly data: string
  readonly sessionId: string
}

export interface AgentPtyExitEvent {
  readonly agentId: string
  readonly exitCode: number | null
  readonly sessionId: string
}

export interface AgentGraphUpdatedEvent {
  readonly agentId: string
  readonly graph: BlockGraphSnapshot
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
      readonly graph: BlockGraphSnapshot
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
  readonly agentId: string
  readonly codexThreadId: string | null
  readonly gitBranch: string | null
  readonly processId: number | null
  readonly projectDirectory: string
  readonly projectId: string
  readonly sessionId: string
  readonly status: 'running' | 'suspended' | 'exited' | 'failed' | 'restore_failed'
  readonly terminalSourceTheme: AgentTerminalSourceTheme
  readonly workspaceDirectory: string
  readonly workspaceName: string
}
