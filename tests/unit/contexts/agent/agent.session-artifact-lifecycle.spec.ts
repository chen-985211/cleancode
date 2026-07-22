import type { AgentMcpServerPort } from '../../../../src/contexts/agent/application/ports/AgentMcpServerPort'
import type { AgentSessionRepository } from '../../../../src/contexts/agent/application/ports/AgentSessionRepository'
import { AgentSessionService } from '../../../../src/contexts/agent/application/use-cases/AgentSessionService'
import type { AgentToolExecutionResult } from '../../../../src/contexts/agent/application/use-cases/ExecuteAgentToolUseCase'
import type { AgentSession } from '../../../../src/contexts/agent/domain/aggregates/AgentSession'
import {
  RecordingAgentProviderRegistry,
  RecordingAgentTerminalRuntime
} from '../../../fixtures/agentTerminalRuntime'

describe('Agent session launch artifact lifecycle', () => {
  it('keeps a successfully stopped terminal suspended when artifact cleanup fails, then retries cleanup', async () => {
    const cleanupFailure = new Error('suspend artifact cleanup failed')
    const cleanup = vi.fn().mockRejectedValueOnce(cleanupFailure).mockResolvedValueOnce(undefined)
    const harness = createHarness([cleanup])
    const terminalStatuses: string[] = []
    await harness.service.attach(
      attachCommand('agent-1', (event) => terminalStatuses.push(event.runtime.terminal.status))
    )

    await expect(harness.service.suspendWorkspaceDirectory('/repo/app')).rejects.toMatchObject({
      failures: [{ error: cleanupFailure, label: 'launch-1' }]
    })

    expect(terminalStatuses.at(-1)).toBe('suspended')
    expect(harness.terminal.stopOperation).toHaveBeenCalledOnce()

    const lease = await harness.service.disposeAgent(disposeCommand('agent-1'))
    lease.release()
    expect(harness.terminal.stopOperation).toHaveBeenCalledOnce()
    expect(cleanup).toHaveBeenCalledTimes(2)
  })

  it('does not restore a dead terminal to running when reconfigure cleanup fails', async () => {
    const cleanupFailure = new Error('reconfigure artifact cleanup failed')
    const cleanup = vi.fn().mockRejectedValueOnce(cleanupFailure).mockResolvedValueOnce(undefined)
    const harness = createHarness([cleanup])
    const terminalStatuses: string[] = []
    await harness.service.attach(
      attachCommand('agent-1', (event) => terminalStatuses.push(event.runtime.terminal.status))
    )

    await expect(
      harness.service.reconfigureAgent({
        agentId: 'agent-1',
        cleancodeMcpEnabled: false,
        projectId: 'project-1',
        workspaceName: 'main'
      })
    ).rejects.toMatchObject({ failures: [{ error: cleanupFailure, label: 'launch-1' }] })

    expect(terminalStatuses.at(-1)).toBe('exited')
    const lease = await harness.service.disposeAgent(disposeCommand('agent-1'))
    lease.release()
    expect(harness.terminal.stopOperation).toHaveBeenCalledOnce()
    expect(cleanup).toHaveBeenCalledTimes(2)
  })

  it('retains a failed scope so disposeManagedSession can retry without stopping twice', async () => {
    const cleanupFailure = new Error('dispose artifact cleanup failed')
    const cleanup = vi.fn().mockRejectedValueOnce(cleanupFailure).mockResolvedValueOnce(undefined)
    const harness = createHarness([cleanup])
    await harness.service.attach(attachCommand('agent-1'))

    await expect(harness.service.disposeAgent(disposeCommand('agent-1'))).rejects.toMatchObject({
      failures: [{ error: cleanupFailure, label: 'launch-1' }]
    })
    expect(harness.terminal.stopOperation).toHaveBeenCalledOnce()

    const retryLease = await harness.service.disposeAgent(disposeCommand('agent-1'))
    retryLease.release()
    const idempotentLease = await harness.service.disposeAgent(disposeCommand('agent-1'))
    idempotentLease.release()

    expect(harness.terminal.stopOperation).toHaveBeenCalledOnce()
    expect(cleanup).toHaveBeenCalledTimes(2)
  })

  it('aggregates disposeAll failures, attempts every scope, and retries only failed artifacts', async () => {
    const terminalFailure = new Error('terminal disposeAll failed')
    const firstCleanupFailure = new Error('first artifact cleanup failed')
    const firstCleanup = vi
      .fn()
      .mockRejectedValueOnce(firstCleanupFailure)
      .mockResolvedValueOnce(undefined)
    const secondCleanup = vi.fn(async () => undefined)
    const harness = createHarness([firstCleanup, secondCleanup])
    harness.terminal.disposeAllOperation
      .mockImplementationOnce(() => {
        throw terminalFailure
      })
      .mockResolvedValue(undefined)
    await harness.service.attach(attachCommand('agent-1'))
    await harness.service.attach(attachCommand('agent-2'))

    const error = await harness.service.disposeAll().catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(AggregateError)
    expect(error).toMatchObject({
      errors: expect.arrayContaining([terminalFailure, expect.any(AggregateError)])
    })
    expect(firstCleanup).toHaveBeenCalledOnce()
    expect(secondCleanup).toHaveBeenCalledOnce()
    expect(harness.mcp.dispose).toHaveBeenCalledOnce()

    await harness.service.disposeAll()
    await harness.service.disposeAll()

    expect(firstCleanup).toHaveBeenCalledTimes(2)
    expect(secondCleanup).toHaveBeenCalledOnce()
  })
})

