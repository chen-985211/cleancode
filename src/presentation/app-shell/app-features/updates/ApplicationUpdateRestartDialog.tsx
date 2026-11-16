import * as AlertDialog from '@animate-ui/react/primitives/radix-ui/alert-dialog'
import { ReducedMotionContext } from '@animate-ui/react/utils/motion'
import type { RefObject } from 'react'
import { useI18n } from '../../../i18n/useI18n'
import { usePrefersReducedMotion } from '../../../shared/hooks/usePrefersReducedMotion'

export function ApplicationUpdateRestartDialog(props: {
  readonly open: boolean
  readonly version: string | null
  readonly pending: boolean
  readonly failed: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onInstall: () => void
  readonly returnFocusRef: RefObject<HTMLElement | null>
}) {
  const { t } = useI18n()
  const reduced = usePrefersReducedMotion()
  return (
    <ReducedMotionContext value={reduced ? 'always' : 'never'}>
      <AlertDialog.Root
        open={props.open}
        onOpenChange={(open) => {
          if (!props.pending) props.onOpenChange(open)
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="application-update-dialog-overlay" />
          <AlertDialog.Content
            className="application-update-dialog"
            aria-modal="true"
            aria-busy={props.pending}
            onKeyDown={(event) => event.stopPropagation()}
            onEscapeKeyDown={(event) => {
              if (props.pending) event.preventDefault()
            }}
            onCloseAutoFocus={(event) => {
              const target = props.returnFocusRef.current
              if (target?.isConnected && !target.closest('[inert]')) {
                event.preventDefault()
                target.focus()
              }
            }}
          >
            <div className="application-update-dialog__body">
              <AlertDialog.Title>{t('update.readyTitle')}</AlertDialog.Title>
              <AlertDialog.Description>
                {t('update.restartDescription', { version: props.version ?? '' })}
              </AlertDialog.Description>
              {props.failed ? <p role="alert">{t('update.installError')}</p> : null}
            </div>
            <div className="application-update-dialog__actions">
              <AlertDialog.Cancel
                className="application-update-dialog__later"
                disabled={props.pending}
              >
                {t('update.later')}
              </AlertDialog.Cancel>
              <button
                type="button"
                data-update-install
                className="application-update-dialog__install"
                disabled={props.pending}
                onClick={props.onInstall}
              >
                {t(props.pending ? 'update.installing' : 'update.restart')}
              </button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </ReducedMotionContext>
  )
}
