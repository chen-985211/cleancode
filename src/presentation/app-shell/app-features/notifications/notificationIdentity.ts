import type { AppNotification } from '../../../shared/notifications/appNotifications'

export function notificationOccurrenceKey(notification: AppNotification): string {
  return notification.identity
    ? JSON.stringify([notification.identity.key, notification.identity.occurrenceId])
    : notification.id
}