class ArtifactProviderRegistry extends RecordingAgentProviderRegistry {
  constructor(disposals: readonly (() => Promise<void>)[]) {
    super('codex', { cleancodeMcp: 'unsupported' })
    let launchIndex = 0
    this.contribution.launcher.createLaunchPlan = async (command) => {
      this.launchCommands.push(command)
      const dispose = disposals[launchIndex]!
      launchIndex += 1
      command.artifacts.track(`launch-${launchIndex}`, { dispose })
      return { args: [], env: {}, executable: 'fake-agent' }
    }
  }
}

class LifecycleTerminalRuntime extends RecordingAgentTerminalRuntime {
  readonly disposeAllOperation = vi.fn(async () => undefined)
  readonly stopOperation = vi.fn(async (sessionId: string) => {
    this.stops.push(sessionId)
  })

  override disposeAll(): Promise<void> {
    return this.disposeAllOperation()
  }

  override stop(sessionId: string): Promise<void> {
    return this.stopOperation(sessionId)
  }
}

class NoopMcpServer implements AgentMcpServerPort {
  readonly dispose = vi.fn()

  registerSession(): never {
    throw new Error('Unsupported MCP must not register a session.')
  }
}

class EmptyRepository implements AgentSessionRepository {
  find(): Promise<AgentSession | null> {
    return Promise.resolve(null)
  }

  findAgent(): Promise<AgentSession | null> {
    return Promise.resolve(null)
  }

  findWorkspace(): Promise<readonly AgentSession[]> {
    return Promise.resolve([])
  }

  save(): Promise<void> {
    return Promise.resolve()
  }

  delete(): Promise<void> {
    return Promise.resolve()
  }

  deleteAgent(): Promise<void> {
    return Promise.resolve()
  }

  deleteProject(): Promise<void> {
    return Promise.resolve()
  }
}

function createHarness(disposals: readonly (() => Promise<void>)[]) {
  const terminal = new LifecycleTerminalRuntime()
  const mcp = new NoopMcpServer()
  const service = new AgentSessionService(
    terminal,
    mcp,
    { cancel: vi.fn(), execute: vi.fn(async () => completedToolResult()) },
    new EmptyRepository(),
    new ArtifactProviderRegistry(disposals),
    'codex'
  )
  return { mcp, service, terminal }
}

function attachCommand(
  agentId: string,
  onRuntimeChanged: Parameters<AgentSessionService['attach']>[0]['onRuntimeChanged'] = vi.fn()
) {
  return {
    agentId,
    onGraphUpdated: vi.fn(),
    onRuntimeChanged,
    onToolApprovalRequested: vi.fn(),
    persistenceMode: 'ephemeral' as const,
    projectDirectory: '/repo/app',
    projectId: 'project-1',
    providerId: 'codex',
    terminalSourceTheme: 'light' as const,
    workspaceDirectory: '/repo/app',
    workspaceName: 'main'
  }
}

function disposeCommand(agentId: string) {
  return { agentId, projectId: 'project-1', workspaceName: 'main' }
}

function completedToolResult(): AgentToolExecutionResult {
  return {
    graph: {
      blocks: [],
      id: 'graph-1',
      projectId: 'project-1',
      terminalGroups: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      workspaceName: 'main'
    },
    graphChanged: false,
    output: { type: 'block_graph' },
    status: 'completed',
    toolCallId: 'tool-call-1'
  }
}
