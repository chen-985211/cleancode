import type { ApplicationDiagnosticsSummary } from '../../../../platform/ipc/applicationDiagnosticsChannels'
import type { Translate } from '../../../i18n/messages'

export function formatApplicationDiagnosticsSummary(
  summary: ApplicationDiagnosticsSummary,
  t: Translate
): string {
  const lines = [
    `## ${t('settings.diagnostics.summaryTitle')}`,
    '',
    `- ${t('settings.diagnostics.summaryApplication', {
      name: summary.application.name,
      version: summary.application.version
    })}`,
    `- ${t('settings.diagnostics.summarySystem', summary.runtime)}`,
    `- ${t('settings.diagnostics.summaryRuntime', summary.runtime)}`,
    `- ${t('settings.diagnostics.summaryGenerated', { generatedAt: summary.generatedAt })}`,
    `- ${t('settings.diagnostics.summaryWindow', {
      minutes: summary.collection.windowMinutes,
      records: summary.collection.includedRecordCount
    })}`,
    '',
    `### ${t('settings.diagnostics.summaryFailures')}`
  ]

  if (summary.recentFailures.length === 0) {
    lines.push('', t('settings.diagnostics.summaryNoFailures'))
    return lines.join('\n')
  }

  const unavailable = t('settings.diagnostics.notAvailable')
  lines.push(
    '',
    ...summary.recentFailures.map((failure) =>
      t('settings.diagnostics.summaryFailure', {
        code: failure.errorCode ?? unavailable,
        correlationId: failure.correlationId ?? unavailable,
        operation: [failure.scope, failure.operation ?? failure.event].filter(Boolean).join(' · '),
        source: failure.source,
        timestamp: failure.timestamp
      })
    )
  )
  return lines.join('\n')
}
