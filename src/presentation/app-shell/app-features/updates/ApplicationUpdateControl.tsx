import * as Progress from '@animate-ui/react/primitives/radix-ui/progress'
import { ReducedMotionContext } from '@animate-ui/react/utils/motion'
import { ArrowClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowClockwise'
import { CheckCircleIcon } from '@phosphor-icons/react/dist/csr/CheckCircle'
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle'
import { useI18n } from '../../../i18n/useI18n'
import { TooltipLabel } from '../../../shared/components/Tooltip'
import { usePrefersReducedMotion } from '../../../shared/hooks/usePrefersReducedMotion'
import { UpdateDownloadIcon } from './UpdateDownloadIcon'
import { useApplicationUpdate } from './useApplicationUpdate'

export function ApplicationUpdateControl() {
  const { snapshot, actionFailed, check, showRestart } = useApplicationUpdate()
  const { t } = useI18n()
  const reduced = usePrefersReducedMotion()
  const downloading = snapshot.status === 'downloading' || snapshot.status === 'verifying'
  const busy = downloading || snapshot.status === 'checking' || snapshot.status === 'installing'
  const ready = snapshot.status === 'ready' || snapshot.error === 'install'
  const failed = actionFailed || snapshot.status === 'error'
  const percent = snapshot.percent ?? 0
  const label = t(
    ready
      ? 'update.restart'
      : failed
        ? 'update.retry'
        : busy
          ? 'update.progressLabel'
          : 'update.check',
    { percent: Math.floor(percent) }
  )
  return (
    <div className="application-update-footer">
      {snapshot.status !== 'unavailable' || actionFailed ? (
        <ReducedMotionContext value={reduced ? 'always' : 'never'}>
          <TooltipLabel content={label}>
            <button
              type="button"
              data-application-update-trigger
              className={`application-update-control${downloading ? ' application-update-control--downloading' : ''}`}
              aria-label={label}
              aria-busy={busy}
              aria-disabled={busy || undefined}
              onClick={() => {
                if (!busy) {
                  if (ready) showRestart()
                  else check()
                }
              }}
            >
              {downloading ? (
                <Progress.Root
                  value={percent}
                  className="application-update-progress"
                  aria-label={label}
                >
                  <Progress.Indicator
                    className="application-update-progress__fill"
                    style={{ transform: `translateX(-${100 - percent}%)` }}
                  />
                  <span className="application-update-progress__percent" aria-hidden="true">
                    {Math.floor(percent)}%
                  </span>
                </Progress.Root>
              ) : ready ? (
                <CheckCircleIcon size={16} aria-hidden="true" />
              ) : failed ? (
                <WarningCircleIcon size={16} aria-hidden="true" />
              ) : busy ? (
                <ArrowClockwiseIcon size={16} aria-hidden="true" />
              ) : (
                <UpdateDownloadIcon size={20} animateOnHover={!reduced} aria-hidden="true" />
              )}
            </button>
          </TooltipLabel>
        </ReducedMotionContext>
      ) : null}
    </div>
  )
}
