import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { AgentSession } from '../../../../src/contexts/agent/domain/aggregates/AgentSession'
import { AgentProviderRegistry } from '../../../../src/contexts/agent/application/services/AgentProviderRegistry'
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

  it('restores multiple Agents and their exact branch conversations', async () => {
    const firstAgent = createAgent('agent-1', 'Agent 1')
    const secondAgent = createAgent('agent-2', 'Agent 2')
    firstAgent.bindProviderSession(
      createScope('agent-1', 'main'),
      thread('0190d8a1-8b7d-7d75-9f62-7a663ef87e33')
    )
    secondAgent.bindProviderSession(
      createScope('agent-2', 'main'),
      thread('0190d8a2-4f13-7e17-a0c1-64c303571909')
    )
    secondAgent.setCleancodeMcpEnabled(false)
    await repository.save(firstAgent)
    await repository.save(secondAgent)

    const reopenedRepository = new FileSystemAgentSessionRepository(
      filePath,
      createProviderRegistry()
    )
    const agents = await reopenedRepository.findWorkspace('project-1', 'main')

    expect(agents?.map((agent) => agent.id)).toEqual(['agent-1', 'agent-2'])
    expect(agents?.[0]?.layout).toEqual({
      position: { x: 540, y: 120 },
      size: { width: 440, height: 520 }
    })
    expect(agents?.[0]?.findProviderSessionRef('main')?.value).toBe(
      '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
    )
    expect(agents?.[1]?.findProviderSessionRef('main')?.value).toBe(
      '0190d8a2-4f13-7e17-a0c1-64c303571909'
    )
    expect(agents?.map((agent) => agent.providerId)).toEqual(['codex', 'codex'])
    expect(agents?.[0]?.cleancodeMcpEnabled).toBe(true)
    expect(agents?.[1]?.cleancodeMcpEnabled).toBe(false)
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toMatchObject({ version: 4 })
  })

  it('atomically initializes an empty workspace exactly once', async () => {
    const firstAgent = createAgent('agent-first', 'Agent 1')
    const secondAgent = createAgent('agent-second', 'Agent 1')

    const [firstResult, secondResult] = await Promise.all([
      repository.initializeWorkspace({
        agents: [firstAgent],
        projectId: 'project-1',
        workspaceName: 'main'
      }),
      repository.initializeWorkspace({
        agents: [secondAgent],
        projectId: 'project-1',
        workspaceName: 'main'
      })
    ])
    const stored = await repository.findWorkspace('project-1', 'main')

    expect(firstResult.map((agent) => agent.id)).toEqual(secondResult.map((agent) => agent.id))
    expect(stored?.map((agent) => agent.id)).toEqual(firstResult.map((agent) => agent.id))
    expect(stored).toHaveLength(1)

    await expect(
      repository.initializeWorkspace({
        agents: [],
        projectId: 'project-empty',
        workspaceName: 'main'
      })
    ).resolves.toEqual([])
    await expect(repository.findWorkspace('project-empty', 'main')).resolves.toEqual([])
  })

  it('restores a Claude Code reference through its Provider codec without changing v4 shape', async () => {
    const agent = AgentSession.create({
      agentId: 'agent-claude',
      layout: { position: { x: 540, y: 120 }, size: { width: 440, height: 520 } },
      name: 'Claude Agent',
      projectId: 'project-1',
      providerId: 'claude-code',
      workspaceName: 'main'
    })
    agent.bindProviderSession(
      createScope('agent-claude', 'main'),
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
    ).findAgent('project-1', 'main', 'agent-claude')
    const persisted = JSON.parse(await readFile(filePath, 'utf8'))

    expect(reopened?.findProviderSessionRef('main')?.providerId).toBe('claude-code')
    expect(persisted.workspaces[0].agents[0].conversations[0].sessionRef).toEqual({
      formatVersion: 1,
      kind: 'claude-session',
      value: '550e8400-e29b-41d4-a716-446655440000'
    })
  })

  it('does not save an Agent whose Provider is not registered', async () => {
    const agent = AgentSession.create({
      agentId: 'agent-unknown',
      layout: { position: { x: 540, y: 120 }, size: { width: 440, height: 520 } },
      name: 'Unknown Agent',
      projectId: 'project-1',
      providerId: 'unknown-provider',
      workspaceName: 'main'
    })

    await expect(repository.save(agent)).rejects.toMatchObject({
      code: 'AGENT_PROVIDER_NOT_FOUND'
    })
    await expect(readFile(filePath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects a v4 session reference that does not match its owning Provider without rewriting it', async () => {
    const contents = JSON.stringify({
      version: 4,
      workspaces: [
        {
          agents: [
            {
              agentId: 'agent-1',
              cleancodeMcpEnabled: true,
              conversations: [
                {
                  gitBranch: 'main',
                  sessionRef: {
                    formatVersion: 1,
                    kind: 'claude-session',
                    value: '550e8400-e29b-41d4-a716-446655440000'
                  }
                }
              ],
              layout: {
                position: { x: 540, y: 120 },
                size: { width: 440, height: 520 }
              },
              name: 'Agent 1',
              projectId: 'project-1',
              providerId: 'codex',
              workspaceName: 'main'
            }
          ],
          projectId: 'project-1',
          workspaceName: 'main'
        }
      ]
    })
    await writeFile(filePath, contents)

    await expect(repository.findWorkspace('project-1', 'main')).rejects.toMatchObject({
      code: 'AGENT_SESSION_INVALID'
    })
    await expect(readFile(filePath, 'utf8')).resolves.toBe(contents)
  })

  it('raw-clears one corrupt v4 binding without decoding the Agent snapshot', async () => {
    await writeFile(
      filePath,
      JSON.stringify({
        version: 4,
        workspaces: [
          {
            agents: [
              {
                agentId: 'agent-1',
                cleancodeMcpEnabled: true,
                conversations: [
                  {
                    gitBranch: 'main',
                    sessionRef: { formatVersion: 0, kind: '', value: '' }
                  },
                  {
                    gitBranch: 'feature/keep',
                    sessionRef: { formatVersion: 0, kind: 'also-corrupt', value: '' }
                  }
                ],
                layout: {
                  position: { x: 540, y: 120 },
                  size: { width: 440, height: 520 }
                },
                name: 'Agent 1',
                projectId: 'project-1',
                providerId: 'codex',
                workspaceName: 'main'
              }
            ],
            projectId: 'project-1',
            workspaceName: 'main'
          }
        ]
      })
    )

    await expect(repository.delete(createScope('agent-1', 'main'))).resolves.toBeUndefined()

    const persisted = JSON.parse(await readFile(filePath, 'utf8'))
    expect(persisted.version).toBe(4)
    expect(persisted.workspaces[0].agents[0].conversations).toEqual([
      {
        gitBranch: 'feature/keep',
        sessionRef: { formatVersion: 0, kind: 'also-corrupt', value: '' }
      }
    ])
  })

  it('migrates version 3 Codex bindings into Provider-neutral session references', async () => {
    await import('node:fs/promises').then(({ writeFile }) =>
      writeFile(
        filePath,
        JSON.stringify({
          version: 3,
          workspaces: [
            {
              agents: [
                {
                  agentId: 'agent-1',
                  cleancodeMcpEnabled: true,
                  conversations: [
                    {
                      codexThreadId: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33',
                      gitBranch: 'main'
                    }
                  ],
                  layout: {
                    position: { x: 540, y: 120 },
                    size: { width: 440, height: 520 }
                  },
                  name: 'Agent 1',
                  projectId: 'project-1',
                  workspaceName: 'main'
                }
              ],
              projectId: 'project-1',
              workspaceName: 'main'
            }
          ]
        })
      )
    )

    const agents = await repository.findWorkspace('project-1', 'main')
    const persisted = JSON.parse(await readFile(filePath, 'utf8'))

    expect(agents?.[0]?.providerId).toBe('codex')
    expect(agents?.[0]?.findProviderSessionRef('main')?.toSnapshot()).toEqual({
      formatVersion: 1,
      kind: 'codex-thread',
      value: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
    })
    expect(persisted).toMatchObject({
      version: 4,
      workspaces: [
        {
          agents: [
            {
              providerId: 'codex',
              conversations: [
                {
                  gitBranch: 'main',
                  sessionRef: {
                    formatVersion: 1,
                    kind: 'codex-thread',
                    value: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
                  }
                }
              ]
            }
          ]
        }
      ]
    })
  })

  it('migrates version 2 Agents with the CleanCode canvas MCP enabled by default', async () => {
    await import('node:fs/promises').then(({ writeFile }) =>
      writeFile(
        filePath,
        JSON.stringify({
          version: 2,
          workspaces: [
            {
              agents: [
                {
                  agentId: 'agent-1',
                  conversations: [],
                  layout: {
                    position: { x: 540, y: 120 },
                    size: { width: 440, height: 520 }
                  },
                  name: 'Agent 1',
                  projectId: 'project-1',
                  workspaceName: 'main'
                }
              ],
              projectId: 'project-1',
              workspaceName: 'main'
            }
          ]
        })
      )
    )

    const agents = await repository.findWorkspace('project-1', 'main')

    expect(agents?.[0]?.cleancodeMcpEnabled).toBe(true)
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toMatchObject({
      version: 4,
      workspaces: [
        {
          agents: [{ agentId: 'agent-1', cleancodeMcpEnabled: true, providerId: 'codex' }]
        }
      ]
    })
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
    expect(agents?.[0]?.findProviderSessionRef('main')?.value).toBe(
      '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
    )
    expect(agents?.[0]?.findProviderSessionRef('feature/login')?.value).toBe(
      '0190d8a2-4f13-7e17-a0c1-64c303571909'
    )
    expect(agents?.[0]?.providerId).toBe('codex')
    expect(agents?.[0]?.cleancodeMcpEnabled).toBe(true)
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toMatchObject({ version: 4 })
  })

  it('does not rewrite a legacy store when its migrated Provider session reference is invalid', async () => {
    const contents = JSON.stringify({
      version: 1,
      sessions: [
        {
          codexThreadId: 'not-a-codex-thread-id',
          scope: { gitBranch: 'main', projectId: 'project-1', workspaceName: 'main' }
        }
      ]
    })
    await writeFile(filePath, contents)

    await expect(repository.findWorkspace('project-1', 'main')).rejects.toMatchObject({
      code: 'AGENT_SESSION_INVALID'
    })
    await expect(readFile(filePath, 'utf8')).resolves.toBe(contents)
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
    providerId: 'codex',
    workspaceName: 'main'
  })
}

function thread(value: string) {
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
