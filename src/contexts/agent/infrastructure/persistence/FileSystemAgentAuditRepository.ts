import { mkdir, appendFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { AgentAuditRepository } from '../../application/ports/AgentAuditRepository'
import type { AgentAuditRecord } from '../../domain/entities/AgentAuditRecord'

export class FileSystemAgentAuditRepository implements AgentAuditRepository {
  constructor(private readonly auditFilePath: string) {}

  async append(record: AgentAuditRecord): Promise<void> {
    await mkdir(dirname(this.auditFilePath), { recursive: true })
    await appendFile(this.auditFilePath, `${JSON.stringify(record)}\n`, 'utf8')
  }
}
