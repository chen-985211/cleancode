import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'

import type { AppNotificationInput } from './appNotifications'
import { NotificationCenter, type AppNotificationPresentation } from './NotificationCenter'
import { NotificationContext } from './useNotifications'

export function NotificationProvider({ children }: { readonly children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotificationPresentation[]>([])
  const notificationIds = useRef(new Set<string>())
  const nextNotificationId = useRef(0)
  const dismiss = useCallback((notificationId: string) => {
    notificationIds.current.delete(notificationId)
    setNotifications((current) =>
      current.map((presentation) =>
        presentation.notification.id === notificationId
          ? { ...presentation, open: false }
          : presentation
      )
    )
  }, [])
  const notify = useCallback((notification: AppNotificationInput): string => {
    nextNotificationId.current += 1
    const id = `app-notification-${nextNotificationId.current}`

    notificationIds.current.add(id)
    setNotifications((current) => [
      ...current,
      { notification: { ...notification, id }, open: true }
    ])

    return id
  }, [])
  const update = useCallback(
    (notificationId: string, notification: AppNotificationInput): boolean => {
      if (!notificationIds.current.has(notificationId)) {
        return false
      }

      setNotifications((current) =>
        current.map((presentation) =>
          presentation.notification.id === notificationId
            ? { ...presentation, notification: { ...notification, id: notificationId } }
            : presentation
        )
      )
      return true
    },
    []
  )
  const value = useMemo(() => ({ dismiss, notify, update }), [dismiss, notify, update])
  const removePresentedNotification = useCallback((notificationId: string): void => {
    setNotifications((current) =>
      current.filter((presentation) => presentation.notification.id !== notificationId)
    )
  }, [])

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationCenter
        notifications={notifications}
        onDismiss={dismiss}
        onExitComplete={removePresentedNotification}
      />
    </NotificationContext.Provider>
  )
}
