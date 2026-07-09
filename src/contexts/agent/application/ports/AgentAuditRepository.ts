import type { AgentAuditRecord } from '../../domain/entities/AgentAuditRecord'

export interface AgentAuditRepository {
  append(record: AgentAuditRecord): Promise<void>
}
