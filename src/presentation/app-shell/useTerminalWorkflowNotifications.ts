import { useEffect, useRef } from 'react'

import type { WorkflowRunSnapshot } from '../../contexts/run/application/dto/WorkflowRunSnapshot'
import type { AppNotificationController } from './appNotifications'
import { createWorkflowRunNotification } from './terminalWorkflowNotifications'

interface UseTerminalWorkflowNotificationsInput {
  readonly isStopping: boolean
  readonly notifications: AppNotificationController
  readonly onStop: () => Promise<void> | void
  readonly run: WorkflowRunSnapshot | null
  readonly workspaceName: string | null
}

interface PublishedWorkflowNotification {
  notificationId: string
  terminalStatusPublished: boolean
}

export function useTerminalWorkflowNotifications({
  isStopping,
  notifications,
  onStop,
  run,
  workspaceName
}: UseTerminalWorkflowNotificationsInput): void {
  const publishedByRunId = useRef(new Map<string, PublishedWorkflowNotification>())
  const { dismiss, notify, update } = notifications

  useEffect(
    () => () => {
      for (const published of publishedByRunId.current.values()) {
        dismiss(published.notificationId)
      }
      publishedByRunId.current.clear()
    },
    [dismiss, workspaceName]
  )

  useEffect(() => {
    if (!run || !workspaceName || run.workspaceName !== workspaceName) {
      return
    }

    const existing = publishedByRunId.current.get(run.id)
    if (existing?.terminalStatusPublished) {
      return
    }

    const notification = createWorkflowRunNotification(run, { isStopping, onStop })
    const isTerminalStatus =
      run.status === 'failed' || run.status === 'succeeded' || run.status === 'stopped'

    if (!existing) {
      publishedByRunId.current.set(run.id, {
        notificationId: notify(notification),
        terminalStatusPublished: isTerminalStatus
      })
      return
    }

    const isVisible = update(existing.notificationId, notification)
    existing.terminalStatusPublished = isTerminalStatus

    if (!isVisible && run.status === 'failed') {
      existing.notificationId = notify(notification)
    }
  }, [isStopping, notify, onStop, run, update, workspaceName])
}
