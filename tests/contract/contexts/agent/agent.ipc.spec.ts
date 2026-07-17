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
  it('returns Codex CLI installation status through the preload-facing channel', async () => {
    const ipcMain = new FakeIpcMain()

    registerAgentIpcHandlers(
      createAgentIpcHandlersInput({
        inspectCodexCli: async () => ({
          installCommand: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
          status: 'installed',
          version: 'codex-cli 0.143.0'
        }),
        ipcMain
      })
    )

    await expect(ipcMain.invoke('cleancode:inspect-codex-cli')).resolves.toEqual({
      ok: true,
      value: {
        installCommand: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
        status: 'installed',
        version: 'codex-cli 0.143.0'
      }
    })
  })

  it('attaches the renderer to a workspace Codex PTY session and streams session events to it', async () => {
    const ipcMain = new FakeIpcMain()
    const sender = createSender()
    const attachAgentSession = vi.fn<AgentIpcHandlersInput['attachAgentSession']>(
      async (command) => {
        command.onOutput({
          agentId: command.agentId,
          data: 'Codex ready\r\n',
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
          codexThreadId: null,
          gitBranch: command.gitBranch ?? null,
          processId: 42,
          projectDirectory: command.projectDirectory,
          projectId: command.projectId,
          sessionId: 'agent-session-1',
          status: 'running',
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
        codexThreadId: null,
        gitBranch: 'feature/login',
        processId: 42,
        projectDirectory: '/repo/app',
        projectId: 'project-1',
        sessionId: 'agent-session-1',
        status: 'running',
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
    expect(sender.send).toHaveBeenCalledWith('cleancode:agent-pty-output', {
      agentId: 'agent-2',
      data: 'Codex ready\r\n',
      sessionId: 'agent-session-1'
    })
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
      layout: { position: { x: 620, y: 160 }, size: { width: 440, height: 520 } },
      projectId: 'project-1',
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

    expect(createWorkspaceAgent).toHaveBeenCalledOnce()
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
  readonly disposeAgentWorkspaceSession?: AgentIpcHandlersInput['disposeAgentWorkspaceSession']
  readonly disposeProjectAgentSessions?: AgentIpcHandlersInput['disposeProjectAgentSessions']
  readonly inspectCodexCli?: AgentIpcHandlersInput['inspectCodexCli']
  readonly ipcMain: IpcMainLike
  readonly rejectAgentTool?: AgentIpcHandlersInput['rejectAgentTool']
  readonly removeWorkspaceAgent?: AgentIpcHandlersInput['removeWorkspaceAgent']
  readonly renameWorkspaceAgent?: AgentIpcHandlersInput['renameWorkspaceAgent']
  readonly resizeAgentSession?: AgentIpcHandlersInput['resizeAgentSession']
  readonly writeAgentSession?: AgentIpcHandlersInput['writeAgentSession']
  readonly updateWorkspaceAgentLayout?: AgentIpcHandlersInput['updateWorkspaceAgentLayout']
  readonly updateWorkspaceAgentMcpCapability?: AgentIpcHandlersInput['updateWorkspaceAgentMcpCapability']
}): AgentIpcHandlersInput {
  return {
    approveAgentTool: input.approveAgentTool ?? (async () => ({ status: 'not_found' })),
    attachAgentSession:
      input.attachAgentSession ??
      (async (command) => ({
        agentId: command.agentId,
        codexThreadId: null,
        gitBranch: command.gitBranch ?? null,
        processId: 1,
        projectDirectory: command.projectDirectory,
        projectId: command.projectId,
        sessionId: 'agent-session-1',
        status: 'running' as const,
        terminalSourceTheme: command.terminalSourceTheme,
        workspaceDirectory: command.workspaceDirectory,
        workspaceName: command.workspaceName
      })),
    createWorkspaceAgent:
      input.createWorkspaceAgent ?? (async () => createWorkspaceAgentSnapshot('agent-2')),
    disposeAgentWorkspaceSession: input.disposeAgentWorkspaceSession ?? (async () => undefined),
    disposeProjectAgentSessions: input.disposeProjectAgentSessions ?? (async () => undefined),
    inspectCodexCli:
      input.inspectCodexCli ??
      (async () => ({
        installCommand: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
        status: 'missing' as const,
        version: null
      })),
    ipcMain: input.ipcMain,
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
      (async () => ({ agent: createWorkspaceAgentSnapshot('agent-1'), session: null }))
  }
}

function createWorkspaceAgentSnapshot(agentId: string) {
  return {
    agentId,
    cleancodeMcpEnabled: true,
    layout: { position: { x: 540, y: 120 }, size: { width: 440, height: 520 } },
    name: agentId === 'agent-1' ? 'Agent 1' : 'Agent 2',
    projectId: 'project-1',
    workspaceName: 'main'
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
