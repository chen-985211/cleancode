import type { AgentToolApprovalRequest } from '../../contexts/agent/application/dto/AgentSessionProtocol'

export interface AgentToolApprovalViewState {
  readonly errorMessage?: string
  readonly phase: 'approving' | 'awaiting' | 'failed'
  readonly request: AgentToolApprovalRequest
}

export type AgentApprovalNodeIntent = 'contains-delete' | 'delete' | 'dissolve'

export interface AgentToolApprovalController {
  readonly approvals: readonly AgentToolApprovalViewState[]
  readonly approve: (request: AgentToolApprovalRequest) => Promise<void>
  readonly clearForAgent: (agentId: string) => void
  readonly dismiss: (request: AgentToolApprovalRequest) => void
  readonly locate: (request: AgentToolApprovalRequest) => void
  readonly reject: (request: AgentToolApprovalRequest) => Promise<void>
}
