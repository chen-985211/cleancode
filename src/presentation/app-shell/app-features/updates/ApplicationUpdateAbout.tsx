import { useI18n } from '../../../i18n/useI18n'
import { useApplicationUpdate } from './useApplicationUpdate'

export function ApplicationUpdateAbout() {
  const { snapshot, actionFailed, check, showRestart } = useApplicationUpdate()
  const { t } = useI18n()
  const busy = ['checking', 'downloading', 'verifying', 'installing'].includes(snapshot.status)
  const ready = snapshot.status === 'ready' || snapshot.error === 'install'
  const message =
    snapshot.status === 'unavailable'
      ? t('update.unavailable')
      : actionFailed || snapshot.status === 'error'
        ? t('update.checkError')
        : ready
          ? t('update.readyVersion', { version: snapshot.version ?? '' })
          : busy
            ? t('update.progressLabel', { percent: Math.floor(snapshot.percent ?? 0) })
            : t('update.current')
  return (
    <div className="application-update-about">
      <p role="status">{message}</p>
      <button
        type="button"
        disabled={busy || snapshot.status === 'unavailable'}
        onClick={ready ? showRestart : check}
      >
        {t(ready ? 'update.restart' : 'update.check')}
      </button>
    </div>
  )
}
