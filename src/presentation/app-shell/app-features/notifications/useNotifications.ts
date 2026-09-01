import { createContext, useContext } from 'react'

import type { AppNotificationController } from '../../../shared/notifications/appNotifications'
import { ignoreAppNotifications } from '../../../shared/notifications/appNotifications'

export type NotificationContextValue = AppNotificationController

export const NotificationContext = createContext<AppNotificationController | null>(null)

export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext)

  if (!context) {
    throw new Error('useNotifications must be used inside NotificationProvider.')
  }

  return context
}

export function useOptionalNotifications(): NotificationContextValue {
  return useContext(NotificationContext) ?? ignoreAppNotifications
}
