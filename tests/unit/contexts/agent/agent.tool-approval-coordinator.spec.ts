import { AgentConversationScope } from '../../../../src/contexts/agent/domain/value-objects/AgentConversationScope'
import { AgentToolApprovalCoordinator } from '../../../../src/contexts/agent/application/use-cases/AgentToolApprovalCoordinator'
import type { AgentToolExecutionResult } from '../../../../src/contexts/agent/application/use-cases/ExecuteAgentToolUseCase'
import type { ManagedAgentSession } from '../../../../src/contexts/agent/application/use-cases/AgentSessionRuntimeState'
import type { BlockGraphSnapshot } from '../../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'

describe('Agent tool approval coordinator', () => {
  it('waits for an already approved call to finish instead of canceling it', async () => {
    let finishApprovedCall: (result: AgentToolExecutionResult) => void = () => undefined
    const execute = vi
      .fn()
      .mockResolvedValueOnce(awaitingApproval('tool-call-1'))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishApprovedCall = resolve
          })
      )
    const cancel = vi.fn()
    const session = createManagedSession()
    const coordinator = new AgentToolApprovalCoordinator({ cancel, execute }, () => session)
    const toolResult = coordinator.execute(session, {
      input: { connectionId: 'connection-1' },
      sessionId: session.sessionId,
      toolCallId: 'tool-call-1',
      toolName: 'disconnect_terminal_blocks'
    })

    await vi.waitFor(() => expect(coordinator.list()).toHaveLength(1))
    const approval = coordinator.approve('tool-call-1')
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(2))
    let sessionCancellationFinished = false
    const sessionCancellation = coordinator.cancelSession(session.sessionId).then(() => {
      sessionCancellationFinished = true
    })
    await Promise.resolve()

    expect(sessionCancellationFinished).toBe(false)
    expect(cancel).not.toHaveBeenCalled()
    expect(execute).toHaveBeenLastCalledWith(
      expect.objectContaining({
        agentId: 'agent-1',
        approved: true,
        projectId: 'project-1',
        toolCallId: 'tool-call-1',
        toolName: 'disconnect_terminal_blocks'
      })
    )

    finishApprovedCall(completedGraphResult('tool-call-1', true))
    await expect(toolResult).resolves.toEqual(completedGraphResult('tool-call-1', true))
    await expect(approval).resolves.toEqual({ graph: fakeGraph, status: 'completed' })
    await sessionCancellation
    expect(sessionCancellationFinished).toBe(true)
  })

  it('publishes graph updates only when a completed call changed the graph', async () => {
    const session = createManagedSession()
    const coordinator = new AgentToolApprovalCoordinator(
      {
        cancel: vi.fn(),
        execute: vi.fn(async () => completedGraphResult('tool-inspect', false))
      },
      () => session
    )

    await coordinator.execute(session, {
      input: {},
      sessionId: session.sessionId,
      toolCallId: 'tool-inspect',
      toolName: 'inspect_graph'
    })

    expect(session.callbacks.onGraphUpdated).not.toHaveBeenCalled()
  })

  it('publishes one layout change event with the tool call id and arranged object ids', async () => {
    const session = createManagedSession()
    const execute = vi.fn(async () => completedArrangeResult('layout-operation-1'))
    const coordinator = new AgentToolApprovalCoordinator(
      { cancel: vi.fn(), execute },
      () => session
    )

    await coordinator.execute(session, {
      input: { blockIds: ['terminal-api', 'terminal-test'] },
      sessionId: session.sessionId,
      toolCallId: 'layout-operation-1',
      toolName: 'arrange_terminal_layout'
    })

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-1',
        projectId: 'project-1',
        toolCallId: 'layout-operation-1'
      })
    )
    expect(session.callbacks.onGraphUpdated).toHaveBeenCalledOnce()
    expect(session.callbacks.onGraphUpdated).toHaveBeenCalledWith({
      agentId: 'agent-1',
      change: {
        blockIds: ['terminal-api', 'terminal-test'],
        kind: 'terminal_layout_arranged',
        operationId: 'layout-operation-1',
        terminalGroupIds: ['terminal-group-dev-test']
      },
      graph: fakeGraph,
      projectDirectory: '/repo/app',
      sessionId: 'agent-session-1',
      workspaceName: 'main'
    })
  })

  it('returns a structured failure to the approval surface and completes the tool call', async () => {
    const failure = failedResult('tool-call-failed')
    const execute = vi
      .fn()
      .mockResolvedValueOnce(awaitingApproval('tool-call-failed'))
      .mockResolvedValueOnce(failure)
    const session = createManagedSession()
    const coordinator = new AgentToolApprovalCoordinator(
      { cancel: vi.fn(), execute },
      () => session
    )
    const toolResult = coordinator.execute(session, {
      input: { connectionId: 'connection-1' },
      sessionId: session.sessionId,
      toolCallId: 'tool-call-failed',
      toolName: 'disconnect_terminal_blocks'
    })

    await vi.waitFor(() => expect(coordinator.list()).toHaveLength(1))

    await expect(coordinator.approve('tool-call-failed')).resolves.toEqual({
      error: failure.error,
      status: 'failed'
    })
    await expect(toolResult).resolves.toEqual(failure)
    expect(session.callbacks.onGraphUpdated).not.toHaveBeenCalled()
  })

  it('cancels instead of registering an approval after its session starts closing', async () => {
    let finishInitialCall: (result: AgentToolExecutionResult) => void = () => undefined
    const execute = vi.fn(
      () =>
        new Promise<AgentToolExecutionResult>((resolve) => {
          finishInitialCall = resolve
        })
    )
    const cancel = vi.fn(async (command: { readonly toolCallId: string }, reason: string) => ({
      output: { reason, type: 'tool_canceled' as const },
      status: 'canceled' as const,
      toolCallId: command.toolCallId
    }))
    const session = createManagedSession()
    const coordinator = new AgentToolApprovalCoordinator({ cancel, execute }, () => session)
    const toolResult = coordinator.execute(session, {
      input: { connectionId: 'connection-1' },
      sessionId: session.sessionId,
      toolCallId: 'tool-call-closing',
      toolName: 'disconnect_terminal_blocks'
    })

    session.isStopping = true
    finishInitialCall(awaitingApproval('tool-call-closing'))

    await expect(toolResult).resolves.toMatchObject({
      status: 'canceled',
      toolCallId: 'tool-call-closing'
    })
    expect(cancel).toHaveBeenCalledWith(
      expect.objectContaining({ toolCallId: 'tool-call-closing' }),
      'Agent session stopped before approval could be requested.'
    )
    expect(session.callbacks.onToolApprovalRequested).not.toHaveBeenCalled()
    expect(coordinator.list()).toEqual([])
  })

  it('settles concurrent cancellation when cancellation auditing fails', async () => {
    const session = createManagedSession()
    const coordinator = new AgentToolApprovalCoordinator(
      {
        cancel: vi.fn(async () => {
          throw new Error('audit storage unavailable')
        }),
        execute: vi.fn(async () => awaitingApproval('tool-call-cancel-failed'))
      },
      () => session
    )
    const toolResult = coordinator.execute(session, {
      input: { connectionId: 'connection-1' },
      sessionId: session.sessionId,
      toolCallId: 'tool-call-cancel-failed',
      toolName: 'disconnect_terminal_blocks'
    })

    await vi.waitFor(() => expect(coordinator.list()).toHaveLength(1))
    await Promise.all([
      coordinator.reject('tool-call-cancel-failed'),
      coordinator.cancelSession(session.sessionId)
    ])

    await expect(toolResult).resolves.toMatchObject({
      error: { code: 'UNEXPECTED_ERROR', isExpected: false },
      status: 'failed',
      toolCallId: 'tool-call-cancel-failed'
    })
    expect(coordinator.list()).toEqual([])
  })

  it('cleans up an approval when its UI notification cannot be delivered', async () => {
    const session = createManagedSession()
    session.callbacks = {
      ...session.callbacks,
      onToolApprovalRequested: vi.fn(() => {
        throw new Error('approval window closed')
      })
    }
    const cancel = vi.fn(async (command: { readonly toolCallId: string }, reason: string) => ({
      output: { reason, type: 'tool_canceled' as const },
      status: 'canceled' as const,
      toolCallId: command.toolCallId
    }))
    const coordinator = new AgentToolApprovalCoordinator(
      {
        cancel,
        execute: vi.fn(async () => awaitingApproval('tool-call-notification-failed'))
      },
      () => session
    )

    await expect(
      coordinator.execute(session, {
        input: { connectionId: 'connection-1' },
        sessionId: session.sessionId,
        toolCallId: 'tool-call-notification-failed',
        toolName: 'disconnect_terminal_blocks'
      })
    ).resolves.toMatchObject({
      status: 'canceled',
      toolCallId: 'tool-call-notification-failed'
    })
    expect(cancel).toHaveBeenCalledWith(
      expect.objectContaining({ toolCallId: 'tool-call-notification-failed' }),
      'Approval request could not be delivered.'
    )
    expect(coordinator.list()).toEqual([])
  })

  it('keeps a committed result completed when its graph projection callback fails', async () => {
    const session = createManagedSession()
    session.callbacks = {
      ...session.callbacks,
      onGraphUpdated: vi.fn(() => {
        throw new Error('renderer unavailable')
      })
    }
    const coordinator = new AgentToolApprovalCoordinator(
      {
        cancel: vi.fn(),
        execute: vi.fn(async () => completedGraphResult('tool-call-committed', true))
      },
      () => session
    )

    await expect(
      coordinator.execute(session, {
        input: {},
        sessionId: session.sessionId,
        toolCallId: 'tool-call-committed',
        toolName: 'inspect_graph'
      })
    ).resolves.toEqual(completedGraphResult('tool-call-committed', true))
    expect(session.callbacks.onGraphUpdated).toHaveBeenCalledOnce()
  })
})

