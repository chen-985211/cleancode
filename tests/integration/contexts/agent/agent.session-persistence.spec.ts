import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { AgentProviderRegistry } from '../../../../src/contexts/agent/application/services/AgentProviderRegistry'
import { AgentSession } from '../../../../src/contexts/agent/domain/aggregates/AgentSession'
import { AgentConversationScope } from '../../../../src/contexts/agent/domain/value-objects/AgentConversationScope'
import { ProviderSessionRef } from '../../../../src/contexts/agent/domain/value-objects/ProviderSessionRef'
import { FileSystemAgentSessionRepository } from '../../../../src/contexts/agent/infrastructure/persistence/FileSystemAgentSessionRepository'
import { ClaudeCodeAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/claude-code/ClaudeCodeAgentProviderContribution'
import { CodexAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/codex/CodexAgentProviderContribution'

describe('filesystem Agent session repository', () => {
  let storageDirectory: string
  let repository: FileSystemAgentSessionRepository
  let filePath: string

  beforeEach(async () => {
    storageDirectory = await mkdtemp(join(tmpdir(), 'cleancode-agent-session-'))
    filePath = join(storageDirectory, 'agent-sessions.json')
    repository = new FileSystemAgentSessionRepository(filePath, createProviderRegistry())
  })

  afterEach(async () => {
    await rm(storageDirectory, { recursive: true, force: true })
  })

  it('restores multiple Agents with one branch-independent Provider binding each', async () => {
    const firstAgent = createAgent('agent-1', 'Agent 1')
    const secondAgent = createAgent('agent-2', 'Agent 2')
    firstAgent.bindProviderSession(
      createScope('agent-1'),
      codexThread('0190d8a1-8b7d-7d75-9f62-7a663ef87e33')
    )
    secondAgent.bindProviderSession(
      createScope('agent-2'),
      codexThread('0190d8a2-4f13-7e17-a0c1-64c303571909')
    )
    secondAgent.setCleancodeMcpEnabled(false)
    await repository.save(firstAgent)
    await repository.save(secondAgent)

    const reopened = new FileSystemAgentSessionRepository(filePath, createProviderRegistry())
    const agents = await reopened.findWorkspace('project-1', 'workspace-main')
    const persisted = JSON.parse(await readFile(filePath, 'utf8'))

    expect(agents?.map((agent) => agent.id)).toEqual(['agent-1', 'agent-2'])
    expect(agents?.[0]?.providerSessionRef?.value).toBe('0190d8a1-8b7d-7d75-9f62-7a663ef87e33')
    expect(agents?.[1]?.providerSessionRef?.value).toBe('0190d8a2-4f13-7e17-a0c1-64c303571909')
    expect(agents?.map((agent) => agent.cleancodeMcpEnabled)).toEqual([true, false])
    expect(persisted.version).toBe(5)
    expect(persisted.workspaces[0]).toMatchObject({
      projectId: 'project-1',
      workspaceId: 'workspace-main'
    })
    expect(
      persisted.workspaces[0].agents.map((agent: { agentId: string }) => agent.agentId)
    ).toEqual(['agent-1', 'agent-2'])
    expect(persisted.workspaces[0].agents[0].providerSessionRef).toEqual({
      formatVersion: 1,
      kind: 'codex-thread',
      value: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
    })
  })

  it('atomically initializes an empty workspace exactly once', async () => {
    const firstAgent = createAgent('agent-first', 'Agent 1')
    const secondAgent = createAgent('agent-second', 'Agent 1')

    const [firstResult, secondResult] = await Promise.all([
      repository.initializeWorkspace({
        agents: [firstAgent],
        projectId: 'project-1',
        workspaceId: 'workspace-main'
      }),
      repository.initializeWorkspace({
        agents: [secondAgent],
        projectId: 'project-1',
        workspaceId: 'workspace-main'
      })
    ])
    const stored = await repository.findWorkspace('project-1', 'workspace-main')

    expect(firstResult.map((agent) => agent.id)).toEqual(secondResult.map((agent) => agent.id))
    expect(stored?.map((agent) => agent.id)).toEqual(firstResult.map((agent) => agent.id))
    expect(stored).toHaveLength(1)
  })

  it('restores a Provider-neutral Claude Code binding without changing its codec value', async () => {
    const agent = AgentSession.create({
      agentId: 'agent-claude',
      layout: defaultLayout,
      name: 'Claude Agent',
      projectId: 'project-1',
      providerId: 'claude-code',
      workspaceId: 'workspace-main'
    })
    agent.bindProviderSession(
      createScope('agent-claude'),
      ProviderSessionRef.create(
        {
          formatVersion: 1,
          kind: 'claude-session',
          value: '550e8400-e29b-41d4-a716-446655440000'
        },
        'claude-code'
      )
    )
    await repository.save(agent)

    const reopened = await new FileSystemAgentSessionRepository(
      filePath,
      createProviderRegistry()
    ).findAgent('project-1', 'workspace-main', 'agent-claude')

    expect(reopened?.providerSessionRef?.toSnapshot()).toEqual({
      formatVersion: 1,
      kind: 'claude-session',
      value: '550e8400-e29b-41d4-a716-446655440000'
    })
  })

  it('clears the single Provider binding without deleting the canvas Agent', async () => {
    const agent = createAgent('agent-1', 'Agent 1')
    agent.bindProviderSession(
      createScope('agent-1'),
      codexThread('0190d8a1-8b7d-7d75-9f62-7a663ef87e33')
    )
    await repository.save(agent)

    await repository.delete(createScope('agent-1'))

    const reopened = await repository.findAgent('project-1', 'workspace-main', 'agent-1')
    expect(reopened).not.toBeNull()
    expect(reopened?.providerSessionRef).toBeNull()
  })

  it('rejects obsolete stores without migrating or rewriting them', async () => {
    const contents = JSON.stringify({ version: 4, workspaces: [] })
    await writeFile(filePath, contents)

    await expect(repository.findWorkspace('project-1', 'workspace-main')).rejects.toThrow(
      'Persisted Agent session store is invalid.'
    )
    await expect(readFile(filePath, 'utf8')).resolves.toBe(contents)
  })

  it('does not save an Agent whose Provider is not registered', async () => {
    const agent = AgentSession.create({
      agentId: 'agent-unknown',
      layout: defaultLayout,
      name: 'Unknown Agent',
      projectId: 'project-1',
      providerId: 'unknown-provider',
      workspaceId: 'workspace-main'
    })

    await expect(repository.save(agent)).rejects.toMatchObject({
      code: 'AGENT_PROVIDER_NOT_FOUND'
    })
    await expect(readFile(filePath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

const defaultLayout = {
  position: { x: 540, y: 120 },
  size: { width: 440, height: 520 }
} as const

function createScope(agentId: string) {
  return AgentConversationScope.create({
    agentId,
    projectId: 'project-1',
    workspaceId: 'workspace-main'
  })
}

function createAgent(agentId: string, name: string): AgentSession {
  return AgentSession.create({
    agentId,
    layout: defaultLayout,
    name,
    projectId: 'project-1',
    providerId: 'codex',
    workspaceId: 'workspace-main'
  })
}

function codexThread(value: string) {
  return ProviderSessionRef.create({ formatVersion: 1, kind: 'codex-thread', value })
}

function createProviderRegistry(): AgentProviderRegistry {
  const installedDetector = {
    inspect: async () => ({ providerId: 'codex', status: 'installed' as const, version: 'test' })
  }
  return new AgentProviderRegistry([
    new CodexAgentProviderContribution({ detector: installedDetector }),
    new ClaudeCodeAgentProviderContribution({
      detector: {
        inspect: async () => ({
          providerId: 'claude-code',
          status: 'installed' as const,
          version: 'test'
        })
      }
    })
  ])
}
