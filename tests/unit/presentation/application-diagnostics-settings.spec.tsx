import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { ApplicationDiagnosticsPane } from '../../../src/presentation/app-shell/app-features/settings/ApplicationDiagnosticsPane'
import type { ApplicationDiagnosticsSummary } from '../../../src/platform/ipc/applicationDiagnosticsChannels'

describe('application diagnostics settings', () => {
  const originalRuntime = window.cleancode
  const originalClipboard = window.navigator.clipboard

  afterEach(() => {
    Object.defineProperty(window, 'cleancode', { configurable: true, value: originalRuntime })
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard
    })
  })

  it('copies a localized concise summary and keeps both actions single-flight', async () => {
    let resolveSummary: ((summary: ApplicationDiagnosticsSummary) => void) | undefined
    const getSummary = vi.fn(
      () =>
        new Promise<ApplicationDiagnosticsSummary>((resolve) => {
          resolveSummary = resolve
        })
    )
    const writeText = vi.fn().mockResolvedValue(undefined)
    installRuntime({ getApplicationDiagnosticsSummary: getSummary })
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    })

    render(<ApplicationDiagnosticsPane />)

    fireEvent.click(screen.getByRole('button', { name: '复制诊断摘要' }))
    expect(screen.getByRole('button', { name: '正在复制…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '导出诊断文件' })).toBeDisabled()

    await act(async () => resolveSummary?.(summaryFixture))

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce())
    expect(writeText.mock.calls[0]?.[0]).toContain('## 问题反馈诊断摘要')
    expect(writeText.mock.calls[0]?.[0]).toContain('最近 30 分钟 · 2 条记录')
    expect(writeText.mock.calls[0]?.[0]).toContain('platform.test · operation.run · TEST_FAILED')
    expect(screen.getByRole('status')).toHaveTextContent('诊断摘要已复制。')
  })

  it('uses localized native-dialog labels and reports a saved file without revealing its path', async () => {
    const exportDiagnostics = vi.fn().mockResolvedValue({
      fileName: 'cleancode-diagnostics-20260905-120000.json',
      status: 'saved'
    })
    installRuntime({ exportApplicationDiagnostics: exportDiagnostics })

    render(<ApplicationDiagnosticsPane />)
    fireEvent.click(screen.getByRole('button', { name: '导出诊断文件' }))

    await waitFor(() =>
      expect(exportDiagnostics).toHaveBeenCalledWith({
        buttonLabel: '导出',
        dialogTitle: '导出诊断信息'
      })
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      '已导出 cleancode-diagnostics-20260905-120000.json。'
    )
    expect(screen.getByRole('status')).not.toHaveTextContent('/')
  })

  it('presents a recoverable inline error when an operation fails', async () => {
    installRuntime({
      getApplicationDiagnosticsSummary: vi.fn().mockRejectedValue(new Error('clipboard sentinel'))
    })

    render(<ApplicationDiagnosticsPane />)
    fireEvent.click(screen.getByRole('button', { name: '复制诊断摘要' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('未能复制诊断摘要，请重试。')
    expect(screen.getByRole('button', { name: '复制诊断摘要' })).toBeEnabled()
  })

  it('disables desktop-only actions when the preload bridge is unavailable', () => {
    Object.defineProperty(window, 'cleancode', { configurable: true, value: undefined })

    render(<ApplicationDiagnosticsPane />)

    expect(screen.getByRole('button', { name: '复制诊断摘要' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '导出诊断文件' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('诊断导出仅在桌面应用中可用。')
  })
})

function installRuntime(overrides: Partial<NonNullable<Window['cleancode']>>): void {
  Object.defineProperty(window, 'cleancode', {
    configurable: true,
    value: {
      appName: 'cleancode',
      exportApplicationDiagnostics: vi.fn().mockResolvedValue({ status: 'cancelled' }),
      getApplicationDiagnosticsSummary: vi.fn().mockResolvedValue(summaryFixture),
      ...overrides
    } as unknown as Window['cleancode']
  })
}

const summaryFixture: ApplicationDiagnosticsSummary = {
  schemaVersion: 1,
  generatedAt: '2026-09-05T12:00:00.000Z',
  application: { isPackaged: true, name: 'cleancode', version: '0.1.15' },
  runtime: {
    architecture: 'arm64',
    chromiumVersion: '140.0.0',
    electronVersion: '38.0.0',
    nodeVersion: '22.0.0',
    osRelease: '25.0.0',
    platform: 'darwin'
  },
  collection: {
    includedRecordCount: 2,
    maximumBytes: 5 * 1024 * 1024,
    skippedLineCount: 1,
    truncated: false,
    windowEndedAt: '2026-09-05T12:00:00.000Z',
    windowMinutes: 30,
    windowStartedAt: '2026-09-05T11:30:00.000Z'
  },
  recentFailures: [
    {
      correlationId: 'correlation-1',
      errorCode: 'TEST_FAILED',
      level: 'error',
      operation: 'operation.run',
      scope: 'platform.test',
      source: 'main',
      timestamp: '2026-09-05T11:58:00.000Z'
    }
  ]
}
