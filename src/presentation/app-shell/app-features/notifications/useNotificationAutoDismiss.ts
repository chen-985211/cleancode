import { useLayoutEffect, useRef } from 'react'

import type { AppNotification } from '../../../shared/notifications/appNotifications'
import { notificationOccurrenceKey } from './notificationIdentity'

interface NotificationDisplayBudget {
  readonly occurrence: string
  readonly duration: number
  remaining: number
}

export function useNotificationAutoDismiss({
  notification,
  open,
  paused,
  onDismiss
}: {
  readonly notification: AppNotification
  readonly open: boolean
  readonly paused: boolean
  readonly onDismiss: (id: string) => void
}): void {
  const budgetRef = useRef<NotificationDisplayBudget | null>(null)
  const occurrence = notificationOccurrenceKey(notification)
  const duration = notification.autoDismissMs

  useLayoutEffect(() => {
    if (!open || !duration || duration <= 0) {
      budgetRef.current = null
      return
    }
    if (budgetRef.current?.occurrence !== occurrence || budgetRef.current.duration !== duration) {
      budgetRef.current = { occurrence, duration, remaining: duration }
    }
    const budget = budgetRef.current
    if (paused) return
    const startedAt = performance.now()
    const timeout = window.setTimeout(() => {
      if (budgetRef.current !== budget) return
      budget.remaining = 0
      onDismiss(notification.id)
    }, budget.remaining)
    return () => {
      window.clearTimeout(timeout)
      budget.remaining = Math.max(0, budget.remaining - (performance.now() - startedAt))
    }
  }, [duration, notification.id, occurrence, onDismiss, open, paused])
}
