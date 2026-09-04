import type { Logger } from '../../../src/platform/logging/Logger'
import type { IpcInvokeResult } from '../../../src/platform/ipc/registerIpcHandler'
import { applicationDiagnosticsChannels } from '../../../src/platform/ipc/applicationDiagnosticsChannels'
import type { ApplicationDiagnosticsSnapshot } from '../../../src/platform/electron-main/applicationDiagnostics'
import { registerApplicationDiagnosticsIpc } from '../../../src/platform/electron-main/applicationDiagnosticsIpc'

class FakeIpcMain {
  readonly handlers = new Map<
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
    event: unknown,
    command?: unknown
  ): Promise<IpcInvokeResult<TResult>> {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`No handler registered for ${channel}`)
    return handler(event, command) as Promise<IpcInvokeResult<TResult>>
  }
}

const silentLogger: Logger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn()
}

describe('application diagnostics IPC contract', () => {
  it('returns a bounded summary without exposing diagnostic messages', async () => {
    const fixture = createFixture()

    await expect(
      fixture.ipcMain.invoke(applicationDiagnosticsChannels.getSummary, 'renderer')
    ).resolves.toEqual({
      ok: true,
      value: {
        application: diagnosticSnapshot.application,
        collection: diagnosticSnapshot.collection,
        generatedAt: diagnosticSnapshot.generatedAt,
        recentFailures: [
          {
            correlationId: 'openWorkspace-1',
            errorCode: 'UNEXPECTED_ERROR',
            level: 'error',
            operation: 'openWorkspace',
            scope: 'project.git',
            source: 'main',
            timestamp: '2026-09-05T11:59:00.000Z'
          }
        ],
        runtime: diagnosticSnapshot.runtime,
        schemaVersion: 1
      }
    })
    expect(fixture.collect).toHaveBeenCalledWith('2026-09-05T12:00:00.000Z')
  })

  it('uses a native save dialog and writes only after the user chooses a file', async () => {
    const fixture = createFixture()
    fixture.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: '/downloads/cleancode-diagnostics.json'
    })
    const command = { buttonLabel: '导出', dialogTitle: '导出诊断信息' }

    await expect(
      fixture.ipcMain.invoke(applicationDiagnosticsChannels.export, 'renderer', command)
    ).resolves.toEqual({
      ok: true,
      value: { fileName: 'cleancode-diagnostics.json', status: 'saved' }
    })
    expect(fixture.showSaveDialog).toHaveBeenCalledWith('window', {
      buttonLabel: '导出',
      defaultPath: '/downloads/cleancode-diagnostics-20260905-120000.json',
      filters: [{ extensions: ['json'], name: 'JSON' }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
      title: '导出诊断信息'
    })
    expect(fixture.collect).toHaveBeenCalledWith('2026-09-05T12:00:00.000Z')
    expect(fixture.write).toHaveBeenCalledWith(
      '/downloads/cleancode-diagnostics.json',
      diagnosticSnapshot
    )
  })

  it('treats cancellation as a completed no-op without collecting or writing logs', async () => {
    const fixture = createFixture()
    fixture.showSaveDialog.mockResolvedValue({ canceled: true })

    await expect(
      fixture.ipcMain.invoke(applicationDiagnosticsChannels.export, 'renderer', {
        buttonLabel: '导出',
        dialogTitle: '导出诊断信息'
      })
    ).resolves.toEqual({ ok: true, value: { status: 'cancelled' } })
    expect(fixture.collect).not.toHaveBeenCalled()
    expect(fixture.write).not.toHaveBeenCalled()
  })

  it('rejects malformed export copy and an unknown renderer target', async () => {
    const fixture = createFixture()

    await expect(
      fixture.ipcMain.invoke(applicationDiagnosticsChannels.export, 'renderer', {
        buttonLabel: ''
      })
    ).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_IPC_COMMAND' } })
    await expect(
      fixture.ipcMain.invoke(applicationDiagnosticsChannels.export, 'other-renderer', {
        buttonLabel: '导出',
        dialogTitle: '导出诊断信息'
      })
    ).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_IPC_COMMAND' } })
    expect(fixture.showSaveDialog).not.toHaveBeenCalled()
    expect(fixture.write).not.toHaveBeenCalled()
  })
})

function createFixture() {
  const ipcMain = new FakeIpcMain()
  const collect = vi.fn(async () => diagnosticSnapshot)
  const showSaveDialog = vi.fn()
  const write = vi.fn(async () => undefined)
  registerApplicationDiagnosticsIpc({
    collect,
    defaultDirectory: '/downloads',
    ipcMain,
    logger: silentLogger,
    now: () => new Date('2026-09-05T12:00:00.000Z'),
    resolveTarget: (event) => (event === 'renderer' ? 'window' : null),
    showSaveDialog,
    write
  })
  return { collect, ipcMain, showSaveDialog, write }
}

const diagnosticSnapshot: ApplicationDiagnosticsSnapshot = {
  application: { isPackaged: true, name: 'CleanCode', version: '0.1.15' },
  collection: {
    includedRecordCount: 2,
    maximumBytes: 5 * 1024 * 1024,
    skippedLineCount: 0,
    truncated: false,
    windowEndedAt: '2026-09-05T12:00:00.000Z',
    windowMinutes: 30,
    windowStartedAt: '2026-09-05T11:30:00.000Z'
  },
  generatedAt: '2026-09-05T12:00:00.000Z',
  logs: [
    {
      event: 'provider-ready',
      source: 'terminal-provider',
      timestamp: '2026-09-05T11:58:00.000Z'
    },
    {
      correlationId: 'openWorkspace-1',
      error: {
        code: 'UNEXPECTED_ERROR',
        isExpected: false,
        message: 'Private diagnostic message'
      },
      level: 'error',
      operation: 'openWorkspace',
      scope: 'project.git',
      source: 'main',
      timestamp: '2026-09-05T11:59:00.000Z'
    }
  ],
  runtime: {
    architecture: 'arm64',
    chromiumVersion: '152.0.0',
    electronVersion: '43.0.0',
    nodeVersion: '24.0.0',
    osRelease: '25.0.0',
    platform: 'darwin'
  },
  schemaVersion: 1
}
