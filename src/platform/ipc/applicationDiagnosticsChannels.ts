export const applicationDiagnosticsChannels = {
  export: 'cleancode:export-application-diagnostics',
  getSummary: 'cleancode:get-application-diagnostics-summary'
} as const

export interface ApplicationDiagnosticsExportCommand {
  readonly buttonLabel: string
  readonly dialogTitle: string
}

export type ApplicationDiagnosticsExportResult =
  { readonly status: 'cancelled' } | { readonly fileName: string; readonly status: 'saved' }

export interface ApplicationDiagnosticsSummary {
  readonly schemaVersion: 1
  readonly generatedAt: string
  readonly application: {
    readonly isPackaged: boolean
    readonly name: string
    readonly version: string
  }
  readonly runtime: {
    readonly architecture: string
    readonly chromiumVersion: string
    readonly electronVersion: string
    readonly nodeVersion: string
    readonly osRelease: string
    readonly platform: string
  }
  readonly collection: {
    readonly includedRecordCount: number
    readonly maximumBytes: number
    readonly skippedLineCount: number
    readonly truncated: boolean
    readonly windowEndedAt: string
    readonly windowMinutes: number
    readonly windowStartedAt: string
  }
  readonly recentFailures: readonly ApplicationDiagnosticsFailureSummary[]
}

export interface ApplicationDiagnosticsFailureSummary {
  readonly timestamp: string
  readonly source: 'main' | 'terminal-provider'
  readonly level?: 'warn' | 'error'
  readonly scope?: string
  readonly operation?: string
  readonly event?: string
  readonly correlationId?: string
  readonly errorCode?: string
}

export function isApplicationDiagnosticsExportCommand(
  value: unknown
): value is ApplicationDiagnosticsExportCommand {
  if (typeof value !== 'object' || value === null || Object.keys(value).length !== 2) return false
  const command = value as Partial<ApplicationDiagnosticsExportCommand>
  return isBoundedText(command.buttonLabel) && isBoundedText(command.dialogTitle)
}

function isBoundedText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 160
}
