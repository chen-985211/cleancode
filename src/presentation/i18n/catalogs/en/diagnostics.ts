import type { zhCNDiagnosticsMessages } from '../zh-CN/diagnostics'

export const enDiagnosticsMessages = {
  'settings.diagnostics.title': 'Problem feedback',
  'settings.diagnostics.description':
    'Export sanitized diagnostics to help investigate problems you encountered while using the app.',
  'settings.diagnostics.privacy':
    'Source code, terminal content, and Agent conversations are not included.',
  'settings.diagnostics.copySummary': 'Copy diagnostic summary',
  'settings.diagnostics.copyDescription':
    'Copy an overview of the app, system, and recent failures into a problem report.',
  'settings.diagnostics.copying': 'Copying…',
  'settings.diagnostics.copied': 'Diagnostic summary copied.',
  'settings.diagnostics.copyFailed': 'The diagnostic summary could not be copied. Try again.',
  'settings.diagnostics.export': 'Export diagnostic file',
  'settings.diagnostics.exportDescription':
    'Save sanitized app logs and runtime details from the last 30 minutes.',
  'settings.diagnostics.exporting': 'Exporting…',
  'settings.diagnostics.exported': 'Exported {fileName}.',
  'settings.diagnostics.exportFailed': 'The diagnostic file could not be exported. Try again.',
  'settings.diagnostics.report': 'Report a problem',
  'settings.diagnostics.reportDescription':
    'Open GitHub to paste the diagnostic summary or attach the exported diagnostic file.',
  'settings.diagnostics.openGitHub': 'Open GitHub',
  'settings.diagnostics.unavailable': 'Diagnostic export is only available in the desktop app.',
  'settings.diagnostics.dialogTitle': 'Export diagnostics',
  'settings.diagnostics.dialogButton': 'Export',
  'settings.diagnostics.summaryTitle': 'Problem feedback diagnostic summary',
  'settings.diagnostics.summaryApplication': 'Application: {name} {version}',
  'settings.diagnostics.summarySystem': 'System: {platform} {architecture} ({osRelease})',
  'settings.diagnostics.summaryRuntime':
    'Runtime: Electron {electronVersion} · Node {nodeVersion} · Chromium {chromiumVersion}',
  'settings.diagnostics.summaryGenerated': 'Generated: {generatedAt}',
  'settings.diagnostics.summaryWindow': 'Log window: last {minutes} minutes · {records} records',
  'settings.diagnostics.summaryFailures': 'Recent failures',
  'settings.diagnostics.summaryNoFailures': 'No recent failures.',
  'settings.diagnostics.summaryFailure':
    '- {timestamp} · {source} · {operation} · {code} · {correlationId}',
  'settings.diagnostics.notAvailable': 'Unavailable'
} as const satisfies { readonly [Key in keyof typeof zhCNDiagnosticsMessages]: string }
