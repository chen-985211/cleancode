import { CheckCircleIcon } from '@phosphor-icons/react/dist/csr/CheckCircle'
import { CircleNotchIcon } from '@phosphor-icons/react/dist/csr/CircleNotch'
import { InfoIcon } from '@phosphor-icons/react/dist/csr/Info'
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle'
import { WarningIcon } from '@phosphor-icons/react/dist/csr/Warning'
import { XIcon } from '@phosphor-icons/react/dist/csr/X'
import type { Icon } from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { AppNotification, AppNotificationKind } from './appNotifications'
import { useI18n } from './i18n/useI18n'
import {
  completeNotificationStatusMotion,
  createNotificationStatusMotionState,
  synchronizeNotificationStatusMotion,
  type NotificationStatusMotionLayer
} from './notificationStatusMotion'
import { TooltipLabel } from './Tooltip'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'
import { useNotificationStatusIconSpring } from './useNotificationStatusIconSpring'
import { useSurfaceMotionPresence } from './useSurfaceMotionPresence'

export interface AppNotificationPresentation {
  readonly notification: AppNotification
  readonly open: boolean
}

interface NotificationCenterProps {
  readonly notifications: readonly AppNotificationPresentation[]
  readonly onDismiss: (notificationId: string) => void
  readonly onExitComplete: (notificationId: string) => void
}

export function NotificationCenter({
  notifications,
  onDismiss,
  onExitComplete
}: NotificationCenterProps) {
  const { t } = useI18n()
  if (notifications.length === 0) {
    return null
  }

  return (
    <div className="notification-viewport" aria-label={t('notifications.label')}>
      {notifications.map((presentation) => (
        <NotificationCard
          key={presentation.notification.id}
          presentation={presentation}
          onDismiss={onDismiss}
          onExitComplete={onExitComplete}
        />
      ))}
    </div>
  )
}

interface NotificationCardProps {
  readonly presentation: AppNotificationPresentation
  readonly onDismiss: (notificationId: string) => void
  readonly onExitComplete: (notificationId: string) => void
}

function NotificationCard({ presentation, onDismiss, onExitComplete }: NotificationCardProps) {
  const { t } = useI18n()
  const { notification } = presentation
  const [isActionPending, setIsActionPending] = useState(false)
  const reducedMotion = usePrefersReducedMotion()
  const statusInput = { notification, reducedMotion }
  const [renderedStatus, setRenderedStatus] = useState(() =>
    createNotificationStatusMotionState(statusInput)
  )
  const statusInputChanged =
    renderedStatus.notification !== statusInput.notification ||
    renderedStatus.reducedMotion !== statusInput.reducedMotion
  const status = statusInputChanged
    ? synchronizeNotificationStatusMotion(renderedStatus, statusInput)
    : renderedStatus
  if (statusInputChanged) setRenderedStatus(status)
  const completeStatusLayer = useCallback((layerId: number) => {
    setRenderedStatus((current) => completeNotificationStatusMotion(current, layerId))
  }, [])
  const isMounted = useRef(true)
  const presence = useSurfaceMotionPresence(presentation.open, {
    onExitComplete: () => onExitComplete(notification.id)
  })

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!presentation.open || !notification.autoDismissMs || notification.autoDismissMs <= 0) {
      return undefined
    }

    const timeoutId = window.setTimeout(
      () => onDismiss(notification.id),
      notification.autoDismissMs
    )

    return () => window.clearTimeout(timeoutId)
  }, [notification.autoDismissMs, notification.id, onDismiss, presentation.open])

  if (!presence.isPresent) return null

  const actionLabel =
    (isActionPending || notification.action?.disabled) && notification.action?.pendingLabel
      ? notification.action.pendingLabel
      : notification.action?.label
  const handleAction = async () => {
    if (!notification.action || notification.action.disabled || isActionPending) {
      return
    }

    setIsActionPending(true)
    try {
      await notification.action.onClick()
    } finally {
      if (isMounted.current) {
        setIsActionPending(false)
      }
    }
  }

  return (
    <section
      className={`notification-card notification-card--${notification.kind}${notification.isActivity ? ' notification-card--activity' : ''}`}
      role={notification.kind === 'error' ? 'alert' : 'status'}
      aria-atomic="true"
      {...presence.surfaceProps}
    >
      <span className="notification-card__icon" aria-hidden="true">
        {status.layers.map((layer) => (
          <NotificationStatusIconLayer
            key={layer.id}
            layer={layer}
            reducedMotion={reducedMotion}
            onExitComplete={completeStatusLayer}
          />
        ))}
      </span>
      <div className="notification-card__content">
        <span className="notification-card__title-stage">
          {status.layers.map((layer) => (
            <strong
              className="notification-card__title notification-card__title-layer"
              data-notification-status-motion-state={layer.phase}
              aria-hidden={layer.phase === 'outgoing' ? true : undefined}
              key={layer.id}
            >
              {layer.notification.title}
            </strong>
          ))}
        </span>
        {notification.message ? (
          <p className="notification-card__message">{notification.message}</p>
        ) : null}
        {notification.action && actionLabel ? (
          <div className="notification-card__actions">
            <button
              className={`notification-card__action notification-card__action--${notification.action.tone ?? 'default'}`}
              type="button"
              disabled={notification.action.disabled || isActionPending}
              onClick={() => void handleAction()}
            >
              {actionLabel}
            </button>
          </div>
        ) : null}
      </div>
      <TooltipLabel content={t('notifications.dismissTitle')}>
        <button
          className="notification-card__dismiss"
          type="button"
          aria-label={t('notifications.dismiss', { title: notification.title })}
          onClick={() => onDismiss(notification.id)}
        >
          <XIcon size={15} weight="bold" aria-hidden="true" />
        </button>
      </TooltipLabel>
    </section>
  )
}

interface NotificationStatusIconLayerProps {
  readonly layer: NotificationStatusMotionLayer
  readonly reducedMotion: boolean
  readonly onExitComplete: (layerId: number) => void
}

function NotificationStatusIconLayer({
  layer,
  reducedMotion,
  onExitComplete
}: NotificationStatusIconLayerProps) {
  const completeExit = useCallback(() => onExitComplete(layer.id), [layer.id, onExitComplete])
  const rootRef = useNotificationStatusIconSpring(layer.phase, reducedMotion, completeExit)
  const Icon = layer.notification.isActivity
    ? CircleNotchIcon
    : notificationIcons[layer.notification.kind]

  return (
    <span
      ref={rootRef}
      className={`notification-card__icon-layer notification-card__icon-layer--${layer.notification.kind}`}
      data-notification-status-motion-state={layer.phase}
    >
      <Icon
        className={layer.notification.isActivity ? 'notification-card__spinner' : undefined}
        size={17}
        weight={layer.notification.isActivity ? 'bold' : 'fill'}
      />
    </span>
  )
}

const notificationIcons: Record<AppNotificationKind, Icon> = {
  error: WarningCircleIcon,
  info: InfoIcon,
  success: CheckCircleIcon,
  warning: WarningIcon
}
