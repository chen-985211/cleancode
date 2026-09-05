import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/csr/ArrowSquareOut'
import { CopyIcon } from '@phosphor-icons/react/dist/csr/Copy'
import { DownloadSimpleIcon } from '@phosphor-icons/react/dist/csr/DownloadSimple'
import { ShieldCheckIcon } from '@phosphor-icons/react/dist/csr/ShieldCheck'
import { useState } from 'react'

import { useI18n } from '../../../i18n/useI18n'
import { formatApplicationDiagnosticsSummary } from './applicationDiagnosticsSummary'

const cleancodeBugReportUrl =
  'https://github.com/chen-985211/cleancode/issues/new?template=bug_report.yml'

type DiagnosticsOperation = 'copying' | 'exporting' | 'idle'
type DiagnosticsFeedback =
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'success'; readonly message: string }
  | null

export function ApplicationDiagnosticsPane() {
  const { t } = useI18n()
  const [operation, setOperation] = useState<DiagnosticsOperation>('idle')
  const [feedback, setFeedback] = useState<DiagnosticsFeedback>(null)
  const diagnosticsApi = window.cleancode
  const isAvailable =
    typeof diagnosticsApi?.getApplicationDiagnosticsSummary === 'function' &&
    typeof diagnosticsApi.exportApplicationDiagnostics === 'function'
  const isBusy = operation !== 'idle'

  const copySummary = async (): Promise<void> => {
    if (!isAvailable) return
    setOperation('copying')
    setFeedback(null)
    try {
      const summary = await diagnosticsApi.getApplicationDiagnosticsSummary()
      if (typeof window.navigator.clipboard?.writeText !== 'function') {
        throw new Error('Clipboard API unavailable')
      }
      await window.navigator.clipboard.writeText(formatApplicationDiagnosticsSummary(summary, t))
      setFeedback({ kind: 'success', message: t('settings.diagnostics.copied') })
    } catch {
      setFeedback({ kind: 'error', message: t('settings.diagnostics.copyFailed') })
    } finally {
      setOperation('idle')
    }
  }

  const exportDiagnostics = async (): Promise<void> => {
    if (!isAvailable) return
    setOperation('exporting')
    setFeedback(null)
    try {
      const result = await diagnosticsApi.exportApplicationDiagnostics({
        buttonLabel: t('settings.diagnostics.dialogButton'),
        dialogTitle: t('settings.diagnostics.dialogTitle')
      })
      if (result.status === 'saved') {
        setFeedback({
          kind: 'success',
          message: t('settings.diagnostics.exported', { fileName: result.fileName })
        })
      }
    } catch {
      setFeedback({ kind: 'error', message: t('settings.diagnostics.exportFailed') })
    } finally {
      setOperation('idle')
    }
  }

  return (
    <div className="application-diagnostics-pane" aria-busy={isBusy}>
      <header className="application-diagnostics-pane__header">
        <h2>{t('settings.diagnostics.title')}</h2>
        <p>{t('settings.diagnostics.description')}</p>
      </header>
      <div className="application-diagnostics-pane__privacy">
        <ShieldCheckIcon size={18} weight="fill" aria-hidden="true" />
        <span>{t('settings.diagnostics.privacy')}</span>
      </div>
      <div className="application-diagnostics-actions">
        <section className="application-diagnostics-action">
          <div>
            <h3>{t('settings.diagnostics.copySummary')}</h3>
            <p>{t('settings.diagnostics.copyDescription')}</p>
          </div>
          <button
            className="application-diagnostics-action__control"
            type="button"
            disabled={!isAvailable || isBusy}
            onClick={() => void copySummary()}
          >
            <CopyIcon size={16} weight="bold" aria-hidden="true" />
            {operation === 'copying'
              ? t('settings.diagnostics.copying')
              : t('settings.diagnostics.copySummary')}
          </button>
        </section>
        <section className="application-diagnostics-action">
          <div>
            <h3>{t('settings.diagnostics.export')}</h3>
            <p>{t('settings.diagnostics.exportDescription')}</p>
          </div>
          <button
            className="application-diagnostics-action__control"
            type="button"
            disabled={!isAvailable || isBusy}
            onClick={() => void exportDiagnostics()}
          >
            <DownloadSimpleIcon size={16} weight="bold" aria-hidden="true" />
            {operation === 'exporting'
              ? t('settings.diagnostics.exporting')
              : t('settings.diagnostics.export')}
          </button>
        </section>
        <section className="application-diagnostics-action">
          <div>
            <h3>{t('settings.diagnostics.report')}</h3>
            <p>{t('settings.diagnostics.reportDescription')}</p>
          </div>
          <a
            className="application-diagnostics-action__control"
            href={cleancodeBugReportUrl}
            rel="noreferrer"
            target="_blank"
          >
            <ArrowSquareOutIcon size={16} weight="bold" aria-hidden="true" />
            {t('settings.diagnostics.openGitHub')}
          </a>
        </section>
      </div>
      {!isAvailable ? (
        <p className="application-diagnostics-pane__feedback" role="status">
          {t('settings.diagnostics.unavailable')}
        </p>
      ) : feedback ? (
        <p
          className={`application-diagnostics-pane__feedback application-diagnostics-pane__feedback--${feedback.kind}`}
          role={feedback.kind === 'error' ? 'alert' : 'status'}
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  )
}
