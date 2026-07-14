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
      projectDirectory: '/project',
      workspaceName: 'main',
      workingDirectory: '/project',
      scope: { type: 'full' as const }
    }

    await expect(
      ipcMain.invoke<WorkflowRunSnapshot>('cleancode:start-terminal-workflow', command)
    ).resolves.toEqual({ ok: true, value: createRun() })
    expect(start).toHaveBeenCalledWith(command)
  })

  it('passes workspace-scoped stop commands', async () => {
    const ipcMain = new FakeIpcMain()
    const stop = vi.fn(async () => createRun())
    registerTerminalWorkflowIpcHandlers({
      ipcMain,
      logger: silentLogger,
      workflowService: { start: vi.fn(), stop, getActiveRun: vi.fn() }
    })

    await ipcMain.invoke('cleancode:stop-terminal-workflow', { workspaceName: 'main' })

    expect(stop).toHaveBeenCalledWith('main')
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
    workspaceName: 'main',
    status: 'running',
    nodes: []
  }
}
