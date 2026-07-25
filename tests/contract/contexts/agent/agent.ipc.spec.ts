import {
  registerAgentIpcHandlers,
  type AgentIpcHandlersInput
} from '../../../../src/platform/electron-main/agentIpcHandlers'
import type { IpcInvokeResult, IpcMainLike } from '../../../../src/platform/ipc/registerIpcHandler'
import type { Logger } from '../../../../src/platform/logging/Logger'

class FakeIpcMain implements IpcMainLike {
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

    if (!handler) {
      throw new Error(`No handler registered for ${channel}`)
    }

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

describe('agent IPC contract', () => {
  it('reads and updates validated Agent Provider preferences through typed channels', async () => {
    const ipcMain = new FakeIpcMain()
    const getAgentProviderPreferences = vi.fn(async () => createAgentProviderPreferences())
    const updateAgentProviderPreferences = vi.fn(async () => ({
      ...createAgentProviderPreferences(),
      defaultProviderId: 'claude-code',
      permissionMode: 'manual' as const
    }))

    registerAgentIpcHandlers(
      createAgentIpcHandlersInput({
        getAgentProviderPreferences,
        ipcMain,
        updateAgentProviderPreferences
      })
    )

    await expect(ipcMain.invoke('cleancode:get-agent-provider-preferences')).resolves.toEqual({
      ok: true,
      value: createAgentProviderPreferences()
    })
    await expect(
      ipcMain.invoke('cleancode:update-agent-provider-preferences', {
        defaultProviderId: 'claude-code',
        permissionMode: 'manual'
      })
    ).resolves.toMatchObject({
      ok: true,
      value: { defaultProviderId: 'claude-code', permissionMode: 'manual' }
    })
    expect(updateAgentProviderPreferences).toHaveBeenCalledWith({
      defaultProviderId: 'claude-code',
      permissionMode: 'manual'
    })

    await expect(
      ipcMain.invoke('cleancode:update-agent-provider-preferences', {
        permissionMode: 'unsafe'
      })
    ).resolves.toMatchObject({
      error: { code: 'INVALID_IPC_COMMAND', isExpected: true },
      ok: false
    })
    expect(updateAgentProviderPreferences).toHaveBeenCalledOnce()
  })

  it('attaches the renderer to a workspace Codex PTY session and streams session events to it', async () => {
    const ipcMain = new FakeIpcMain()
    const sender = createSender()
    const attachAgentSession = vi.fn<AgentIpcHandlersInput['attachAgentSession']>(
      async (command) => {
        command.onRuntimeChanged({
          agentId: command.agentId,
          runtime: createRuntime(command.agentId, command.projectId, command.workspaceName, 2),
          sessionId: 'agent-session-1'
        })
        command.onToolApprovalRequested({
          agentId: command.agentId,
          approvalId: 'approval-1',
          projectDirectory: command.projectDirectory,
          sessionId: 'agent-session-1',
          summary: '删除终端积木 terminal-1',
          target: { blockId: 'terminal-1', kind: 'terminal_block' },
          toolName: 'delete_block',
          workspaceName: command.workspaceName
        })
        command.onGraphUpdated({
          agentId: command.agentId,
          graph: {
            blocks: [],
            id: 'graph-1',
            projectId: 'project-1',
            terminalGroups: [],
            viewport: { x: 0, y: 0, zoom: 1 },
            workspaceName: command.workspaceName
          },
          projectDirectory: command.projectDirectory,
          sessionId: 'agent-session-1',
          workspaceName: command.workspaceName
        })

        return {
          agentId: command.agentId,
          gitBranch: command.gitBranch ?? null,
          projectDirectory: command.projectDirectory,
          projectId: command.projectId,
          providerId: 'codex',
          providerSessionRef: null,
          runtime: createRuntime(command.agentId, command.projectId, command.workspaceName, 2),
          sessionId: 'agent-session-1',
          terminalSourceTheme: command.terminalSourceTheme,
          workspaceDirectory: command.workspaceDirectory,
          workspaceName: command.workspaceName
        }
      }
    )

    registerAgentIpcHandlers(createAgentIpcHandlersInput({ attachAgentSession, ipcMain }))

    await expect(
      ipcMain.invoke(
        'cleancode:attach-agent-session',
        {
          agentId: 'agent-2',
          columns: 100,
          gitBranch: 'feature/login',
          projectDirectory: '/repo/app',
          projectId: 'project-1',
          rows: 32,
          terminalSourceTheme: 'light',
          workspaceDirectory: '/repo/app-worktrees/feature',
          workspaceName: 'feature'
        },
        { sender }
      )
    ).resolves.toEqual({
      ok: true,
      value: {
        agentId: 'agent-2',
        gitBranch: 'feature/login',
        projectDirectory: '/repo/app',
        projectId: 'project-1',
        providerId: 'codex',
        providerSessionRef: null,
        runtime: createRuntime('agent-2', 'project-1', 'feature', 2),
        sessionId: 'agent-session-1',
        terminalSourceTheme: 'light',
        workspaceDirectory: '/repo/app-worktrees/feature',
        workspaceName: 'feature'
      }
    })
    expect(attachAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-2',
        columns: 100,
        gitBranch: 'feature/login',
        projectDirectory: '/repo/app',
        projectId: 'project-1',
        rows: 32,
        terminalSourceTheme: 'light',
        workspaceDirectory: '/repo/app-worktrees/feature',
        workspaceName: 'feature'
      })
    )
    expect(sender.send).toHaveBeenCalledWith('cleancode:agent-runtime-changed', {
      agentId: 'agent-2',
      runtime: createRuntime('agent-2', 'project-1', 'feature', 2),
      sessionId: 'agent-session-1'
    })
    expect(sender.send).toHaveBeenCalledWith(
      'cleancode:agent-runtime-changed',
      expect.objectContaining({
        runtime: expect.objectContaining({
          terminal: expect.objectContaining({ stopReason: null })
        })
      })
    )
    expect(sender.send).toHaveBeenCalledWith(
      'cleancode:agent-tool-approval-requested',
      expect.objectContaining({ approvalId: 'approval-1' })
    )
    expect(sender.send).toHaveBeenCalledWith(
      'cleancode:agent-graph-updated',
      expect.objectContaining({ sessionId: 'agent-session-1' })
    )
  })

