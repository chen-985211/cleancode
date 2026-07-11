import type { BlockGraphSnapshot } from '../../../block-graph/application/dto/BlockGraphSnapshot'
import type { AgentToolName } from '../../domain/value-objects/AgentToolName'

export interface AgentPtyOutputEvent {
  readonly data: string
  readonly sessionId: string
}

export interface AgentPtyExitEvent {
  readonly exitCode: number | null
  readonly sessionId: string
}

export interface AgentGraphUpdatedEvent {
  readonly graph: BlockGraphSnapshot
  readonly projectDirectory: string
  readonly sessionId: string
  readonly workspaceName: string
}

export interface AgentToolApprovalRequest {
  readonly approvalId: string
  readonly projectDirectory: string
  readonly sessionId: string
  readonly summary: string
  readonly toolName: AgentToolName
  readonly workspaceName: string
}

export interface AgentSessionSnapshot {
  readonly codexThreadId: string | null
  readonly gitBranch: string | null
  readonly processId: number | null
  readonly projectDirectory: string
  readonly projectId: string
  readonly sessionId: string
  readonly status: 'running' | 'suspended' | 'exited' | 'failed' | 'restore_failed'
  readonly workspaceDirectory: string
  readonly workspaceName: string
}
