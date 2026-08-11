import type {
  AgentTurnCompletedEvent,
  TerminalAgentActivitySnapshot
} from '../../../../src/contexts/agent/application/dto/AgentActivityProtocol'

const electronMocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  getPathForFile: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn()
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electronMocks.exposeInMainWorld },
  ipcRenderer: {
    invoke: electronMocks.invoke,
    on: electronMocks.on,
    removeListener: electronMocks.removeListener
  },
  webUtils: { getPathForFile: electronMocks.getPathForFile }
}))

import '../../../../src/platform/electron-preload/preload'

interface AgentActivityBridge {
  listAgentActivities(): Promise<readonly TerminalAgentActivitySnapshot[]>
  onAgentActivityChanged(listener: (snapshot: TerminalAgentActivitySnapshot) => void): () => void
  onAgentTurnCompleted(listener: (completion: AgentTurnCompletedEvent) => void): () => void
  updateAgentSessionMetadata(command: {
    readonly agentId: string
    readonly agentName: string
    readonly sessionId: string
  }): Promise<boolean>
}

const api = electronMocks.exposeInMainWorld.mock.calls[0]?.[1] as AgentActivityBridge

describe('Agent activity preload contract', () => {
  beforeEach(() => {
    electronMocks.invoke.mockReset()
    electronMocks.on.mockReset()
    electronMocks.removeListener.mockReset()
  })

  it('invokes the global Agent activity snapshot channel', async () => {
    const snapshots = [activitySnapshot]
    electronMocks.invoke.mockResolvedValue({ ok: true, value: snapshots })

    await expect(api.listAgentActivities()).resolves.toBe(snapshots)
    expect(electronMocks.invoke).toHaveBeenCalledWith('cleancode:list-agent-activities', undefined)
  })

  it('invokes the Agent session metadata channel without attaching a new launch', async () => {
    const command = {
      agentId: 'agent-1',
      agentName: 'Renamed Agent',
      sessionId: 'agent-session-1'
    }
    electronMocks.invoke.mockResolvedValue({ ok: true, value: true })

    await expect(api.updateAgentSessionMetadata(command)).resolves.toBe(true)
    expect(electronMocks.invoke).toHaveBeenCalledWith(
      'cleancode:update-agent-session-metadata',
      command
    )
  })

  it.each([
    {
      channel: 'cleancode:agent-activity-changed',
      payload: activitySnapshot,
      subscribe: (listener: (payload: TerminalAgentActivitySnapshot) => void) =>
        api.onAgentActivityChanged(listener)
    },
    {
      channel: 'cleancode:agent-turn-completed',
      payload: turnCompletedEvent,
      subscribe: (listener: (payload: AgentTurnCompletedEvent) => void) =>
        api.onAgentTurnCompleted(listener)
    }
  ])('subscribes to and precisely removes $channel', ({ channel, payload, subscribe }) => {
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)
    const subscription = electronMocks.on.mock.calls.find(
      ([registered]) => registered === channel
    )?.[1]

    expect(subscription).toEqual(expect.any(Function))
    subscription({}, payload)
    expect(listener).toHaveBeenCalledWith(payload)

    unsubscribe()
    expect(electronMocks.removeListener).toHaveBeenCalledWith(channel, subscription)
  })
})

const terminal = {
  blockId: 'terminal-1',
  generation: 2,
  gitBranch: null,
  owner: { id: 'terminal-1', kind: 'block' as const },
  projectDirectory: '/repo/app',
  projectId: 'project-1',
  runId: 'run-1',
  sessionId: 'session-1',
  workspaceDirectory: '/repo/app',
  workspaceId: 'main'
}

const activitySnapshot: TerminalAgentActivitySnapshot = {
  invocations: [{ invocationId: 'invocation-1', providerId: 'codex', status: 'idle' as const }],
  revision: 3,
  status: 'idle',
  terminal
}

const turnCompletedEvent: AgentTurnCompletedEvent = {
  completedAt: 1_723_456_789_000,
  completionId: 'completion-1',
  identity: { invocationId: 'invocation-1', providerId: 'codex', terminal },
  reason: 'reported',
  terminalRevision: 3
}
