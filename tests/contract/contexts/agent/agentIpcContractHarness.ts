import type { AgentIpcHandlersInput } from '../../../../src/platform/electron-main/agentIpcHandlers'
import type { IpcInvokeResult, IpcMainLike } from '../../../../src/platform/ipc/registerIpcHandler'
import type { Logger } from '../../../../src/platform/logging/Logger'

export class FakeIpcMain implements IpcMainLike {
  private readonly handlers = new Map<
    string,
    (event: unknown, command?: unknown) => Promise<IpcInvokeResult<unknown>>
  >()

  handle(
    channel: string,
    listener: (event: unknown, command?: unknown) => Promise<IpcInvokeResult<unknown>>
  ): void {
    this.handlers.set(channel, listener)
  }

  invoke<TResult>(
    channel: string,
    command?: unknown,
    event: unknown = createSenderEvent()
  ): Promise<IpcInvokeResult<TResult>> {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`No handler registered for ${channel}`)
    return handler(event, command) as Promise<IpcInvokeResult<TResult>>
  }
}

class SilentLogger implements Logger {
  debug(event: Parameters<Logger['debug']>[0]): void {
    this.ignore(event)
  }

  info(event: Parameters<Logger['info']>[0]): void {
    this.ignore(event)
  }

  warn(event: Parameters<Logger['warn']>[0]): void {
    this.ignore(event)
  }

  error(event: Parameters<Logger['error']>[0]): void {
    this.ignore(event)
  }

  private ignore(event: Parameters<Logger['debug']>[0]): void {
    void event
  }
}

export function createSender(): {
  readonly isDestroyed: () => boolean
  readonly send: ReturnType<typeof vi.fn>
} {
  return {
    isDestroyed: () => false,
    send: vi.fn()
  }
}

function createSenderEvent(): { readonly sender: ReturnType<typeof createSender> } {
  return { sender: createSender() }
}

