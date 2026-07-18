export type AppNotificationKind = 'info' | 'success' | 'warning' | 'error'

interface AppNotificationAction {
  readonly disabled?: boolean
  readonly label: string
  readonly onClick: () => Promise<void> | void
  readonly pendingLabel?: string
  readonly tone?: 'default' | 'danger'
}

export interface AppNotificationInput {
  readonly action?: AppNotificationAction
  readonly autoDismissMs?: number
  readonly isActivity?: boolean
  readonly kind: AppNotificationKind
  readonly message?: string
  readonly title: string
}

export interface AppNotification extends AppNotificationInput {
  readonly id: string
}

export type NotifyApp = (notification: AppNotificationInput) => string
type UpdateAppNotification = (notificationId: string, notification: AppNotificationInput) => boolean

export interface AppNotificationController {
  readonly dismiss: (notificationId: string) => void
  readonly notify: NotifyApp
  readonly update: UpdateAppNotification
}

export const ignoreAppNotifications: AppNotificationController = {
  dismiss: () => undefined,
  notify: () => '',
  update: () => false
}
