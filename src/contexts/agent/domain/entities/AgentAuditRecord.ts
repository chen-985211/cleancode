import type { AgentToolName } from '../value-objects/AgentToolName'

export interface AgentAuditRecord {
  readonly id: string
  readonly sessionId: string
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly toolName: AgentToolName
  readonly input: unknown
  readonly requiresApproval: boolean
  readonly status: 'awaiting_approval' | 'started' | 'completed' | 'failed' | 'canceled'
  readonly createdAt: string
}