  it('rejects an invalid terminal source theme before attaching an Agent session', async () => {
    const ipcMain = new FakeIpcMain()
    const attachAgentSession = vi.fn<AgentIpcHandlersInput['attachAgentSession']>()

    registerAgentIpcHandlers(createAgentIpcHandlersInput({ attachAgentSession, ipcMain }))

    await expect(
      ipcMain.invoke('cleancode:attach-agent-session', {
        agentId: 'agent-2',
        projectDirectory: '/repo/app',
        projectId: 'project-1',
        terminalSourceTheme: 'sepia',
        workspaceDirectory: '/repo/app',
        workspaceName: 'main'
      })
    ).resolves.toMatchObject({
      error: { code: 'INVALID_IPC_COMMAND', isExpected: true },
      ok: false
    })
    expect(attachAgentSession).not.toHaveBeenCalled()
  })

  it('creates, renames, lays out, and removes workspace Agents through dedicated channels', async () => {
    const ipcMain = new FakeIpcMain()
    const createWorkspaceAgent = vi.fn(async () => createWorkspaceAgentSnapshot('agent-2'))
    const renameWorkspaceAgent = vi.fn(async () => ({
      ...createWorkspaceAgentSnapshot('agent-2'),
      name: 'Review Agent'
    }))
    const updateWorkspaceAgentLayout = vi.fn(async () => ({
      ...createWorkspaceAgentSnapshot('agent-2'),
      layout: { position: { x: 720, y: 240 }, size: { width: 520, height: 460 } }
    }))
    const removeWorkspaceAgent = vi.fn(async () => [createWorkspaceAgentSnapshot('agent-1')])

    registerAgentIpcHandlers(
      createAgentIpcHandlersInput({
        createWorkspaceAgent,
        ipcMain,
        removeWorkspaceAgent,
        renameWorkspaceAgent,
        updateWorkspaceAgentLayout
      })
    )

    await ipcMain.invoke('cleancode:create-workspace-agent', {
      agentId: 'agent-2',
      gitBranch: null,
      initialPosition: { x: 240, y: 320 },
      projectDirectory: '/work/app',
      projectId: 'project-1',
      providerId: 'claude-code',
      workspaceDirectory: '/work/app',
      workspaceName: 'main'
    })
    await ipcMain.invoke('cleancode:rename-workspace-agent', {
      agentId: 'agent-2',
      name: 'Review Agent',
      projectId: 'project-1',
      workspaceName: 'main'
    })
    await ipcMain.invoke('cleancode:update-workspace-agent-layout', {
      agentId: 'agent-2',
      layout: { position: { x: 720, y: 240 }, size: { width: 520, height: 460 } },
      projectId: 'project-1',
      workspaceName: 'main'
    })
    await ipcMain.invoke('cleancode:remove-workspace-agent', {
      agentId: 'agent-2',
      projectId: 'project-1',
      workspaceName: 'main'
    })

    expect(createWorkspaceAgent).toHaveBeenCalledWith({
      agentId: 'agent-2',
      gitBranch: null,
      initialPosition: { x: 240, y: 320 },
      projectDirectory: '/work/app',
      projectId: 'project-1',
      providerId: 'claude-code',
      workspaceDirectory: '/work/app',
      workspaceName: 'main'
    })
    expect(renameWorkspaceAgent).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'agent-2', name: 'Review Agent' })
    )
    expect(updateWorkspaceAgentLayout).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'agent-2' })
    )
    expect(removeWorkspaceAgent).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'agent-2' })
    )
  })

  it('rejects an Agent creation command without a finite initial position', async () => {
    const ipcMain = new FakeIpcMain()
    const createWorkspaceAgent = vi.fn(async () => createWorkspaceAgentSnapshot('agent-2'))

    registerAgentIpcHandlers(
      createAgentIpcHandlersInput({
        createWorkspaceAgent,
        ipcMain
      })
    )

    await expect(
      ipcMain.invoke('cleancode:create-workspace-agent', {
        agentId: 'agent-2',
        gitBranch: null,
        projectDirectory: '/work/app',
        projectId: 'project-1',
        providerId: 'codex',
        workspaceDirectory: '/work/app',
        workspaceName: 'main'
      })
    ).resolves.toMatchObject({
      error: { code: 'INVALID_IPC_COMMAND', isExpected: true },
      ok: false
    })
    expect(createWorkspaceAgent).not.toHaveBeenCalled()
  })

  it('discovers only currently creatable Agent Providers through a refreshable channel', async () => {
    const ipcMain = new FakeIpcMain()
    const discoverCreatableAgentProviders = vi.fn(async () => [
      {
        availability: {
          providerId: 'claude-code',
          status: 'installed' as const,
          version: '2.1.217'
        },
        descriptor: {
          capabilities: {
            activityTracking: true,
            cleancodeMcp: true,
            launchInstructions: true,
            resume: true,
            sessionIdentityCapture: true,
            sessionRefCodec: true
          },
          displayName: 'Claude Code',
          icon: {
            paths: [{ d: 'M2 2h20v20H2z' }],
            viewBox: '0 0 24 24'
          },
          id: 'claude-code'
        }
      }
    ])

    registerAgentIpcHandlers(
      createAgentIpcHandlersInput({ discoverCreatableAgentProviders, ipcMain })
    )

    await expect(
      ipcMain.invoke('cleancode:discover-creatable-agent-providers', { refresh: true })
    ).resolves.toEqual({
      ok: true,
      value: [
        expect.objectContaining({
          availability: expect.objectContaining({
            providerId: 'claude-code',
            status: 'installed'
          }),
          descriptor: expect.objectContaining({ id: 'claude-code' })
        })
      ]
    })
    expect(discoverCreatableAgentProviders).toHaveBeenCalledWith({ refresh: true })

    await expect(
      ipcMain.invoke('cleancode:discover-creatable-agent-providers', { refresh: 'yes' })
    ).resolves.toMatchObject({
      error: { code: 'INVALID_IPC_COMMAND', isExpected: true },
      ok: false
    })
    expect(discoverCreatableAgentProviders).toHaveBeenCalledOnce()
  })

  it('updates one Agent CleanCode MCP capability through a dedicated typed channel', async () => {
    const ipcMain = new FakeIpcMain()
    const updateWorkspaceAgentMcpCapability = vi.fn(async () => ({
      agent: { ...createWorkspaceAgentSnapshot('agent-2'), cleancodeMcpEnabled: false },
      session: null
    }))

    registerAgentIpcHandlers(
      createAgentIpcHandlersInput({ ipcMain, updateWorkspaceAgentMcpCapability })
    )

    await expect(
      ipcMain.invoke('cleancode:update-workspace-agent-mcp-capability', {
        agentId: 'agent-2',
        cleancodeMcpEnabled: false,
        projectId: 'project-1',
        workspaceName: 'main'
      })
    ).resolves.toMatchObject({
      ok: true,
      value: { agent: { agentId: 'agent-2', cleancodeMcpEnabled: false }, session: null }
    })
    expect(updateWorkspaceAgentMcpCapability).toHaveBeenCalledWith({
      agentId: 'agent-2',
      cleancodeMcpEnabled: false,
      projectId: 'project-1',
      workspaceName: 'main'
    })

    await expect(
      ipcMain.invoke('cleancode:update-workspace-agent-mcp-capability', {
        agentId: 'agent-2',
        cleancodeMcpEnabled: 'disabled',
        projectId: 'project-1',
        workspaceName: 'main'
      })
    ).resolves.toMatchObject({
      error: { code: 'INVALID_IPC_COMMAND', isExpected: true },
      ok: false
    })
    expect(updateWorkspaceAgentMcpCapability).toHaveBeenCalledOnce()
  })

  it('passes Codex terminal input, resize, disposal, and approval commands through channels', async () => {
    const ipcMain = new FakeIpcMain()
    const writeAgentSession = vi.fn()
    const resizeAgentSession = vi.fn()
    const disposeAgentWorkspaceSession = vi.fn()
    const disposeProjectAgentSessions = vi.fn()
    const approveAgentTool = vi.fn(async () => ({ status: 'not_found' as const }))
    const rejectAgentTool = vi.fn()

    registerAgentIpcHandlers(
      createAgentIpcHandlersInput({
        approveAgentTool,
        disposeAgentWorkspaceSession,
        disposeProjectAgentSessions,
        ipcMain,
        rejectAgentTool,
        resizeAgentSession,
        writeAgentSession
      })
    )

    await expect(
      ipcMain.invoke('cleancode:write-agent-session', {
        input: 'run tests\r',
        sessionId: 'agent-session-1'
      })
    ).resolves.toEqual({ ok: true, value: undefined })
    await expect(
      ipcMain.invoke('cleancode:resize-agent-session', {
        columns: 120,
        rows: 36,
        sessionId: 'agent-session-1'
      })
    ).resolves.toEqual({ ok: true, value: undefined })
    await expect(
      ipcMain.invoke('cleancode:dispose-agent-workspace-session', {
        projectDirectory: '/repo/app',
        workspaceName: 'feature'
      })
    ).resolves.toEqual({ ok: true, value: undefined })
    await expect(
      ipcMain.invoke('cleancode:dispose-project-agent-sessions', {
        projectDirectory: '/repo/app'
      })
    ).resolves.toEqual({ ok: true, value: undefined })
    await expect(
      ipcMain.invoke('cleancode:approve-agent-tool', { approvalId: 'approval-1' })
    ).resolves.toEqual({ ok: true, value: { status: 'not_found' } })
    await expect(
      ipcMain.invoke('cleancode:reject-agent-tool', { approvalId: 'approval-1' })
    ).resolves.toEqual({ ok: true, value: undefined })

    expect(writeAgentSession).toHaveBeenCalledWith('agent-session-1', 'run tests\r')
    expect(resizeAgentSession).toHaveBeenCalledWith('agent-session-1', 120, 36)
    expect(disposeAgentWorkspaceSession).toHaveBeenCalledWith({
      projectDirectory: '/repo/app',
      workspaceName: 'feature'
    })
    expect(disposeProjectAgentSessions).toHaveBeenCalledWith('/repo/app')
    expect(approveAgentTool).toHaveBeenCalledWith('approval-1')
    expect(rejectAgentTool).toHaveBeenCalledWith('approval-1')
  })
})

