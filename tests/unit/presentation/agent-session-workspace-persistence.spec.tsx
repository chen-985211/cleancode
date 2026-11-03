import { act, renderHook, waitFor } from '@testing-library/react'

import { AgentSessionService } from '../../../src/contexts/agent/application/use-cases/AgentSessionService'
import type { AgentSessionRepository } from '../../../src/contexts/agent/application/ports/AgentSessionRepository'
import { AgentSession } from '../../../src/contexts/agent/domain/aggregates/AgentSession'
import { AgentConversationScope } from '../../../src/contexts/agent/domain/value-objects/AgentConversationScope'
import { ProviderSessionRef } from '../../../src/contexts/agent/domain/value-objects/ProviderSessionRef'
import { useAgentSessionAttachment } from '../../../src/presentation/app-shell/coordinators/useAgentSessionAttachment'
import type { WorkbenchSnapshot } from '../../../src/presentation/app-shell/types/workbenchSnapshot'
import {
  RecordingAgentProviderRegistry,
  RecordingAgentTerminalRuntime
} from '../../fixtures/agentTerminalRuntime'
import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'

const workspaceCases = [
  { name: 'default branch', linked: false, branch: 'main', hasBranches: true },
  { name: 'default detached HEAD', linked: false, branch: null, hasBranches: true },
  { name: 'linked branch', linked: true, branch: 'feature', hasBranches: true },
  { name: 'linked detached HEAD', linked: true, branch: null, hasBranches: true },
  {
    name: 'linked detached HEAD without local branches',
    linked: true,
    branch: null,
    hasBranches: false
  },
  { name: 'non-Git project', linked: false, branch: null, hasBranches: false }
] as const
const initialRef = { formatVersion: 1, kind: 'codex-thread', value: 'initial-thread' }
const followedRef = { ...initialRef, value: 'followed-thread' }

describe('Agent persistence through the workspace attachment entry point', () => {
  afterEach(() => Reflect.deleteProperty(window, 'cleancode'))

  it.each(
    workspaceCases.flatMap((workspace) =>
      (['new', 'retry'] as const).map((restartMode) => ({ ...workspace, restartMode }))
    )
  )('restores and follows the same Agent in $name, including $restartMode', async (scenario) => {
    const home = scenario.linked ? '/repo/app-worktrees/workspace' : '/repo/app'
    const isGit = scenario.hasBranches || scenario.linked
    const initialDirectory = isGit ? '/repo/app-worktrees/initial' : home
    const followedDirectory = isGit ? '/repo/app-worktrees/followed' : home
    const workbench = createWorkbenchSnapshot('/repo/app', 'app', {
      workspaceId: scenario.linked ? 'linked-workspace' : 'default',
      workspaceDirectory: home,
      gitBranch: scenario.branch,
      gitBranches: scenario.hasBranches
        ? createWorkbenchSnapshot('/repo/app', 'app', { gitBranch: 'main' }).gitBranches
        : []
    })
    const scope = AgentConversationScope.create({
      agentId: 'agent-1',
      projectId: workbench.project.id,
      workspaceId: workbench.project.workspaces[0]!.workspaceId
    })
    const agent = AgentSession.start(scope, 'codex')
    agent.bindProviderSession(ProviderSessionRef.create(initialRef))
    agent.setExecutionDirectory(initialDirectory)
    const repository = createRepository(agent)
    let app = mountAttachment(workbench, agent, repository)
    try {
      await waitFor(() => expect(app.view.result.current.session).not.toBeNull())
      expect(app.view.result.current.session).toMatchObject({
        ...scope.toSnapshot(),
        providerSessionRef: initialRef,
        runtime: { executionDirectory: initialDirectory }
      })
      expect(app.providers.launchCommands[0]!.providerSessionRef).toEqual(initialRef)
      expect(app.runtime.launches[0]!.plan.workingDirectory).toBe(initialDirectory)

      const launch = app.providers.launchCommands[0]!
      launch.onProviderSessionIdentified(followedRef)
      await launch.onExecutionDirectoryChanged!(followedDirectory)
      await waitFor(async () =>
        expect((await repository.find(scope))?.toSnapshot()).toMatchObject({
          providerSessionRef: followedRef,
          executionDirectory: followedDirectory
        })
      )

      // Recreate both the UI attachment and application service, retaining only persisted facts.
      app.view.unmount()
      await app.service.disposeAll()
      app = mountAttachment(workbench, agent, repository)
      await waitFor(() => expect(app.view.result.current.session).not.toBeNull())
      expect(app.view.result.current.session).toMatchObject({
        ...scope.toSnapshot(),
        providerSessionRef: followedRef,
        runtime: { executionDirectory: followedDirectory }
      })
      expect(app.providers.launchCommands[0]!.providerSessionRef).toEqual(followedRef)
      expect(app.runtime.launches[0]!.plan.workingDirectory).toBe(followedDirectory)

      act(() => {
        app.runtime.launches[0]!.onExit({ generation: 1, launchId: 'launch-1', exitCode: 0 })
        app.view.result.current.requestRestart(scenario.restartMode)
      })
      await waitFor(() => expect(app.attach).toHaveBeenCalledTimes(2))
      await waitFor(() => expect(app.view.result.current.operation.status).toBe('idle'))
      const isNew = scenario.restartMode === 'new'
      expect(app.view.result.current.session?.providerSessionRef).toEqual(
        isNew ? null : followedRef
      )
      expect(app.view.result.current.session?.runtime.executionDirectory).toBe(
        isNew ? undefined : followedDirectory
      )
      expect(app.runtime.launches[1]!.plan.workingDirectory).toBe(isNew ? home : followedDirectory)
      const persisted = (await repository.find(scope))?.toSnapshot()
      expect(persisted).toMatchObject({
        ...scope.toSnapshot(),
        providerSessionRef: isNew ? null : followedRef
      })
      expect(persisted?.executionDirectory).toBe(isNew ? undefined : followedDirectory)
      expect(app.runtime.opens).toHaveLength(1)
    } finally {
      app.view.unmount()
      await app.service.disposeAll()
    }
  })
})

