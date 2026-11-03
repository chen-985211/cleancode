import { AgentSessionService } from '../../../../src/contexts/agent/application/use-cases/AgentSessionService'
import { AgentSession } from '../../../../src/contexts/agent/domain/aggregates/AgentSession'
import type { AgentSessionRepository } from '../../../../src/contexts/agent/application/ports/AgentSessionRepository'
import type { AgentMcpServerPort } from '../../../../src/contexts/agent/application/ports/AgentMcpServerPort'
import type { AgentToolExecutionOperations } from '../../../../src/contexts/agent/application/use-cases/AgentToolApprovalCoordinator'
import {
  RecordingAgentProviderRegistry,
  RecordingAgentTerminalRuntime
} from '../../../fixtures/agentTerminalRuntime'

const worktree = '/repo/worktree'
const childProject = `${worktree}/packages/app`

describe('Agent directory archive protection', () => {
  it('finishes reciprocal workspace disposal while both directory protections remain held', async () => {
    const { service } = createHarness()
    const directories = ['/repo/a', '/repo/b']
    const protections = await Promise.all(
      directories.map((dir) => service.suspendWorkspaceDirectory(dir))
    )
    const disposed: Awaited<ReturnType<AgentSessionService['disposeSession']>>[] = []
    const pending = Promise.all(
      directories.map(async (projectDirectory) => {
        const lease = await service.disposeSession({ projectDirectory, workspaceId: 'linked-peer' })
        disposed.push(lease)
      })
    )
    try {
      await vi.waitFor(() => expect(disposed).toHaveLength(2))
      for (const dir of directories) {
        await expect(attach(service, dir)).rejects.toMatchObject({
          code: 'AGENT_SESSION_NOT_FOUND'
        })
      }
    } finally {
      protections.forEach((lease) => lease.release())
      await pending
      disposed.forEach((lease) => lease.release())
      await service.disposeAll()
    }
  })

  it.each(['report-home', 'new-conversation'] as const)(
    'protects a restored shell after the foreground Agent leaves via %s',
    async (transition) => {
      const home = '/repo/main'
      const { service, providers, runtime } = createHarness(undefined, async (scope) => {
        const saved = AgentSession.start(scope, 'codex')
        saved.setExecutionDirectory(worktree)
        return saved
      })
      try {
        await attach(service, home, { persisted: true })
        expect(runtime.opens[0]!.workingDirectory).toBe(worktree)
        if (transition === 'report-home') {
          await providers.launchCommands[0]!.onExecutionDirectoryChanged!(home)
        } else {
          runtime.launches[0]!.onExit({ generation: 1, launchId: 'launch-1', exitCode: 0 })
          await attach(service, home, { persisted: true, restartMode: 'new' })
          expect(runtime.launches[1]!.plan.workingDirectory).toBe(home)
        }
        expect(runtime.opens).toHaveLength(1)
        await expect(service.suspendWorkspaceDirectory(worktree)).rejects.toMatchObject({
          code: 'WORKSPACE_DIRECTORY_IN_USE'
        })
        expect(runtime.stops).toEqual([])
        runtime.opens[0]!.onTerminalExit(0)
        const lease = await service.suspendWorkspaceDirectory(worktree)
        lease.release()
      } finally {
        await service.disposeAll()
      }
    }
  )

  it.each([
    { home: childProject, reportedDirectory: null, blocked: true },
    { home: childProject, reportedDirectory: `${childProject}/src`, blocked: true },
    { home: `${worktree}-sibling`, reportedDirectory: null, blocked: false },
    { home: worktree, reportedDirectory: null, blocked: false }
  ])(
    'matches the actual suspension scope: $home / $reportedDirectory',
    async ({ home, reportedDirectory, blocked }) => {
      const { service, providers, runtime } = createHarness()
      let lease: Awaited<ReturnType<AgentSessionService['suspendWorkspaceDirectory']>> | undefined
      try {
        const session = await attach(service, home)
        if (reportedDirectory)
          await providers.launchCommands[0]!.onExecutionDirectoryChanged!(reportedDirectory)
        if (blocked) {
          await expect(service.suspendWorkspaceDirectory(worktree)).rejects.toMatchObject({
            code: 'WORKSPACE_DIRECTORY_IN_USE'
          })
          expect(runtime.stops).toEqual([])
        } else {
          lease = await service.suspendWorkspaceDirectory(worktree)
          expect(lease.wasSuspended).toBe(home === worktree)
          expect(runtime.stops).toEqual(home === worktree ? [session.sessionId] : [])
        }
      } finally {
        lease?.release()
        await service.disposeAll()
      }
    }
  )

  it('rejects a fresh child-project terminal while the parent directory lease is held', async () => {
    const { service, runtime } = createHarness()
    const lease = await service.suspendWorkspaceDirectory(worktree)
    try {
      const refused = await attach(service, childProject)
      expect(refused.runtime.terminal.status).toBe('failed')
      expect(runtime.opens).toEqual([])
      lease.release()
      expect((await attach(service, childProject)).runtime.terminal.status).toBe('running')
      expect(runtime.opens).toHaveLength(1)
    } finally {
      lease.release()
      await service.disposeAll()
    }
  })

  it('blocks a child-project attach whose definition lookup was already in flight', async () => {
    const started = createGate()
    const lookup = createGate()
    const { service, runtime } = createHarness(async () => {
      started.release()
      await lookup.promise
      return null
    })
    let lease: Awaited<ReturnType<AgentSessionService['suspendWorkspaceDirectory']>> | undefined
    try {
      const pending = attach(service, childProject)
      await started.promise
      lease = await service.suspendWorkspaceDirectory(worktree)
      lookup.release()
      expect((await pending).runtime.terminal.status).toBe('failed')
      expect(runtime.opens).toEqual([])
    } finally {
      lookup.release()
      lease?.release()
      await service.disposeAll()
    }
  })
})

function createHarness(
  findAgent: AgentSessionRepository['findAgent'] = async () => null,
  find: AgentSessionRepository['find'] = async () => null
) {
  const repository: AgentSessionRepository = {
    find,
    findAgent,
    findWorkspace: async () => [],
    save: async () => undefined,
    delete: async () => undefined,
    deleteAgent: async () => undefined,
    deleteProject: async () => undefined
  }
  const mcp: AgentMcpServerPort = {
    registerSession: async () => ({
      bearerToken: 'fixture',
      url: 'http://127.0.0.1/fixture',
      dispose: () => undefined
    }),
    dispose: () => undefined
  }
  const tools: AgentToolExecutionOperations = {
    cancel: async () => {
      throw new Error('No tool calls in directory guard tests.')
    },
    execute: async () => {
      throw new Error('No tool calls in directory guard tests.')
    }
  }
  const runtime = new RecordingAgentTerminalRuntime()
  const providers = new RecordingAgentProviderRegistry()
  return {
    runtime,
    providers,
    service: new AgentSessionService(
      runtime,
      mcp,
      tools,
      repository,
      providers,
      'codex',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        resolve: async ({ executionDirectory }) => executionDirectory
      }
    )
  }
}

function attach(
  service: AgentSessionService,
  home: string,
  options?: { persisted?: boolean; restartMode?: 'new' }
) {
  return service.attach({
    agentId: 'agent-1',
    projectId: home,
    projectDirectory: home,
    workspaceId: 'default',
    workspaceDirectory: home,
    persistenceMode: options?.persisted ? undefined : 'ephemeral',
    restartMode: options?.restartMode,
    terminalSourceTheme: 'dark',
    onGraphUpdated: () => undefined,
    onToolApprovalRequested: () => undefined
  })
}

function createGate() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}
