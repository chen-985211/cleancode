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

  it('restores exact Codex thread bindings independently for each Git branch', async () => {
    const mainScope = createScope('main')
    const featureScope = createScope('feature/login')
    await repository.save(createSession(mainScope, '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'))
    await repository.save(createSession(featureScope, '0190d8a2-4f13-7e17-a0c1-64c303571909'))

    const reopenedRepository = new FileSystemAgentSessionRepository(filePath)

    await expect(reopenedRepository.find(mainScope)).resolves.toMatchObject({
      boundCodexThreadId: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
    })
    await expect(reopenedRepository.find(featureScope)).resolves.toMatchObject({
      boundCodexThreadId: '0190d8a2-4f13-7e17-a0c1-64c303571909'
    })
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toMatchObject({ version: 1 })
  })
})

function createScope(gitBranch: string): AgentConversationScope {
  return AgentConversationScope.create({
    gitBranch,
    projectId: 'project-1',
    workspaceName: 'main'
  })
}

function createSession(scope: AgentConversationScope, threadId: string): AgentSession {
  const session = AgentSession.start(scope)
  session.bindCodexThread(CodexThreadId.create(threadId))
  return session
}