function mountAttachment(
  workbench: WorkbenchSnapshot,
  agent: AgentSession,
  repository: AgentSessionRepository
) {
  const runtime = new RecordingAgentTerminalRuntime()
  const providers = new RecordingAgentProviderRegistry()
  const service = new AgentSessionService(
    runtime,
    {
      registerSession: async () => ({
        bearerToken: 'fixture',
        url: 'http://127.0.0.1/fixture',
        dispose: () => undefined
      }),
      dispose: () => undefined
    },
    {
      cancel: async () => {
        throw new Error('No tool calls in attachment persistence tests.')
      },
      execute: async () => {
        throw new Error('No tool calls in attachment persistence tests.')
      }
    },
    repository,
    providers,
    'codex',
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { resolve: async ({ executionDirectory }) => executionDirectory }
  )
  const attach = vi.fn(
    (command: Parameters<NonNullable<Window['cleancode']>['attachAgentSession']>[0]) =>
      service.attach({
        ...command,
        onGraphUpdated: () => undefined,
        onToolApprovalRequested: () => undefined
      })
  )
  Object.defineProperty(window, 'cleancode', {
    configurable: true,
    value: createRuntimeApi({ attachAgentSession: attach })
  })
  const workspaceKey = AgentConversationScope.create({
    agentId: agent.id,
    projectId: agent.projectId,
    workspaceId: agent.workspaceId
  }).key
  const dimensionsRef = { current: null }
  const view = renderHook(() =>
    useAgentSessionAttachment({
      activeAgent: agent.toSnapshot(),
      currentWorkbench: workbench,
      currentWorkspace: workbench.project.workspaces[0]!,
      currentWorkspaceKey: workspaceKey,
      dimensionsRef,
      measuredTerminalKey: workspaceKey
    })
  )
  return { attach, providers, runtime, service, view }
}

function createRepository(initial: AgentSession): AgentSessionRepository {
  let saved = initial.toSnapshot()
  const matches = (scope: ReturnType<AgentConversationScope['toSnapshot']>) =>
    scope.projectId === saved.projectId &&
    scope.workspaceId === saved.workspaceId &&
    scope.agentId === saved.agentId
  return {
    find: async (scope) =>
      matches(scope.toSnapshot()) ? AgentSession.fromSnapshot(saved, scope) : null,
    findAgent: async (projectId, workspaceId, agentId) =>
      matches({ projectId, workspaceId, agentId }) ? AgentSession.fromSnapshot(saved) : null,
    findWorkspace: async (projectId, workspaceId) =>
      matches({ projectId, workspaceId, agentId: saved.agentId })
        ? [AgentSession.fromSnapshot(saved)]
        : [],
    save: async (session) => {
      saved = session.toSnapshot()
    },
    delete: async (scope) => {
      if (matches(scope.toSnapshot()))
        saved = { ...saved, providerSessionRef: null, executionDirectory: undefined }
    },
    deleteAgent: async () => {
      throw new Error('Agent deletion is not part of this test.')
    },
    deleteProject: async () => {
      throw new Error('Project deletion is not part of this test.')
    }
  }
}
