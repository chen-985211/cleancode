import {
  applicationDiagnosticsMaxBytes,
  createApplicationDiagnosticsSnapshot,
  serializeApplicationDiagnosticsSnapshot
} from '../../../src/platform/electron-main/applicationDiagnostics'

const generatedAt = '2026-09-05T12:00:00.000Z'

describe('application diagnostics', () => {
  it('collects only recent allowlisted fields and redacts sensitive diagnostic text', () => {
    const snapshot = createApplicationDiagnosticsSnapshot({
      application: {
        isPackaged: true,
        name: 'CleanCode',
        version: '0.1.15'
      },
      generatedAt,
      logs: [
        {
          contents: [
            JSON.stringify({
              timestamp: '2026-09-05T11:20:00.000Z',
              level: 'error',
              scope: 'project.git',
              operation: 'oldFailure',
              error: { code: 'UNEXPECTED_ERROR', message: 'outside the collection window' }
            }),
            '{not-json',
            JSON.stringify({
              timestamp: '2026-09-05T11:55:00.000Z',
              level: 'error',
              scope: 'project.git',
              operation: 'openWorkspace',
              outcome: 'failure',
              durationMs: 42,
              correlationId: 'openWorkspace-1',
              details: { token: 'must-not-leak' },
              error: {
                code: 'UNEXPECTED_ERROR',
                isExpected: false,
                message:
                  'Failed at /Users/alice/Development/private/file.ts with token=secret-value password="two words"',
                stack: 'private stack'
              },
              unknown: 'must-not-leak'
            })
          ].join('\n'),
          source: 'main'
        },
        {
          contents: JSON.stringify({
            timestamp: '2026-09-05T11:58:00.000Z',
            event: 'provider-start-failed',
            message: 'Cannot open C:\\Users\\alice\\private\\provider.json',
            authToken: 'must-not-leak',
            terminalOutput: 'must-not-leak'
          }),
          source: 'terminal-provider'
        }
      ],
      redaction: {
        appStateDirectory: '/Users/alice/Library/Application Support/CleanCode',
        homeDirectory: '/Users/alice'
      },
      runtime: {
        architecture: 'arm64',
        chromiumVersion: '152.0.0',
        electronVersion: '43.0.0',
        nodeVersion: '24.0.0',
        osRelease: '25.0.0',
        platform: 'darwin'
      }
    })

    expect(snapshot.logs).toEqual([
      {
        correlationId: 'openWorkspace-1',
        durationMs: 42,
        error: {
          code: 'UNEXPECTED_ERROR',
          isExpected: false,
          message:
            'Failed at <HOME>/Development/private/file.ts with token=<REDACTED> password="<REDACTED>"'
        },
        level: 'error',
        operation: 'openWorkspace',
        outcome: 'failure',
        scope: 'project.git',
        source: 'main',
        timestamp: '2026-09-05T11:55:00.000Z'
      },
      {
        event: 'provider-start-failed',
        message: 'Cannot open <PATH>',
        source: 'terminal-provider',
        timestamp: '2026-09-05T11:58:00.000Z'
      }
    ])
    expect(snapshot.collection).toMatchObject({
      includedRecordCount: 2,
      skippedLineCount: 1,
      truncated: false,
      windowMinutes: 30
    })
    expect(serializeApplicationDiagnosticsSnapshot(snapshot)).not.toContain('must-not-leak')
    expect(serializeApplicationDiagnosticsSnapshot(snapshot)).not.toContain('private stack')
  })

  it('keeps the serialized diagnostic file within the product size limit', () => {
    const largeMessage = 'x'.repeat(96 * 1024)
    const contents = Array.from({ length: 80 }, (_, index) =>
      JSON.stringify({
        timestamp: `2026-09-05T11:${String(30 + (index % 30)).padStart(2, '0')}:00.000Z`,
        level: 'error',
        scope: 'run.terminal',
        operation: `failure-${index}`,
        error: { code: 'UNEXPECTED_ERROR', message: largeMessage }
      })
    ).join('\n')

    const snapshot = createApplicationDiagnosticsSnapshot({
      application: { isPackaged: false, name: 'CleanCode', version: '0.1.15' },
      generatedAt,
      logs: [{ contents, source: 'main' }],
      redaction: { appStateDirectory: '/tmp/cleancode', homeDirectory: '/Users/alice' },
      runtime: {
        architecture: 'arm64',
        chromiumVersion: '152.0.0',
        electronVersion: '43.0.0',
        nodeVersion: '24.0.0',
        osRelease: '25.0.0',
        platform: 'darwin'
      }
    })
    const serialized = serializeApplicationDiagnosticsSnapshot(snapshot)

    expect(Buffer.byteLength(serialized, 'utf8')).toBeLessThanOrEqual(
      applicationDiagnosticsMaxBytes
    )
    expect(snapshot.collection.truncated).toBe(true)
    expect(snapshot.collection.includedRecordCount).toBeLessThan(80)
  })

  it.each([
    {
      expected: 'Authorization: <REDACTED>',
      message: 'Authorization: Basic dXNlcjpwYXNz',
      name: 'a complete Basic authorization header',
      sensitiveText: 'dXNlcjpwYXNz'
    },
    {
      expected: 'details={"token":"<REDACTED>"}',
      message: 'details={"token":"secret-value"}',
      name: 'a credential with a quoted JSON key',
      sensitiveText: 'secret-value'
    },
    {
      expected: "Cannot open '<PATH>'",
      message: "Cannot open '/Volumes/Company/private project/config.json'",
      name: 'a quoted POSIX path containing spaces',
      sensitiveText: '/Volumes/Company/private project/config.json'
    },
    {
      expected: 'Cannot open "<PATH>"',
      message: 'Cannot open "C:\\Users\\alice\\private project\\config.json"',
      name: 'a quoted Windows path containing spaces',
      sensitiveText: 'C:\\Users\\alice\\private project\\config.json'
    }
  ])(
    'redacts $name through the shared diagnostic text policy',
    ({ expected, message, sensitiveText }) => {
      const snapshot = createSnapshotWithErrorMessage(message)

      expect(snapshot.logs[0]?.error?.message).toBe(expected)
      expect(serializeApplicationDiagnosticsSnapshot(snapshot)).not.toContain(sensitiveText)
    }
  )
})

function createSnapshotWithErrorMessage(message: string) {
  return createApplicationDiagnosticsSnapshot({
    application: { isPackaged: false, name: 'CleanCode', version: '0.1.15' },
    generatedAt,
    logs: [
      {
        contents: JSON.stringify({
          timestamp: '2026-09-05T11:59:00.000Z',
          level: 'error',
          scope: 'platform.application',
          operation: 'diagnosticFailure',
          error: { message }
        }),
        source: 'main'
      }
    ],
    redaction: {
      appStateDirectory: '/Users/alice/Library/Application Support/CleanCode',
      homeDirectory: '/Users/alice'
    },
    runtime: {
      architecture: 'arm64',
      chromiumVersion: '152.0.0',
      electronVersion: '43.0.0',
      nodeVersion: '24.0.0',
      osRelease: '25.0.0',
      platform: 'darwin'
    }
  })
}