function createManagedSession(): ManagedAgentSession {
  return {
    agentId: 'agent-1',
    callbacks: {
      onGraphUpdated: vi.fn(),
      onRuntimeChanged: vi.fn(),
      onToolApprovalRequested: vi.fn()
    },
    cleancodeMcpEnabled: true,
    columns: 80,
    gitBranch: null,
    isTerminalRunning: true,
    isStopping: false,
    launchArtifacts: null,
    mcpSupported: true,
    projectDirectory: '/repo/app',
    projectId: 'project-1',
    providerId: 'codex',
    providerLaunchGeneration: 0,
    providerSessionRef: null,
    rows: 24,
    runtime: {
      activity: { status: 'idle' },
      binding: { status: 'unbound' },
      launch: {
        exitCode: null,
        failureKind: null,
        generation: 1,
        launchId: 'launch-1',
        status: 'running'
      },
      mcp: { status: 'ready' },
      revision: 1,
      terminal: {
        exitCode: null,
        processId: 1,
        status: 'running',
        stopReason: null,
        viewIdentity: null
      }
    },
    scope: AgentConversationScope.create({
      agentId: 'agent-1',
      gitBranch: null,
      projectId: 'project-1',
      workspaceName: 'main'
    }),
    sessionId: 'agent-session-1',
    shouldPersist: true,
    terminalSourceTheme: 'light',
    workspaceDirectory: '/repo/app',
    workspaceName: 'main'
  }
}

