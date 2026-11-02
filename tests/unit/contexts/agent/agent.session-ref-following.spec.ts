import type { AgentExecutionDirectoryPort } from '../../../../src/contexts/agent/application/ports/AgentExecutionDirectoryPort'
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
  it('clears the execution directory for a new ephemeral conversation', async () => {
    const providers = new RecordingAgentProviderRegistry()
    const runtime = new RecordingAgentTerminalRuntime()
    const service = createSessionService(providers, new RecordingAgentSessionRepository(), runtime)
    await attachAgent(service, 'agent-1', undefined, 'ephemeral')
    await providers.launchCommands[0]!.onExecutionDirectoryChanged!('/repo/app-worktrees/feature')
    runtime.launches[0]!.onExit({ generation: 1, launchId: 'launch-1', exitCode: 0 })
    await attachAgent(service, 'agent-1', 'new', 'ephemeral')
    expect(providers.launchCommands[1]!.workspaceDirectory).toBe('/repo/app')
    await service.disposeAll()
  })

  it('keeps the latest identified conversation when a later directory report retries a failed save', async () => {
    const repository = new RecordingAgentSessionRepository()
    const providers = new RecordingAgentProviderRegistry()
    const service = createSessionService(providers, repository)
    await attachAgent(service, 'agent-1')
    vi.spyOn(repository, 'save').mockRejectedValueOnce(new Error('disk unavailable'))
    const ref = {
      formatVersion: 1,
      kind: 'codex-thread',
      value: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
    }
    providers.launchCommands[0]!.onProviderSessionIdentified(ref)
    await vi.waitFor(async () =>
      expect((await attachAgent(service, 'agent-1')).runtime.binding.status).toBe(
        'persistence_failed'
      )
    )
    await providers.launchCommands[0]!.onExecutionDirectoryChanged!('/repo/app-worktrees/feature')
    await service.disposeAll()
    expect(
      (await repository.findAgent('project-1', 'main', 'agent-1'))?.toSnapshot()
    ).toMatchObject({ providerSessionRef: ref, executionDirectory: '/repo/app-worktrees/feature' })
  })

  it('retries saving the same confirmed directory after a persistence failure', async () => {
    const repository = new RecordingAgentSessionRepository()
    const providers = new RecordingAgentProviderRegistry()
    const service = createSessionService(providers, repository)
    await attachAgent(service, 'agent-1')
    vi.spyOn(repository, 'save').mockRejectedValueOnce(new Error('disk unavailable'))
    const report = providers.launchCommands[0]!.onExecutionDirectoryChanged!
    await report('/repo/app-worktrees/feature')
    await vi.waitFor(async () =>
      expect((await attachAgent(service, 'agent-1')).runtime.binding.status).toBe(
        'persistence_failed'
      )
    )
    await report('/repo/app-worktrees/feature')
    await service.disposeAll()
    expect((await repository.findAgent('project-1', 'main', 'agent-1'))?.executionDirectory).toBe(
      '/repo/app-worktrees/feature'
    )
  })

  it('starts an explicit new conversation at home even when the retained shell was restored elsewhere', async () => {
    const repository = new RecordingAgentSessionRepository()
    const firstProviders = new RecordingAgentProviderRegistry()
    const first = createSessionService(firstProviders, repository)
    await attachAgent(first, 'agent-1')
    firstProviders.launchCommands[0]!.onProviderSessionIdentified({
      formatVersion: 1,
      kind: 'codex-thread',
      value: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
    })
    await firstProviders.launchCommands[0]!.onExecutionDirectoryChanged!(
      '/repo/app-worktrees/feature'
    )
    await first.disposeAll()
    const providers = new RecordingAgentProviderRegistry()
    const runtime = new RecordingAgentTerminalRuntime()
    const service = createSessionService(providers, repository, runtime)
    await attachAgent(service, 'agent-1')
    runtime.launches[0]!.onExit({ generation: 1, launchId: 'launch-1', exitCode: 0 })
    await attachAgent(service, 'agent-1', 'new')
    expect(runtime.opens).toHaveLength(1)
    expect(providers.launchCommands[1]!.workspaceDirectory).toBe('/repo/app')
    expect(runtime.launches[1]!.plan.workingDirectory).toBe('/repo/app')
    await service.disposeAll()
  })

  it('fails restoration if the confirmed directory disappeared instead of launching at home', async () => {
    const repository = new RecordingAgentSessionRepository()
    const providers = new RecordingAgentProviderRegistry()
    const service = createSessionService(providers, repository)
    await attachAgent(service, 'agent-1')
    await providers.launchCommands[0]!.onExecutionDirectoryChanged!('/repo/app-worktrees/removed')
    await service.disposeAll()
    const nextRuntime = new RecordingAgentTerminalRuntime()
    const nextProviders = new RecordingAgentProviderRegistry()
    const restored = await attachAgent(
      createSessionService(nextProviders, repository, nextRuntime, { resolve: async () => null }),
      'agent-1'
    )
    expect(restored.runtime.terminal.status).toBe('failed')
    expect(nextRuntime.opens).toHaveLength(0)
    expect(nextProviders.launchCommands).toHaveLength(0)
  })

  it('persists a directory update when the conversation was already bound before launch', async () => {
    const repository = new RecordingAgentSessionRepository()
    const initial = new RecordingAgentProviderRegistry()
    const initialService = createSessionService(initial, repository)
    await attachAgent(initialService, 'agent-1')
    initial.launchCommands[0]!.onProviderSessionIdentified({
      formatVersion: 1,
      kind: 'codex-thread',
      value: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
    })
    await initialService.disposeAll()
    const providers = new RecordingAgentProviderRegistry()
    const service = createSessionService(providers, repository)
    await attachAgent(service, 'agent-1')
    await providers.launchCommands[0]!.onExecutionDirectoryChanged!('/repo/app-worktrees/second')
    await service.disposeAll()
    expect((await repository.findAgent('project-1', 'main', 'agent-1'))?.executionDirectory).toBe(
      '/repo/app-worktrees/second'
    )
  })

  it('refuses to suspend a directory used by an Agent from another canvas', async () => {
    const providers = new RecordingAgentProviderRegistry()
    const runtime = new RecordingAgentTerminalRuntime()
    const service = createSessionService(providers, new RecordingAgentSessionRepository(), runtime)
    await attachAgent(service, 'agent-1')
    await providers.launchCommands[0]!.onExecutionDirectoryChanged!(
      '/repo/app-worktrees/feature/subdir'
    )
    await expect(
      service.suspendWorkspaceDirectory('/repo/app-worktrees/feature')
    ).rejects.toMatchObject({ code: 'WORKSPACE_DIRECTORY_IN_USE' })
    expect(runtime.stops).toEqual([])
    await service.disposeAll()
  })

  it('blocks foreign directory reports for the duration of a directory lease', async () => {
    const providers = new RecordingAgentProviderRegistry()
    const service = createSessionService(providers, new RecordingAgentSessionRepository())
    await attachAgent(service, 'agent-1')
    const lease = await service.suspendWorkspaceDirectory('/repo/app-worktrees/feature')
    expect(
      await providers.launchCommands[0]!.onExecutionDirectoryChanged!('/repo/app-worktrees/feature')
    ).toBe(false)
    lease.release()
    expect(
      await providers.launchCommands[0]!.onExecutionDirectoryChanged!('/repo/app-worktrees/feature')
    ).toBe(true)
    await service.disposeAll()
  })

  it('checks the Provider identity again after asynchronous directory validation', async () => {
    const providers = new RecordingAgentProviderRegistry()
    const service = createSessionService(providers, new RecordingAgentSessionRepository())
    await attachAgent(service, 'agent-1')
    const reported = await providers.launchCommands[0]!.onExecutionDirectoryChanged!(
      '/repo/app-worktrees/old',
      () => false
    )
    expect(reported).toBe(false)
    await service.disposeAll()
  })

  it('follows execution directories without moving the logical Agent and restores the last directory', async () => {
    const repository = new RecordingAgentSessionRepository()
    const providers = new RecordingAgentProviderRegistry()
    const runtime = new RecordingAgentTerminalRuntime()
    const service = createSessionService(providers, repository, runtime)
    const attached = await attachAgent(service, 'agent-1')
    const launch = providers.launchCommands[0]!
    expect(launch.onExecutionDirectoryChanged).toBeTypeOf('function')
    launch.onProviderSessionIdentified({
      formatVersion: 1,
      kind: 'codex-thread',
      value: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
    })
    await launch.onExecutionDirectoryChanged!('/repo/app-worktrees/feature')
    await service.disposeAll()
    const saved = await repository.findAgent('project-1', 'main', 'agent-1')
    expect(saved?.toSnapshot()).toMatchObject({
      workspaceId: 'main',
      executionDirectory: '/repo/app-worktrees/feature'
    })
    const nextProviders = new RecordingAgentProviderRegistry()
    const nextRuntime = new RecordingAgentTerminalRuntime()
    const next = await attachAgent(
      createSessionService(nextProviders, repository, nextRuntime),
      'agent-1'
    )
    expect(next.workspaceId).toBe(attached.workspaceId)
    expect(nextRuntime.opens[0]).toMatchObject({
      workspaceId: 'main',
      workspaceDirectory: '/repo/app',
      workingDirectory: '/repo/app-worktrees/feature'
    })
    expect(nextProviders.launchCommands[0]?.workspaceDirectory).toBe('/repo/app-worktrees/feature')
  })

  it('rejects directory callbacks after a launch is disposed', async () => {
    const providers = new RecordingAgentProviderRegistry()
    const repository = new RecordingAgentSessionRepository()
    const service = createSessionService(providers, repository)
    await attachAgent(service, 'agent-1')
    const launch = providers.launchCommands[0]!
    expect(launch.onExecutionDirectoryChanged).toBeTypeOf('function')
    await service.disposeAll()
    expect(await launch.onExecutionDirectoryChanged!('/repo/app-worktrees/late')).toBe(false)
  })

  it('starts a new conversation only after draining the exited launch final identity', async () => {
    const repository = new RecordingAgentSessionRepository()
    const providers = new RecordingAgentProviderRegistry()
    const runtime = new RecordingAgentTerminalRuntime()
    const originalLaunch = providers.contribution.launcher.createLaunchPlan
    let release!: () => void
    const closing = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.spyOn(providers.contribution.launcher, 'createLaunchPlan').mockImplementation(
      async (command) => {
        command.artifacts.track('late-final-report', {
          dispose: async () => {
            await closing
            command.onProviderSessionIdentified({
              formatVersion: 1,
              kind: 'codex-thread',
              value: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
            })
          }
        })
        return originalLaunch(command)
      }
    )
    const service = createSessionService(providers, repository, runtime)
    await attachAgent(service, 'agent-1')
    runtime.launches[0]!.onExit({ generation: 1, launchId: 'launch-1', exitCode: 0 })
    const restarting = attachAgent(service, 'agent-1', 'new')
    // One event-loop boundary lets the in-memory attach reach the controlled cleanup gate.
    await new Promise<void>((resolve) => setImmediate(resolve))
    release()
    await restarting
    expect(providers.launchCommands[1]?.providerSessionRef).toBeUndefined()
    expect(
      (await repository.findAgent('project-1', 'main', 'agent-1'))?.providerSessionRef ?? null
    ).toBeNull()
  })

  it('drains the closing launch identity but rejects callbacks after resource disposal', async () => {
    const repository = new RecordingAgentSessionRepository()
    const providers = new RecordingAgentProviderRegistry()
    const originalLaunch = providers.contribution.launcher.createLaunchPlan
    const finalRef = {
      formatVersion: 1,
      kind: 'codex-thread',
      value: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
    }
    vi.spyOn(providers.contribution.launcher, 'createLaunchPlan').mockImplementation(
      async (command) => {
        command.artifacts.track('final-identity', {
          dispose: async () => command.onProviderSessionIdentified(finalRef)
        })
        return originalLaunch(command)
      }
    )
    const service = createSessionService(providers, repository)
    await attachAgent(service, 'agent-1')
    await service.disposeAll()
    const save = vi.spyOn(repository, 'save')
    const previous = providers.launchCommands[0]!
    previous.onProviderSessionCleared?.()
    previous.onProviderSessionIdentified({
      ...finalRef,
      value: '0290d8a1-8b7d-7d75-9f62-7a663ef87e44'
    })
    const reopened = new RecordingAgentProviderRegistry()
    await attachAgent(createSessionService(reopened, repository), 'agent-1')
    expect(reopened.launchCommands[0]?.providerSessionRef).toEqual(finalRef)
    expect(save).not.toHaveBeenCalled()
  })

  it('orders a Provider empty-session boundary between durable identities', async () => {
    const repository = new GatedAgentSessionRepository()
    const providers = new RecordingAgentProviderRegistry()
    const service = createSessionService(providers, repository)
    await attachAgent(service, 'agent-1')
    const command = providers.launchCommands[0]!
    repository.blockNextFind()
    command.onProviderSessionIdentified({
      formatVersion: 1,
      kind: 'codex-thread',
      value: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
    })
    await repository.blockedFindStarted
    expect(command).toHaveProperty('onProviderSessionCleared', expect.any(Function))
    command.onProviderSessionCleared?.()
    repository.releaseBlockedFind()
    await vi.waitFor(async () => {
      expect(
        (await repository.findAgent('project-1', 'main', 'agent-1'))?.providerSessionRef ?? null
      ).toBeNull()
      expect(repository.persistenceSaveCount).toBeGreaterThan(0)
    })
    command.onProviderSessionIdentified({
      formatVersion: 1,
      kind: 'codex-thread',
      value: '0290d8a1-8b7d-7d75-9f62-7a663ef87e44'
    })
    await vi.waitFor(async () =>
      expect(
        (await repository.findAgent('project-1', 'main', 'agent-1'))?.providerSessionRef?.value
      ).toBe('0290d8a1-8b7d-7d75-9f62-7a663ef87e44')
    )
  })

  it('clears a confirmed missing binding and accepts the next durable identity', async () => {
    const repository = new RecordingAgentSessionRepository()
    const firstProviders = new RecordingAgentProviderRegistry()
    await attachAgent(createSessionService(firstProviders, repository), 'agent-1')
    const ref = {
      formatVersion: 1,
      kind: 'codex-thread',
      value: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
    }
    firstProviders.launchCommands[0]!.onProviderSessionIdentified(ref)
    await vi.waitFor(async () => {
      expect(
        (await repository.findAgent('project-1', 'main', 'agent-1'))?.providerSessionRef
      ).toMatchObject(ref)
    })

    const providers = new RecordingAgentProviderRegistry()
    const originalLaunch = providers.contribution.launcher.createLaunchPlan
    vi.spyOn(providers.contribution.launcher, 'createLaunchPlan').mockImplementation(
      async (command) => ({
        ...(await originalLaunch(command)),
        discardProviderSessionRef: true
      })
    )
    await attachAgent(createSessionService(providers, repository), 'agent-1')
    expect(await repository.findAgent('project-1', 'main', 'agent-1')).toBeNull()

    providers.launchCommands[0]!.onProviderSessionIdentified(ref)
    await vi.waitFor(async () => {
      expect(
        (await repository.findAgent('project-1', 'main', 'agent-1'))?.providerSessionRef
      ).toMatchObject(ref)
    })
  })

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
  repository: AgentSessionRepository,
  runtime = new RecordingAgentTerminalRuntime(),
  directories: AgentExecutionDirectoryPort = {
    resolve: async ({ executionDirectory }) => executionDirectory
  }
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
    runtime,
    new RecordingMcpServer(),
    unusedTools,
    repository,
    providers,
    'codex',
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    directories
  )
}

function attachAgent(
  service: AgentSessionService,
  agentId: string,
  restartMode?: 'new',
  persistenceMode?: 'ephemeral'
) {
  return service.attach({
    agentId,
    restartMode,
    persistenceMode,
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
