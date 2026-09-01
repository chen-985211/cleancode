import type { AgentToolApprovalRequest } from '../../../../../contexts/agent/application/dto/AgentSessionProtocol'

export type AgentToolApprovalPresentationRequest = AgentToolApprovalRequest

export interface AgentToolApprovalViewState {
  readonly errorMessage?: string
  readonly phase: 'approving' | 'awaiting' | 'failed'
  readonly request: AgentToolApprovalPresentationRequest
}

export type AgentApprovalNodeIntent =
  'contains-delete' | 'contains-disconnect' | 'delete' | 'dissolve'

export interface AgentToolApprovalController {
  readonly approvals: readonly AgentToolApprovalViewState[]
  readonly approve: (request: AgentToolApprovalPresentationRequest) => Promise<void>
  readonly clearForAgent: (agentId: string) => void
  readonly dismiss: (request: AgentToolApprovalPresentationRequest) => void
  readonly locate: (request: AgentToolApprovalPresentationRequest) => void
  readonly reject: (request: AgentToolApprovalPresentationRequest) => Promise<void>
}
