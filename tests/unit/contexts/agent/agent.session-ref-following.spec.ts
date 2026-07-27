import type {
  AgentMcpRegistration,
  AgentMcpServerPort,
  RegisteredAgentMcpSession
} from '../../../../src/contexts/agent/application/ports/AgentMcpServerPort'
import type { AgentSessionRepository } from '../../../../src/contexts/agent/application/ports/AgentSessionRepository'
import { AgentSessionService } from '../../../../src/contexts/agent/application/use-cases/AgentSessionService'
import type { AgentToolExecutionOperations } from '../../../../src/contexts/agent/application/use-cases/AgentToolApprovalCoordinator'
import { AgentSession } from '../../../../src/contexts/agent/domain/aggregates/AgentSession'
import type { AgentConversationScope } from '../../../../src/contexts/agent/domain/value-objects/AgentConversationScope'
import {
  RecordingAgentProviderRegistry,
  RecordingAgentTerminalRuntime
} from '../../../fixtures/agentTerminalRuntime'

describe('Agent Provider session following', () => {
  it('resumes the last identified thread when an older persistence finishes late', async () => {
    const repository = new GatedAgentSessionRepository()
    const firstProviders = new RecordingAgentProviderRegistry()
    const firstService = createSessionService(firstProviders, repository)

    await attachAgent(firstService, 'agent-1')
    repository.blockNextFind()
    firstProviders.launchCommands[0]?.onProviderSessionIdentified({
      formatVersion: 1,
      kind: 'codex-thread',
      value: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
    })
    await repository.blockedFindStarted
    firstProviders.launchCommands[0]?.onProviderSessionIdentified({
      formatVersion: 1,
      kind: 'codex-thread',
      value: '0290d8a1-8b7d-7d75-9f62-7a663ef87e44'
    })
    firstProviders.launchCommands[0]?.onProviderSessionIdentified({
      formatVersion: 1,
      kind: 'codex-thread',
      metadata: { confirmedBy: 'duplicate-notify' },
      value: '0290d8a1-8b7d-7d75-9f62-7a663ef87e44'
    })

    const concurrentFindCount = repository.persistenceFindCount
    repository.releaseBlockedFind()
    await vi.waitFor(() => expect(repository.persistenceSaveCount).toBe(2))
    expect(concurrentFindCount).toBe(1)

    const restartedProviders = new RecordingAgentProviderRegistry()
    await attachAgent(createSessionService(restartedProviders, repository), 'agent-1')

    expect(restartedProviders.launchCommands[0]?.providerSessionRef).toMatchObject({
      kind: 'codex-thread',
      value: '0290d8a1-8b7d-7d75-9f62-7a663ef87e44'
    })
  })

  it('keeps the last Provider session identity isolated per Agent', async () => {
    const providers = new RecordingAgentProviderRegistry()
    const repository = new RecordingAgentSessionRepository()
    const service = createSessionService(providers, repository)

    await attachAgent(service, 'agent-1')
    await attachAgent(service, 'agent-2')
    providers.launchCommands[0]?.onProviderSessionIdentified({
      formatVersion: 1,
      kind: 'codex-thread',
      value: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
    })
    providers.launchCommands[0]?.onProviderSessionIdentified({
      formatVersion: 1,
      kind: 'codex-thread',
      value: '0290d8a1-8b7d-7d75-9f62-7a663ef87e44'
    })
    providers.launchCommands[1]?.onProviderSessionIdentified({
      formatVersion: 1,
      kind: 'codex-thread',
      value: '0390d8a1-8b7d-7d75-9f62-7a663ef87e55'
    })

    await vi.waitFor(async () => {
      expect(
        (await repository.findAgent('project-1', 'main', 'agent-1'))?.providerSessionRef?.value
      ).toBe('0290d8a1-8b7d-7d75-9f62-7a663ef87e44')
      expect(
        (await repository.findAgent('project-1', 'main', 'agent-2'))?.providerSessionRef?.value
      ).toBe('0390d8a1-8b7d-7d75-9f62-7a663ef87e55')
    })
  })
})

function createSessionService(
  providers: RecordingAgentProviderRegistry,
  repository: AgentSessionRepository
): AgentSessionService {
  const unusedTools: AgentToolExecutionOperations = {
    cancel: async () => {
      throw new Error('Agent tools are not used by session-ref following tests.')
    },
    execute: async () => {
      throw new Error('Agent tools are not used by session-ref following tests.')
    }
  }
  return new AgentSessionService(
    new RecordingAgentTerminalRuntime(),
    new RecordingMcpServer(),
    unusedTools,
    repository,
    providers,
    'codex'
  )
}

