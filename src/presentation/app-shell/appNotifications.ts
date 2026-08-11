import type { ReactNode } from 'react'

export type AppNotificationKind = 'info' | 'success' | 'warning' | 'error'

export interface AppNotificationIdentity {
  readonly key: string
  readonly occurrenceId: string
  readonly revision?: number
}

interface AppNotificationAction {
  readonly disabled?: boolean
  readonly icon: 'retry' | 'stop'
  readonly label: string
  readonly onClick: () => Promise<void> | void
  readonly pendingLabel?: string
  readonly tone?: 'default' | 'danger'
}

export interface AppNotificationSource {
  readonly detail?: string
  readonly label: string
}

interface AppNotificationTitleStatus {
  readonly icon: ReactNode
  readonly label: string
}

export interface AppNotificationInput {
  readonly accessibleLabel?: string
  readonly action?: AppNotificationAction
  readonly autoDismissMs?: number
  readonly identity?: AppNotificationIdentity
  readonly isActivity?: boolean
  readonly kind: AppNotificationKind
  readonly leadingIcon?: ReactNode
  readonly message?: string
  readonly source?: AppNotificationSource
  readonly title: string
  readonly titleStatus?: AppNotificationTitleStatus
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