function createAgentIpcHandlersInput(input: {
  readonly approveAgentTool?: AgentIpcHandlersInput['approveAgentTool']
  readonly attachAgentSession?: AgentIpcHandlersInput['attachAgentSession']
  readonly createWorkspaceAgent?: AgentIpcHandlersInput['createWorkspaceAgent']
  readonly discoverCreatableAgentProviders?: AgentIpcHandlersInput['discoverCreatableAgentProviders']
  readonly disposeAgentWorkspaceSession?: AgentIpcHandlersInput['disposeAgentWorkspaceSession']
  readonly disposeProjectAgentSessions?: AgentIpcHandlersInput['disposeProjectAgentSessions']
  readonly inspectAgentProvider?: AgentIpcHandlersInput['inspectAgentProvider']
  readonly getAgentProviderPreferences?: AgentIpcHandlersInput['getAgentProviderPreferences']
  readonly listAgentProviders?: AgentIpcHandlersInput['listAgentProviders']
  readonly ipcMain: IpcMainLike
  readonly rejectAgentTool?: AgentIpcHandlersInput['rejectAgentTool']
  readonly removeWorkspaceAgent?: AgentIpcHandlersInput['removeWorkspaceAgent']
  readonly renameWorkspaceAgent?: AgentIpcHandlersInput['renameWorkspaceAgent']
  readonly resizeAgentSession?: AgentIpcHandlersInput['resizeAgentSession']
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
        runtime: createRuntime(command.agentId, command.projectId, command.workspaceName, 1),
        sessionId: 'agent-session-1',
        terminalSourceTheme: command.terminalSourceTheme,
        workspaceDirectory: command.workspaceDirectory,
        workspaceName: command.workspaceName
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
    removeWorkspaceAgent:
      input.removeWorkspaceAgent ?? (async () => [createWorkspaceAgentSnapshot('agent-1')]),
    renameWorkspaceAgent:
      input.renameWorkspaceAgent ?? (async () => createWorkspaceAgentSnapshot('agent-1')),
    resizeAgentSession: input.resizeAgentSession ?? (() => undefined),
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

function createAgentProviderPreferences() {
  return {
    defaultCleancodeMcpEnabled: true,
    defaultProviderId: null,
    disabledProviderIds: [],
    permissionMode: 'yolo' as const,
    providerOverrides: {},
    version: 1 as const
  }
}

function createWorkspaceAgentSnapshot(agentId: string) {
  return {
    agentId,
    cleancodeMcpEnabled: true,
    layout: { position: { x: 540, y: 120 }, size: { width: 440, height: 520 } },
    name: agentId === 'agent-1' ? 'Agent 1' : 'Agent 2',
    projectId: 'project-1',
    providerId: 'codex',
    workspaceName: 'main'
  }
}

function createRuntime(
  agentId: string,
  projectId: string,
  workspaceName: string,
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
        workspaceName
      }
    }
  }
}

function createSender(): {
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