export function createAgentIpcHandlersInput(input: {
  readonly approveAgentTool?: AgentIpcHandlersInput['approveAgentTool']
  readonly attachAgentSession?: AgentIpcHandlersInput['attachAgentSession']
  readonly createWorkspaceAgent?: AgentIpcHandlersInput['createWorkspaceAgent']
  readonly discoverCreatableAgentProviders?: AgentIpcHandlersInput['discoverCreatableAgentProviders']
  readonly disposeAgentWorkspaceSession?: AgentIpcHandlersInput['disposeAgentWorkspaceSession']
  readonly disposeProjectAgentSessions?: AgentIpcHandlersInput['disposeProjectAgentSessions']
  readonly inspectAgentProvider?: AgentIpcHandlersInput['inspectAgentProvider']
  readonly getAgentProviderPreferences?: AgentIpcHandlersInput['getAgentProviderPreferences']
  readonly listAgentActivities?: AgentIpcHandlersInput['listAgentActivities']
  readonly listAgentProviders?: AgentIpcHandlersInput['listAgentProviders']
  readonly ipcMain: IpcMainLike
  readonly rejectAgentTool?: AgentIpcHandlersInput['rejectAgentTool']
  readonly replayAgentToolApprovals?: AgentIpcHandlersInput['replayAgentToolApprovals']
  readonly removeWorkspaceAgent?: AgentIpcHandlersInput['removeWorkspaceAgent']
  readonly renameWorkspaceAgent?: AgentIpcHandlersInput['renameWorkspaceAgent']
  readonly resizeAgentSession?: AgentIpcHandlersInput['resizeAgentSession']
  readonly updateAgentSessionMetadata?: AgentIpcHandlersInput['updateAgentSessionMetadata']
  readonly writeAgentSession?: AgentIpcHandlersInput['writeAgentSession']
  readonly updateWorkspaceAgentLayout?: AgentIpcHandlersInput['updateWorkspaceAgentLayout']
  readonly updateWorkspaceAgentMcpCapability?: AgentIpcHandlersInput['updateWorkspaceAgentMcpCapability']
  readonly updateAgentProviderPreferences?: AgentIpcHandlersInput['updateAgentProviderPreferences']
}): AgentIpcHandlersInput {
  return {
    approveAgentTool: input.approveAgentTool ?? (async () => ({ status: 'not_found' })),
    attachAgentSession:
      input.attachAgentSession ??
      (async (command) => ({
        agentId: command.agentId,
        gitBranch: command.gitBranch ?? null,
        projectDirectory: command.projectDirectory,
        projectId: command.projectId,
        providerId: 'codex',
        providerSessionRef: null,
        runtime: createRuntime(command.agentId, command.projectId, command.workspaceId, 1),
        sessionId: 'agent-session-1',
        terminalSourceTheme: command.terminalSourceTheme,
        workspaceDirectory: command.workspaceDirectory,
        workspaceId: command.workspaceId
      })),
    createWorkspaceAgent:
      input.createWorkspaceAgent ?? (async () => createWorkspaceAgentSnapshot('agent-2')),
    discoverCreatableAgentProviders: input.discoverCreatableAgentProviders ?? (async () => []),
    disposeAgentWorkspaceSession: input.disposeAgentWorkspaceSession ?? (async () => undefined),
    disposeProjectAgentSessions: input.disposeProjectAgentSessions ?? (async () => undefined),
    inspectAgentProvider:
      input.inspectAgentProvider ??
      (async (providerId) => ({ providerId, status: 'installed' as const, version: '1.0.0' })),
    getAgentProviderPreferences:
      input.getAgentProviderPreferences ?? (async () => createAgentProviderPreferences()),
    ipcMain: input.ipcMain,
    listAgentActivities: input.listAgentActivities ?? (() => []),
    listAgentProviders:
      input.listAgentProviders ??
      (() => [
        {
          capabilities: {
            activityTracking: false,
            cleancodeMcp: true,
            launchInstructions: true,
            resume: true,
            sessionIdentityCapture: true,
            sessionRefCodec: true
          },
          displayName: 'Codex',
          icon: {
            paths: [{ d: 'M2 2h20v20H2z' }],
            viewBox: '0 0 24 24'
          },
          id: 'codex'
        }
      ]),
    logger: new SilentLogger(),
    rejectAgentTool: input.rejectAgentTool ?? (async () => undefined),
    replayAgentToolApprovals: input.replayAgentToolApprovals ?? (() => undefined),
    removeWorkspaceAgent:
      input.removeWorkspaceAgent ?? (async () => [createWorkspaceAgentSnapshot('agent-1')]),
    renameWorkspaceAgent:
      input.renameWorkspaceAgent ?? (async () => createWorkspaceAgentSnapshot('agent-1')),
    resizeAgentSession: input.resizeAgentSession ?? (() => undefined),
    updateAgentSessionMetadata: input.updateAgentSessionMetadata ?? (() => true),
    writeAgentSession: input.writeAgentSession ?? (() => undefined),
    updateWorkspaceAgentLayout:
      input.updateWorkspaceAgentLayout ?? (async () => createWorkspaceAgentSnapshot('agent-1')),
    updateWorkspaceAgentMcpCapability:
      input.updateWorkspaceAgentMcpCapability ??
      (async () => ({ agent: createWorkspaceAgentSnapshot('agent-1'), session: null })),
    updateAgentProviderPreferences:
      input.updateAgentProviderPreferences ?? (async () => createAgentProviderPreferences())
  }
}

export function createAgentProviderPreferences() {
  return {
    defaultCleancodeMcpEnabled: true,
    mcpToolCategories: { canvas: true, collaboration: true },
    defaultProviderId: null,
    disabledProviderIds: [],
    permissionMode: 'yolo' as const,
    providerOverrides: {},
    version: 1 as const
  }
}

export function createWorkspaceAgentSnapshot(agentId: string) {
  return {
    agentId,
    cleancodeMcpEnabled: true,
    layout: { position: { x: 540, y: 120 }, size: { width: 440, height: 520 } },
    name: agentId === 'agent-1' ? 'Agent 1' : 'Agent 2',
    projectId: 'project-1',
    providerId: 'codex',
    workspaceId: 'main'
  }
}

export function createRuntime(
  agentId: string,
  projectId: string,
  workspaceId: string,
  revision: number
) {
  return {
    activity: { status: 'working' as const },
    binding: { status: 'unbound' as const },
    launch: {
      exitCode: null,
      failureKind: null,
      generation: 1,
      launchId: 'launch-1',
      status: 'running' as const
    },
    mcp: { status: 'ready' as const },
    revision,
    terminal: {
      exitCode: null,
      processId: 42,
      status: 'running' as const,
      stopReason: null,
      viewIdentity: {
        blockId: agentId,
        generation: 1,
        owner: { id: agentId, kind: 'agent' as const },
        projectId,
        runId: 'agent-terminal:agent-session-1',
        sessionId: 'run-session-1',
        workspaceId
      }
    }
  }
}
