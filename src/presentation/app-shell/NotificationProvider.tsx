import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'

import type { AppNotification, AppNotificationInput } from './appNotifications'
import { NotificationCenter } from './NotificationCenter'
import { NotificationContext } from './useNotifications'

export function NotificationProvider({ children }: { readonly children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const notificationIds = useRef(new Set<string>())
  const nextNotificationId = useRef(0)
  const dismiss = useCallback((notificationId: string) => {
    notificationIds.current.delete(notificationId)
    setNotifications((current) =>
      current.filter((notification) => notification.id !== notificationId)
    )
  }, [])
  const notify = useCallback((notification: AppNotificationInput): string => {
    nextNotificationId.current += 1
    const id = `app-notification-${nextNotificationId.current}`

    notificationIds.current.add(id)
    setNotifications((current) => [...current, { ...notification, id }])

    return id
  }, [])
  const update = useCallback(
    (notificationId: string, notification: AppNotificationInput): boolean => {
      if (!notificationIds.current.has(notificationId)) {
        return false
      }

      setNotifications((current) =>
        current.map((item) =>
          item.id === notificationId ? { ...notification, id: notificationId } : item
        )
      )
      return true
    },
    []
  )
  const value = useMemo(() => ({ dismiss, notify, update }), [dismiss, notify, update])

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationCenter notifications={notifications} onDismiss={dismiss} />
    </NotificationContext.Provider>
  )
}
