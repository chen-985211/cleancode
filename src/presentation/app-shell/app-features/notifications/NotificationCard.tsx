import { ArrowClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowClockwise'
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check'
import { DotsThreeIcon } from '@phosphor-icons/react/dist/csr/DotsThree'
import { StopIcon } from '@phosphor-icons/react/dist/csr/Stop'
import { XIcon } from '@phosphor-icons/react/dist/csr/X'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import { useI18n } from '../../../i18n/useI18n'
import { TooltipLabel } from '../../../shared/components/Tooltip'
import { usePrefersReducedMotion } from '../../../shared/hooks/usePrefersReducedMotion'
import { useSurfaceMotionPresence } from '../../../shared/hooks/useSurfaceMotionPresence'
import type {
  AppNotification,
  AppNotificationSource
} from '../../../shared/notifications/appNotifications'
import { notificationOccurrenceKey } from './notificationIdentity'
import type { AppNotificationPresentation } from './notificationStack'
import {
  completeNotificationStatusMotion,
  createNotificationStatusMotionState,
  synchronizeNotificationStatusMotion,
  type NotificationStatusMotionLayer
} from './notificationStatusMotion'
import { useNotificationAutoDismiss } from './useNotificationAutoDismiss'

export function NotificationCard({
  concealed,
  paused,
  presentation,
  toggle,
  onDismiss,
  onExitComplete
}: {
  readonly concealed: boolean
  readonly paused: boolean
  readonly presentation: AppNotificationPresentation
  readonly toggle: ReactNode
  readonly onDismiss: (id: string) => void
  readonly onExitComplete: (id: string, exitToken: number) => void
}) {
  const { t } = useI18n()
  const { notification } = presentation
  const prefersReducedMotion = usePrefersReducedMotion()
  const reducedMotion = prefersReducedMotion || concealed
  const statusInput = { notification, reducedMotion }
  const [renderedStatus, setRenderedStatus] = useState(() =>
    createNotificationStatusMotionState(statusInput)
  )
  const changed =
    renderedStatus.notification !== notification || renderedStatus.reducedMotion !== reducedMotion
  const status = changed
    ? synchronizeNotificationStatusMotion(renderedStatus, statusInput)
    : renderedStatus
  if (changed) setRenderedStatus(status)
  const completeStatus = useCallback((id: number) => {
    setRenderedStatus((current) => completeNotificationStatusMotion(current, id))
  }, [])
  const presence = useSurfaceMotionPresence(presentation.open, {
    ...(concealed ? { motionPreference: true } : {}),
    onExitComplete: () => onExitComplete(notification.id, presentation.exitToken)
  })
  const initiallyClosed = useRef(!presentation.open)
  useLayoutEffect(() => {
    if (!initiallyClosed.current) return
    initiallyClosed.current = false
    if (!presence.isPresent) onExitComplete(notification.id, presentation.exitToken)
  }, [notification.id, onExitComplete, presentation.exitToken, presence.isPresent])
  useNotificationAutoDismiss({ notification, open: presentation.open, paused, onDismiss })
  if (!presence.isPresent) return null

  const content = (
    <div className="notification-card__content">
      <span className="notification-card__title-stage">
        {status.layers.map((layer) => (
          <NotificationTitle key={layer.id} layer={layer} onComplete={completeStatus} />
        ))}
      </span>
      <div className="notification-card__detail-row">
        {notification.message ? (
          <p className="notification-card__message" title={notification.message}>
            {notification.message}
          </p>
        ) : null}
        {notification.source ? <NotificationSource source={notification.source} /> : null}
      </div>
    </div>
  )
  return (
    <section
      aria-atomic="true"
      aria-label={notification.accessibleLabel}
      className={
        'notification-card notification-card--uniform notification-card--' + notification.kind
      }
      data-notification-id={notification.id}
      role={notification.kind === 'error' ? 'alert' : 'status'}
      {...presence.surfaceProps}
    >
      {notification.activation ? (
        <button
          aria-label={notification.activation.label}
          className="notification-card__body notification-card__body--interactive"
          onClick={() => void notification.activation?.onClick()}
          title={notification.activation.label}
          type="button"
        >
          {content}
        </button>
      ) : (
        <div className="notification-card__body">{content}</div>
      )}
      <div className="notification-card__controls">
        {toggle}
        {notification.action ? (
          <NotificationActionButton
            key={notificationOccurrenceKey(notification)}
            action={notification.action}
          />
        ) : null}
        <TooltipLabel content={t('notifications.dismissTitle')}>
          <button
            aria-label={t('notifications.dismiss', {
              title: notification.accessibleLabel ?? notification.title
            })}
            className="notification-card__dismiss"
            onClick={() => onDismiss(notification.id)}
            type="button"
          >
            <XIcon size={13} aria-hidden="true" />
          </button>
        </TooltipLabel>
      </div>
    </section>
  )
}

function NotificationTitle({
  layer,
  onComplete
}: {
  readonly layer: NotificationStatusMotionLayer
  readonly onComplete: (id: number) => void
}) {
  const rootRef = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    if (layer.phase !== 'outgoing') return
    const animations = rootRef.current?.getAnimations?.() ?? []
    if (animations.length === 0) {
      onComplete(layer.id)
      return
    }
    let cancelled = false
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (!cancelled) onComplete(layer.id)
    })
    return () => {
      cancelled = true
    }
  }, [layer.id, layer.phase, onComplete])
  const notification = layer.notification
  return (
    <strong
      aria-hidden={layer.phase === 'outgoing' ? true : undefined}
      className="notification-card__title notification-card__title-layer"
      data-notification-status-motion-state={layer.phase}
      ref={rootRef}
    >
      {notification.leadingIcon ? (
        <span aria-hidden="true" className="notification-card__identity">
          {notification.leadingIcon}
        </span>
      ) : null}
      <span className="notification-card__title-copy" title={notification.title}>
        {notification.title}
      </span>
      {notification.titleStatus ? (
        <TooltipLabel content={notification.titleStatus.label}>
          <span
            aria-label={notification.titleStatus.label}
            className="notification-card__title-status"
            role="img"
          >
            {notification.titleStatus.icon}
          </span>
        </TooltipLabel>
      ) : notification.kind === 'success' ? (
        <CheckIcon aria-hidden="true" className="notification-card__title-status" size={12} />
      ) : notification.kind === 'warning' || notification.kind === 'error' ? (
        <span aria-hidden="true" className="notification-card__attention" />
      ) : null}
    </strong>
  )
}

