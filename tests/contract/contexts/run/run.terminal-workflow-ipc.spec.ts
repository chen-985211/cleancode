import type { WorkflowRunSnapshot } from '../../../../src/contexts/run/application/dto/WorkflowRunSnapshot'
import { registerTerminalWorkflowIpcHandlers } from '../../../../src/platform/electron-main/terminalWorkflowIpcHandlers'
import type { IpcInvokeResult, IpcMainLike } from '../../../../src/platform/ipc/registerIpcHandler'
import type { Logger } from '../../../../src/platform/logging/Logger'

describe('terminal workflow IPC contract', () => {
  it('passes full workflow start commands and returns the run snapshot', async () => {
    const ipcMain = new FakeIpcMain()
    const start = vi.fn(async () => createRun())
    registerTerminalWorkflowIpcHandlers({
      ipcMain,
      logger: silentLogger,
      workflowService: { start, stop: vi.fn(), getActiveRun: vi.fn() }
    })
    const command = {
      projectId: 'project-1',
      projectDirectory: '/project',
      workspaceId: 'main',
      workspaceDirectory: '/project',
      gitBranch: 'main',
      terminalSourceTheme: 'dark' as const,
      scope: { type: 'full' as const }
    }

    await expect(
      ipcMain.invoke<WorkflowRunSnapshot>('cleancode:start-terminal-workflow', command)
    ).resolves.toEqual({ ok: true, value: createRun() })
    expect(start).toHaveBeenCalledWith({ ...command, workingDirectory: command.workspaceDirectory })
  })

  it('rejects malformed workflow identities before invoking the service', async () => {
    const ipcMain = new FakeIpcMain()
    const start = vi.fn(async () => createRun())
    registerTerminalWorkflowIpcHandlers({
      ipcMain,
      logger: silentLogger,
      workflowService: { start, stop: vi.fn(), getActiveRun: vi.fn() }
    })

    await expect(
      ipcMain.invoke('cleancode:start-terminal-workflow', {
        projectDirectory: '/project',
        workspaceId: 'main',
        workspaceDirectory: '/project',
        gitBranch: 'main',
        scope: { type: 'full' }
      })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_IPC_COMMAND', isExpected: true }
    })
    expect(start).not.toHaveBeenCalled()
  })

  it('rejects an invalid workflow terminal source theme', async () => {
    const ipcMain = new FakeIpcMain()
    const start = vi.fn(async () => createRun())
    registerTerminalWorkflowIpcHandlers({
      ipcMain,
      logger: silentLogger,
      workflowService: { start, stop: vi.fn(), getActiveRun: vi.fn() }
    })

    await expect(
      ipcMain.invoke('cleancode:start-terminal-workflow', {
        projectId: 'project-1',
        projectDirectory: '/project',
        workspaceId: 'main',
        workspaceDirectory: '/project',
        gitBranch: 'main',
        terminalSourceTheme: 'sepia',
        scope: { type: 'full' }
      })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_IPC_COMMAND', isExpected: true }
    })
    expect(start).not.toHaveBeenCalled()
  })

  it('passes terminal combination workflow scopes', async () => {
    const ipcMain = new FakeIpcMain()
    const start = vi.fn(async () => createRun())
    registerTerminalWorkflowIpcHandlers({
      ipcMain,
      logger: silentLogger,
      workflowService: { start, stop: vi.fn(), getActiveRun: vi.fn() }
    })
    const command = {
      projectId: 'project-1',
      projectDirectory: '/project',
      workspaceId: 'main',
      workspaceDirectory: '/project',
      gitBranch: 'main',
      terminalSourceTheme: 'dark' as const,
      scope: {
        type: 'terminal-group' as const,
        terminalGroupId: 'development'
      }
    }

    await ipcMain.invoke('cleancode:start-terminal-workflow', command)

    expect(start).toHaveBeenCalledWith({
      ...command,
      workingDirectory: command.workspaceDirectory
    })
  })

  it('rejects terminal combination scopes without an identity', async () => {
    const ipcMain = new FakeIpcMain()
    const start = vi.fn(async () => createRun())
    registerTerminalWorkflowIpcHandlers({
      ipcMain,
      logger: silentLogger,
      workflowService: { start, stop: vi.fn(), getActiveRun: vi.fn() }
    })

    await expect(
      ipcMain.invoke('cleancode:start-terminal-workflow', {
        projectId: 'project-1',
        projectDirectory: '/project',
        workspaceId: 'main',
        workspaceDirectory: '/project',
        gitBranch: 'main',
        terminalSourceTheme: 'dark',
        scope: { type: 'terminal-group', terminalGroupId: '  ' }
      })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_IPC_COMMAND', isExpected: true }
    })
    expect(start).not.toHaveBeenCalled()
  })

  it('passes exact block-set workflow scopes and rejects empty sets', async () => {
    const ipcMain = new FakeIpcMain()
    const start = vi.fn(async () => createRun())
    registerTerminalWorkflowIpcHandlers({
      ipcMain,
      logger: silentLogger,
      workflowService: { start, stop: vi.fn(), getActiveRun: vi.fn() }
    })
    const command = {
      projectId: 'project-1',
      projectDirectory: '/project',
      workspaceId: 'main',
      workspaceDirectory: '/project',
      gitBranch: 'main',
      terminalSourceTheme: 'dark' as const,
      scope: { blockIds: ['install', 'build'], type: 'block-set' as const }
    }

    await ipcMain.invoke('cleancode:start-terminal-workflow', command)
    await expect(
      ipcMain.invoke('cleancode:start-terminal-workflow', {
        ...command,
        scope: { blockIds: [], type: 'block-set' }
      })
    ).resolves.toMatchObject({
      error: { code: 'INVALID_IPC_COMMAND' },
      ok: false
    })

    expect(start).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledWith({
      ...command,
      workingDirectory: command.workspaceDirectory
    })
  })

  it('passes project-workspace-scoped stop commands', async () => {
    const ipcMain = new FakeIpcMain()
    const stop = vi.fn(async () => createRun())
    registerTerminalWorkflowIpcHandlers({
      ipcMain,
      logger: silentLogger,
      workflowService: { start: vi.fn(), stop, getActiveRun: vi.fn() }
    })

    const command = { projectDirectory: '/project', workspaceId: 'main' }
    await ipcMain.invoke('cleancode:stop-terminal-workflow', command)

    expect(stop).toHaveBeenCalledWith(command)
  })

  it('passes project-workspace-scoped workflow queries', async () => {
    const ipcMain = new FakeIpcMain()
    const getActiveRun = vi.fn(() => createRun())
    registerTerminalWorkflowIpcHandlers({
      ipcMain,
      logger: silentLogger,
      workflowService: { start: vi.fn(), stop: vi.fn(), getActiveRun }
    })
    const command = { projectDirectory: '/project', workspaceId: 'main' }

    await ipcMain.invoke('cleancode:get-terminal-workflow', command)

    expect(getActiveRun).toHaveBeenCalledWith(command)
  })
})

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

  invoke<TResult>(channel: string, command: unknown): Promise<IpcInvokeResult<TResult>> {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`No handler registered for ${channel}`)
    return handler({}, command) as Promise<IpcInvokeResult<TResult>>
  }
}

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
}

function createRun(): WorkflowRunSnapshot {
  return {
    id: 'run-1',
    graphId: 'graph-1',
    projectId: 'project-1',
    projectDirectory: '/project',
    workspaceId: 'main',
    workspaceDirectory: '/project',
    gitBranch: 'main',
    status: 'running',
    nodes: []
  }
}
