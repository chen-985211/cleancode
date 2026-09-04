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

import type {
  ApplicationDiagnosticsExportCommand,
  ApplicationDiagnosticsExportResult,
  ApplicationDiagnosticsSummary
} from '../../../src/platform/ipc/applicationDiagnosticsChannels'
import '../../../src/platform/electron-preload/preload'

interface ApplicationDiagnosticsBridge {
  exportApplicationDiagnostics(
    command: ApplicationDiagnosticsExportCommand
  ): Promise<ApplicationDiagnosticsExportResult>
  getApplicationDiagnosticsSummary(): Promise<ApplicationDiagnosticsSummary>
}

const api = electronMocks.exposeInMainWorld.mock.calls[0]?.[1] as ApplicationDiagnosticsBridge

describe('application diagnostics preload contract', () => {
  beforeEach(() => {
    electronMocks.invoke.mockReset()
  })

  it('forwards summary and export calls through dedicated channels', async () => {
    const summary = { schemaVersion: 1 }
    const command = { buttonLabel: '导出', dialogTitle: '导出诊断信息' }
    electronMocks.invoke.mockResolvedValueOnce({ ok: true, value: summary }).mockResolvedValueOnce({
      ok: true,
      value: { fileName: 'cleancode-diagnostics.json', status: 'saved' }
    })

    await expect(api.getApplicationDiagnosticsSummary()).resolves.toBe(summary)
    await expect(api.exportApplicationDiagnostics(command)).resolves.toEqual({
      fileName: 'cleancode-diagnostics.json',
      status: 'saved'
    })
    expect(electronMocks.invoke.mock.calls).toEqual([
      ['cleancode:get-application-diagnostics-summary', undefined],
      ['cleancode:export-application-diagnostics', command]
    ])
  })
})
