import { AgentToolInvocationCoordinator } from '../../../../src/contexts/agent/application/use-cases/AgentToolInvocationCoordinator'
import type { AgentToolExecutionResult } from '../../../../src/contexts/agent/application/use-cases/ExecuteAgentToolUseCase'

describe('Agent tool invocation coordinator', () => {
  it('serializes tool execution across Agents in one workspace', async () => {
    let finishFirst: (result: AgentToolExecutionResult) => void = () => undefined
    const execute = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<AgentToolExecutionResult>((resolve) => {
            finishFirst = resolve
          })
      )
      .mockResolvedValueOnce(completedResult('tool-call-2'))
    const coordinator = new AgentToolInvocationCoordinator({ cancel: vi.fn(), execute })

    const first = coordinator.execute(command('tool-call-1', 'session-1', 'main'))
    const second = coordinator.execute(command('tool-call-2', 'session-2', 'main'))
    await Promise.resolve()

    expect(execute).toHaveBeenCalledTimes(1)
    finishFirst(completedResult('tool-call-1'))
    await expect(first).resolves.toEqual(completedResult('tool-call-1'))
    await expect(second).resolves.toEqual(completedResult('tool-call-2'))
    expect(execute.mock.calls.map(([input]) => input.toolCallId)).toEqual([
      'tool-call-1',
      'tool-call-2'
    ])
  })

  it('allows different workspaces to execute independently', async () => {
    const execute = vi.fn(async (input: { readonly toolCallId: string }) =>
      completedResult(input.toolCallId)
    )
    const coordinator = new AgentToolInvocationCoordinator({ cancel: vi.fn(), execute })

    await Promise.all([
      coordinator.execute(command('tool-call-main', 'session-1', 'main')),
      coordinator.execute(command('tool-call-feature', 'session-2', 'feature'))
    ])

    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('rejects new calls after closing begins and drains admitted calls', async () => {
    let finishCall: () => void = () => undefined
    const coordinator = new AgentToolInvocationCoordinator({ cancel: vi.fn(), execute: vi.fn() })
    const admitted = coordinator.runSessionToolCall(
      'session-1',
      () =>
        new Promise<void>((resolve) => {
          finishCall = resolve
        })
    )

    coordinator.beginSessionClosing('session-1')
    await expect(
      coordinator.runSessionToolCall('session-1', async () => undefined)
    ).rejects.toMatchObject({ code: 'AGENT_SESSION_NOT_FOUND' })
    let drained = false
    const drain = coordinator.waitForSession('session-1').then(() => {
      drained = true
    })
    await Promise.resolve()
    expect(drained).toBe(false)

    finishCall()
    await admitted
    await drain
    expect(drained).toBe(true)
  })
})

function command(toolCallId: string, sessionId: string, workspaceId: string) {
  return {
    agentId: 'agent-1',
    input: {},
    projectDirectory: '/repo/app',
    projectId: 'project-1',
    sessionId,
    toolCallId,
    toolName: 'inspect_graph' as const,
    workspaceId
  }
}

function completedResult(toolCallId: string): AgentToolExecutionResult {
  return {
    graph: {
      blocks: [],
      id: 'graph-1',
      projectId: 'project-1',
      terminalGroups: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      workspaceId: 'main'
    },
    graphChanged: false,
    output: { type: 'block_graph' },
    status: 'completed',
    toolCallId
  }
}
