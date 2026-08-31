import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'

import type { AppNotificationInput } from '../shared/notifications/appNotifications'
import {
  completeAppMessageExit,
  createAppMessageStore,
  dismissAppMessage,
  publishAppMessage,
  updateAppMessage,
  type AppMessageStore
} from './appMessageStore'
import { NotificationCenter } from './NotificationCenter'
import { NotificationContext } from './useNotifications'

export function NotificationProvider({ children }: { readonly children: ReactNode }) {
  const [messageStore, setMessageStore] = useState(createAppMessageStore)
  const messageStoreRef = useRef(messageStore)
  const commit = useCallback((nextStore: AppMessageStore): void => {
    if (nextStore === messageStoreRef.current) return

    messageStoreRef.current = nextStore
    setMessageStore(nextStore)
  }, [])
  const dismiss = useCallback(
    (notificationId: string) => {
      commit(dismissAppMessage(messageStoreRef.current, notificationId))
    },
    [commit]
  )
  const notify = useCallback(
    (notification: AppNotificationInput): string => {
      const result = publishAppMessage(messageStoreRef.current, notification)
      commit(result.store)
      return result.notificationId
    },
    [commit]
  )
  const update = useCallback(
    (notificationId: string, notification: AppNotificationInput): boolean => {
      const result = updateAppMessage(messageStoreRef.current, notificationId, notification)
      commit(result.store)
      return result.updated
    },
    [commit]
  )
  const value = useMemo(() => ({ dismiss, notify, update }), [dismiss, notify, update])
  const completeExit = useCallback(
    (notificationId: string, exitToken: number): void => {
      commit(completeAppMessageExit(messageStoreRef.current, notificationId, exitToken))
    },
    [commit]
  )
  const notifications = messageStore.messages
    .filter((message) => message.phase !== 'hidden')
    .map((message) => ({
      exitToken: message.exitToken,
      notification: message.notification,
      open: message.phase === 'open'
    }))

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationCenter
        notifications={notifications}
        onDismiss={dismiss}
        onExitComplete={completeExit}
      />
    </NotificationContext.Provider>
  )
}
