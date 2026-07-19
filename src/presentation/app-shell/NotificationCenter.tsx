import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react'
import { useEffect, useRef, useState, type ComponentType } from 'react'

import type { AppNotification, AppNotificationKind } from './appNotifications'
import { useI18n } from './i18n/useI18n'

interface NotificationCenterProps {
  readonly notifications: readonly AppNotification[]
  readonly onDismiss: (notificationId: string) => void
}

export function NotificationCenter({ notifications, onDismiss }: NotificationCenterProps) {
  const { t } = useI18n()
  if (notifications.length === 0) {
    return null
  }

  return (
    <div className="notification-viewport" aria-label={t('notifications.label')}>
      {notifications.map((notification) => (
        <NotificationCard key={notification.id} notification={notification} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

interface NotificationCardProps {
  readonly notification: AppNotification
  readonly onDismiss: (notificationId: string) => void
}

function NotificationCard({ notification, onDismiss }: NotificationCardProps) {
  const { t } = useI18n()
  const [isActionPending, setIsActionPending] = useState(false)
  const isMounted = useRef(true)

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!notification.autoDismissMs || notification.autoDismissMs <= 0) {
      return undefined
    }

    const timeoutId = window.setTimeout(
      () => onDismiss(notification.id),
      notification.autoDismissMs
    )

    return () => window.clearTimeout(timeoutId)
  }, [notification.autoDismissMs, notification.id, onDismiss])

  const Icon = notification.isActivity ? LoaderCircle : notificationIcons[notification.kind]
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
    >
      <span className="notification-card__icon" aria-hidden="true">
        <Icon
          className={notification.isActivity ? 'notification-card__spinner' : undefined}
          size={17}
          strokeWidth={2}
        />
      </span>
      <div className="notification-card__content">
        <strong className="notification-card__title">{notification.title}</strong>
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
      <button
        className="notification-card__dismiss"
        type="button"
        aria-label={t('notifications.dismiss', { title: notification.title })}
        title={t('notifications.dismissTitle')}
        onClick={() => onDismiss(notification.id)}
      >
        <X size={15} aria-hidden="true" />
      </button>
    </section>
  )
}

const notificationIcons: Record<
  AppNotificationKind,
  ComponentType<{ size: number; strokeWidth: number }>
> = {
  error: CircleAlert,
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert
}