function awaitingApproval(toolCallId: string): AgentToolExecutionResult {
  return {
    approval: {
      summary: '断开终端依赖 connection-1',
      target: { connectionId: 'connection-1', kind: 'terminal_connection' },
      toolName: 'disconnect_terminal_blocks'
    },
    status: 'awaiting_approval',
    toolCallId
  }
}

function completedGraphResult(toolCallId: string, graphChanged: boolean): AgentToolExecutionResult {
  return {
    graph: fakeGraph,
    graphChanged,
    output: { type: 'block_graph' },
    status: 'completed',
    toolCallId
  }
}

function completedArrangeResult(toolCallId: string): AgentToolExecutionResult {
  return {
    graph: fakeGraph,
    graphChanged: true,
    output: {
      arrangedBlockIds: ['terminal-api', 'terminal-test'],
      arrangedTerminalGroupIds: ['terminal-group-dev-test'],
      type: 'block_graph'
    },
    status: 'completed',
    toolCallId
  }
}

function failedResult(toolCallId: string): Extract<AgentToolExecutionResult, { status: 'failed' }> {
  return {
    error: {
      code: 'TERMINAL_CONNECTION_NOT_FOUND',
      isExpected: true,
      message: 'Terminal connection no longer exists.'
    },
    status: 'failed',
    toolCallId
  }
}

const fakeGraph: BlockGraphSnapshot = {
  blocks: [],
  id: 'graph-1',
  projectId: 'project-1',
  terminalGroups: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  workspaceName: 'main'
}