function attachAgent(service: AgentSessionService, agentId: string) {
  return service.attach({
    agentId,
    columns: 80,
    onGraphUpdated: () => undefined,
    onRuntimeChanged: () => undefined,
    onToolApprovalRequested: () => undefined,
    projectDirectory: '/repo/app',
    projectId: 'project-1',
    rows: 24,
    terminalSourceTheme: 'light',
    workspaceDirectory: '/repo/app',
    workspaceId: 'main'
  })
}

class RecordingMcpServer implements AgentMcpServerPort {
  dispose(): void {}

  registerSession(session: RegisteredAgentMcpSession): Promise<AgentMcpRegistration> {
    return Promise.resolve({
      bearerToken: `token-${session.sessionId}`,
      dispose: () => undefined,
      url: `http://127.0.0.1/${session.sessionId}`
    })
  }
}

class RecordingAgentSessionRepository implements AgentSessionRepository {
  readonly sessions = new Map<string, AgentSession>()

  async find(scope: AgentConversationScope): Promise<AgentSession | null> {
    const snapshot = scope.toSnapshot()
    const session = this.sessions.get(
      agentKey(snapshot.projectId, snapshot.workspaceId, snapshot.agentId)
    )
    return session ? AgentSession.fromSnapshot(session.toSnapshot(), scope) : null
  }

  findAgent(projectId: string, workspaceId: string, agentId: string): Promise<AgentSession | null> {
    return Promise.resolve(this.sessions.get(agentKey(projectId, workspaceId, agentId)) ?? null)
  }

  findWorkspace(projectId: string, workspaceId: string): Promise<readonly AgentSession[]> {
    return Promise.resolve(
      [...this.sessions.values()].filter(
        (session) => session.projectId === projectId && session.workspaceId === workspaceId
      )
    )
  }

  save(session: AgentSession): Promise<void> {
    this.sessions.set(
      agentKey(session.projectId, session.workspaceId, session.id),
      AgentSession.fromSnapshot(session.toSnapshot())
    )
    return Promise.resolve()
  }

  delete(scope: AgentConversationScope): Promise<void> {
    const snapshot = scope.toSnapshot()
    this.sessions.delete(agentKey(snapshot.projectId, snapshot.workspaceId, snapshot.agentId))
    return Promise.resolve()
  }

  deleteAgent(projectId: string, workspaceId: string, agentId: string): Promise<void> {
    this.sessions.delete(agentKey(projectId, workspaceId, agentId))
    return Promise.resolve()
  }

  deleteProject(projectId: string): Promise<void> {
    for (const [key, session] of this.sessions) {
      if (session.projectId === projectId) this.sessions.delete(key)
    }
    return Promise.resolve()
  }
}

class GatedAgentSessionRepository extends RecordingAgentSessionRepository {
  private activeBlockedFind: Deferred<void> | null = null
  private blockedFind: Deferred<void> | null = null
  private blockedFindStartedSignal: Deferred<void> = createDeferred()
  private trackPersistenceFinds = false
  persistenceFindCount = 0
  persistenceSaveCount = 0

  get blockedFindStarted(): Promise<void> {
    return this.blockedFindStartedSignal.promise
  }

  blockNextFind(): void {
    this.blockedFind = createDeferred()
    this.blockedFindStartedSignal = createDeferred()
    this.persistenceFindCount = 0
    this.trackPersistenceFinds = true
  }

  releaseBlockedFind(): void {
    this.activeBlockedFind?.resolve()
    this.activeBlockedFind = null
  }

  override async find(scope: AgentConversationScope): Promise<AgentSession | null> {
    if (this.trackPersistenceFinds) this.persistenceFindCount += 1
    const blockedFind = this.blockedFind
    if (blockedFind) {
      this.blockedFind = null
      this.activeBlockedFind = blockedFind
      this.blockedFindStartedSignal.resolve()
      await blockedFind.promise
    }
    return super.find(scope)
  }

  override async save(session: AgentSession): Promise<void> {
    this.persistenceSaveCount += 1
    await super.save(session)
  }
}

interface Deferred<T> {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
}

function createDeferred<T = void>(): Deferred<T> {
  let resolvePromise!: (value: T) => void
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  return { promise, resolve: resolvePromise }
}

function agentKey(projectId: string, workspaceId: string, agentId: string): string {
  return JSON.stringify([projectId, workspaceId, agentId])
}
