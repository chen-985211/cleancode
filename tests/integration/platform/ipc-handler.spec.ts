import {
  createExpectedAppError,
  type SerializedAppError
} from '../../../src/shared-kernel/application/errors/AppError'
import type { LogEvent, Logger } from '../../../src/platform/logging/Logger'
import {
  registerIpcHandler,
  type IpcInvokeResult
} from '../../../src/platform/ipc/registerIpcHandler'

class FakeIpcMain {
  readonly handlers = new Map<string, (event: unknown, command: unknown) => Promise<unknown>>()

  handle(channel: string, handler: (event: unknown, command: unknown) => Promise<unknown>): void {
    this.handlers.set(channel, handler)
  }

  invoke<TResult>(channel: string, command?: unknown): Promise<IpcInvokeResult<TResult>> {
    const handler = this.handlers.get(channel)

    if (!handler) {
      throw new Error(`No handler registered for ${channel}`)
    }

    return handler({}, command) as Promise<IpcInvokeResult<TResult>>
  }
}

class RecordingLogger implements Logger {
  readonly events: LogEvent[] = []

  debug(event: Omit<LogEvent, 'level' | 'timestamp'>): void {
    this.record('debug', event)
  }

  info(event: Omit<LogEvent, 'level' | 'timestamp'>): void {
    this.record('info', event)
  }

  warn(event: Omit<LogEvent, 'level' | 'timestamp'>): void {
    this.record('warn', event)
  }

  error(event: Omit<LogEvent, 'level' | 'timestamp'>): void {
    this.record('error', event)
  }

  private record(level: LogEvent['level'], event: Omit<LogEvent, 'level' | 'timestamp'>): void {
    this.events.push({ ...event, level, timestamp: '2026-07-06T00:00:00.000Z' })
  }
}

describe('IPC handler logging and errors', () => {
  it('returns expected application errors without throwing through Electron IPC', async () => {
    const ipcMain = new FakeIpcMain()
    const logger = new RecordingLogger()

    registerIpcHandler({
      channel: 'cleancode:create-branch-workspace',
      handler: async () => {
        throw createExpectedAppError('GIT_BRANCH_ALREADY_EXISTS', 'Git branch already exists.')
      },
      ipcMain,
      logger,
      operation: 'createBranchWorkspace',
      scope: 'project.git'
    })

    const result = await ipcMain.invoke<never>('cleancode:create-branch-workspace', {
      branchName: 'main'
    })

    expect(result.ok).toBe(false)
    expect((result as { readonly error: SerializedAppError }).error).toMatchObject({
      code: 'GIT_BRANCH_ALREADY_EXISTS',
      isExpected: true,
      message: 'Git branch already exists.'
    })
    expect(logger.events).toEqual([
      expect.objectContaining({
        error: expect.objectContaining({ code: 'GIT_BRANCH_ALREADY_EXISTS' }),
        level: 'warn',
        operation: 'createBranchWorkspace',
        outcome: 'failure',
        scope: 'project.git'
      })
    ])
  })

  it('logs unexpected errors and returns a generic error code', async () => {
    const ipcMain = new FakeIpcMain()
    const logger = new RecordingLogger()

    registerIpcHandler({
      channel: 'cleancode:delete-block',
      handler: async () => {
        throw new Error('database unavailable')
      },
      ipcMain,
      logger,
      operation: 'deleteBlock',
      scope: 'block-graph'
    })

    const result = await ipcMain.invoke<never>('cleancode:delete-block', {})

    expect(result.ok).toBe(false)
    expect((result as { readonly error: SerializedAppError }).error).toMatchObject({
      code: 'UNEXPECTED_ERROR',
      isExpected: false,
      message: 'Unexpected application error.'
    })
    expect(logger.events).toEqual([
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'UNEXPECTED_ERROR',
          message: 'database unavailable'
        }),
        level: 'error',
        operation: 'deleteBlock',
        outcome: 'failure',
        scope: 'block-graph'
      })
    ])
  })

  it('does not log successful IPC operations by default', async () => {
    const ipcMain = new FakeIpcMain()
    const logger = new RecordingLogger()

    registerIpcHandler({
      channel: 'cleancode:list-workbenches',
      handler: async () => ['workbench-1'],
      ipcMain,
      logger,
      operation: 'listWorkbenches',
      scope: 'platform.ipc'
    })

    await expect(ipcMain.invoke<readonly string[]>('cleancode:list-workbenches')).resolves.toEqual({
      ok: true,
      value: ['workbench-1']
    })
    expect(logger.events).toEqual([])
  })

  it('records explicitly logged successful IPC operations with a duration', async () => {
    const ipcMain = new FakeIpcMain()
    const logger = new RecordingLogger()

    registerIpcHandler({
      channel: 'cleancode:create-branch-workspace',
      handler: async () => ({ name: 'feature/demo' }),
      ipcMain,
      logger,
      operation: 'createBranchWorkspace',
      scope: 'project.git',
      successLogLevel: 'info'
    })

    await expect(
      ipcMain.invoke<{ readonly name: string }>('cleancode:create-branch-workspace')
    ).resolves.toEqual({
      ok: true,
      value: { name: 'feature/demo' }
    })
    expect(logger.events).toEqual([
      expect.objectContaining({
        durationMs: expect.any(Number),
        level: 'info',
        operation: 'createBranchWorkspace',
        outcome: 'success',
        scope: 'project.git'
      })
    ])
  })
})