function NotificationSource({ source }: { readonly source: AppNotificationSource }) {
  return (
    <div className="notification-card__source">
      <span className="notification-card__source-label" title={source.label}>
        {source.label}
      </span>
      {source.detail ? (
        <span className="notification-card__source-detail" title={source.detail}>
          {source.detail}
        </span>
      ) : null}
    </div>
  )
}

function NotificationActionButton({
  action
}: {
  readonly action: NonNullable<AppNotification['action']>
}) {
  const [isPending, setIsPending] = useState(false)
  const isMounted = useRef(true)
  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])
  const accessibleLabel =
    (isPending || action.disabled) && action.pendingLabel ? action.pendingLabel : action.label
  const isBusy = isPending || (action.disabled === true && action.pendingLabel !== undefined)
  const ActionIcon = action.icon === 'retry' ? ArrowClockwiseIcon : StopIcon
  const handleAction = async (): Promise<void> => {
    if (action.disabled || isPending) return
    setIsPending(true)
    try {
      await action.onClick()
    } finally {
      if (isMounted.current) setIsPending(false)
    }
  }
  return (
    <TooltipLabel content={accessibleLabel}>
      <button
        aria-busy={isBusy || undefined}
        aria-disabled={action.disabled || isPending}
        aria-label={accessibleLabel}
        className={
          'notification-card__action notification-card__action--' + (action.tone ?? 'default')
        }
        data-notification-action-icon={isBusy ? 'loading' : action.icon}
        onClick={() => void handleAction()}
        title={accessibleLabel}
        type="button"
      >
        {isBusy ? (
          <DotsThreeIcon aria-hidden="true" size={15} weight="bold" />
        ) : (
          <ActionIcon
            aria-hidden="true"
            className="notification-card__action-icon"
            size={12}
            weight={action.icon === 'stop' ? 'fill' : 'regular'}
          />
        )}
      </button>
    </TooltipLabel>
  )
}
