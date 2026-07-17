import { readFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { FileSystemAgentAuditRepository } from '../../../../src/contexts/agent/infrastructure/persistence/FileSystemAgentAuditRepository'

describe('filesystem agent audit repository', () => {
  it('appends agent tool audit records as JSON lines', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cleancode-agent-audit-'))
    const auditFilePath = join(directory, 'agent-audit.jsonl')
    const repository = new FileSystemAgentAuditRepository(auditFilePath)

    await repository.append({
      createdAt: '2026-07-09T00:00:00.000Z',
      id: 'tool-call-1',
      input: { blockId: 'terminal-1' },
      projectDirectory: '/tmp/project',
      requiresApproval: true,
      sessionId: 'agent-session-1',
      status: 'awaiting_approval',
      toolName: 'delete_block',
      workspaceName: 'main'
    })
    await repository.append({
      createdAt: '2026-07-09T00:00:01.000Z',
      id: 'tool-call-1',
      input: { blockId: 'terminal-1' },
      projectDirectory: '/tmp/project',
      requiresApproval: true,
      sessionId: 'agent-session-1',
      status: 'canceled',
      toolName: 'delete_block',
      workspaceName: 'main'
    })

    const lines = (await readFile(auditFilePath, 'utf8')).trim().split('\n')

    expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual([
      {
        createdAt: '2026-07-09T00:00:00.000Z',
        id: 'tool-call-1',
        input: { blockId: 'terminal-1' },
        projectDirectory: '/tmp/project',
        requiresApproval: true,
        sessionId: 'agent-session-1',
        status: 'awaiting_approval',
        toolName: 'delete_block',
        workspaceName: 'main'
      },
      {
        createdAt: '2026-07-09T00:00:01.000Z',
        id: 'tool-call-1',
        input: { blockId: 'terminal-1' },
        projectDirectory: '/tmp/project',
        requiresApproval: true,
        sessionId: 'agent-session-1',
        status: 'canceled',
        toolName: 'delete_block',
        workspaceName: 'main'
      }
    ])
  })
})
