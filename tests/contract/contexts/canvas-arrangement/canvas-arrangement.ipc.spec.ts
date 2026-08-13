import { registerCanvasArrangementIpcHandlers } from '../../../../src/platform/electron-main/canvasArrangementIpcHandlers'
import type { IpcMainLike } from '../../../../src/platform/ipc/registerIpcHandler'
import type { Logger } from '../../../../src/platform/logging/Logger'

describe('canvas arrangement IPC contract', () => {
  it('creates, moves, and removes a validated mixed canvas stack', async () => {
    const ipcMain = new FakeIpcMain()
    const createStack = vi.fn(async () => snapshot('stack-1'))
    const moveStack = vi.fn(async () => snapshot('stack-1', { x: 300, y: 240 }))
    const removeStack = vi.fn(async () => snapshot())
    registerCanvasArrangementIpcHandlers({
      createStack,
      ipcMain,
      logger: silentLogger,
      moveStack,
      removeStack
    })
    await expect(ipcMain.invoke('cleancode:set-canvas-stack-presentation', {})).rejects.toThrow(
      'Missing handler: cleancode:set-canvas-stack-presentation'
    )

    const command = {
      anchor: { x: 100, y: 80 },
      items: [
        { kind: 'terminal', terminalId: 'terminal-1' },
        { kind: 'workflow', terminalIds: ['terminal-2', 'terminal-3'] },
        { kind: 'combination', terminalGroupId: 'group-1' },
        { kind: 'agent', agentId: 'agent-1' }
      ],
      projectDirectory: '/project',
      projectId: 'project-1',
      stackId: 'stack-1',
      workspaceId: 'main'
    }

    await expect(ipcMain.invoke('cleancode:create-canvas-stack', command)).resolves.toEqual({
      ok: true,
      value: snapshot('stack-1')
    })
    expect(createStack).toHaveBeenCalledWith(command)

    const moveCommand = {
      anchor: { x: 300, y: 240 },
      projectDirectory: '/project',
      projectId: 'project-1',
      stackId: 'stack-1',
      workspaceId: 'main'
    }
    await expect(ipcMain.invoke('cleancode:move-canvas-stack', moveCommand)).resolves.toMatchObject(
      { ok: true, value: { stacks: [{ anchor: moveCommand.anchor }] } }
    )
    expect(moveStack).toHaveBeenCalledWith(moveCommand)

    await expect(
      ipcMain.invoke('cleancode:remove-canvas-stack', {
        projectDirectory: '/project',
        projectId: 'project-1',
        stackId: 'stack-1',
        workspaceId: 'main'
      })
    ).resolves.toEqual({ ok: true, value: snapshot() })
  })

  it('rejects unknown fields, malformed geometry, and invalid item shapes', async () => {
    const ipcMain = new FakeIpcMain()
    const createStack = vi.fn(async () => snapshot())
    registerCanvasArrangementIpcHandlers({
      createStack,
      ipcMain,
      logger: silentLogger,
      moveStack: vi.fn(async () => snapshot()),
      removeStack: vi.fn(async () => snapshot())
    })

    for (const command of [
      {
        anchor: { x: Number.NaN, y: 80 },
        items: [
          { kind: 'terminal', terminalId: 'terminal-1' },
          { kind: 'agent', agentId: 'agent-1' }
        ],
        projectDirectory: '/project',
        projectId: 'project-1',
        stackId: 'stack-1',
        workspaceId: 'main'
      },
      {
        anchor: { x: 100, y: 80 },
        items: [
          { kind: 'workflow', terminalIds: ['terminal-1'] },
          { kind: 'agent', agentId: 'agent-1' }
        ],
        projectDirectory: '/project',
        projectId: 'project-1',
        stackId: 'stack-1',
        workspaceId: 'main'
      },
      {
        anchor: { x: 100, y: 80 },
        items: [
          { kind: 'terminal', terminalId: 'terminal-1' },
          { kind: 'agent', agentId: 'agent-1', extra: true }
        ],
        projectDirectory: '/project',
        projectId: 'project-1',
        stackId: 'stack-1',
        workspaceId: 'main'
      },
      {
        anchor: { x: 100, y: 80 },
        items: [
          { kind: 'terminal', terminalId: 'terminal-1' },
          { kind: 'agent', agentId: 'agent-1' }
        ],
        projectDirectory: '/project',
        projectId: 'project-1',
        presentation: 'stacked',
        stackId: 'stack-1',
        workspaceId: 'main'
      }
    ]) {
      await expect(ipcMain.invoke('cleancode:create-canvas-stack', command)).resolves.toMatchObject(
        {
          error: { code: 'INVALID_IPC_COMMAND', isExpected: true },
          ok: false
        }
      )
    }
    expect(createStack).not.toHaveBeenCalled()
  })
})

function snapshot(stackId?: string, anchor = { x: 100, y: 80 }) {
  return {
    projectId: 'project-1',
    workspaceId: 'main',
    stacks: stackId
      ? [
          {
            id: stackId,
            anchor,
            items: [
              { kind: 'terminal' as const, terminalId: 'terminal-1' },
              { kind: 'agent' as const, agentId: 'agent-1' }
            ]
          }
        ]
      : []
  }
}

class FakeIpcMain implements IpcMainLike {
  private handlers = new Map<string, (event: unknown, command?: unknown) => unknown>()

  handle(channel: string, listener: (event: unknown, command?: unknown) => unknown): void {
    this.handlers.set(channel, listener)
  }

  async invoke(channel: string, command?: unknown): Promise<unknown> {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`Missing handler: ${channel}`)
    return handler({}, command)
  }
}

const silentLogger: Logger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn()
}
