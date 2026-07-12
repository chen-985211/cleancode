import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { AgentSession } from '../../../../src/contexts/agent/domain/aggregates/AgentSession'
import { AgentConversationScope } from '../../../../src/contexts/agent/domain/value-objects/AgentConversationScope'
import { CodexThreadId } from '../../../../src/contexts/agent/domain/value-objects/CodexThreadId'
import { FileSystemAgentSessionRepository } from '../../../../src/contexts/agent/infrastructure/persistence/FileSystemAgentSessionRepository'

describe('filesystem Agent session repository', () => {
  let storageDirectory: string
  let repository: FileSystemAgentSessionRepository
  let filePath: string

  beforeEach(async () => {
    storageDirectory = await mkdtemp(join(tmpdir(), 'cleancode-agent-session-'))
    filePath = join(storageDirectory, 'agent-sessions.json')
    repository = new FileSystemAgentSessionRepository(filePath)
  })

  afterEach(async () => {
    await rm(storageDirectory, { recursive: true, force: true })
  })

  it('restores multiple Agents and their exact branch conversations', async () => {
    const firstAgent = createAgent('agent-1', 'Agent 1')
    const secondAgent = createAgent('agent-2', 'Agent 2')
    firstAgent.bindCodexThread(
      createScope('agent-1', 'main'),
      thread('0190d8a1-8b7d-7d75-9f62-7a663ef87e33')
    )
    secondAgent.bindCodexThread(
      createScope('agent-2', 'main'),
      thread('0190d8a2-4f13-7e17-a0c1-64c303571909')
    )
    await repository.save(firstAgent)
    await repository.save(secondAgent)

    const reopenedRepository = new FileSystemAgentSessionRepository(filePath)
    const agents = await reopenedRepository.findWorkspace('project-1', 'main')

    expect(agents?.map((agent) => agent.id)).toEqual(['agent-1', 'agent-2'])
    expect(agents?.[0]?.layout).toEqual({
      position: { x: 540, y: 120 },
      size: { width: 440, height: 520 }
    })
    expect(agents?.[0]?.findCodexThreadId('main')).toBe('0190d8a1-8b7d-7d75-9f62-7a663ef87e33')
    expect(agents?.[1]?.findCodexThreadId('main')).toBe('0190d8a2-4f13-7e17-a0c1-64c303571909')
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toMatchObject({ version: 2 })
  })

  it('migrates legacy branch bindings into one stable default Agent without losing threads', async () => {
    await import('node:fs/promises').then(({ writeFile }) =>
      writeFile(
        filePath,
        JSON.stringify({
          version: 1,
          sessions: [
            {
              codexThreadId: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33',
              scope: { gitBranch: 'main', projectId: 'project-1', workspaceName: 'main' }
            },
            {
              codexThreadId: '0190d8a2-4f13-7e17-a0c1-64c303571909',
              scope: {
                gitBranch: 'feature/login',
                projectId: 'project-1',
                workspaceName: 'main'
              }
            }
          ]
        })
      )
    )

    const agents = await repository.findWorkspace('project-1', 'main')

    expect(agents).toHaveLength(1)
    expect(agents?.[0]?.name).toBe('Agent 1')
    expect(agents?.[0]?.findCodexThreadId('main')).toBe('0190d8a1-8b7d-7d75-9f62-7a663ef87e33')
    expect(agents?.[0]?.findCodexThreadId('feature/login')).toBe(
      '0190d8a2-4f13-7e17-a0c1-64c303571909'
    )
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toMatchObject({ version: 2 })
  })
})

function createScope(agentId: string, gitBranch: string) {
  return AgentConversationScope.create({
    agentId,
    gitBranch,
    projectId: 'project-1',
    workspaceName: 'main'
  })
}

function createAgent(agentId: string, name: string): AgentSession {
  return AgentSession.create({
    agentId,
    layout: { position: { x: 540, y: 120 }, size: { width: 440, height: 520 } },
    name,
    projectId: 'project-1',
    workspaceName: 'main'
  })
}

function thread(value: string) {
  return CodexThreadId.create(value)
}
