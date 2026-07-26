import { useEffect, useRef } from 'react'

import type { WorkflowRunSnapshot } from '../../contexts/run/application/dto/WorkflowRunSnapshot'
import type { AppNotificationController } from './appNotifications'
import { createWorkflowRunNotification } from './terminalWorkflowNotifications'
import { useI18n } from './i18n/useI18n'

interface UseTerminalWorkflowNotificationsInput {
  readonly isStopping: boolean
  readonly notifications: AppNotificationController
  readonly onStop: () => Promise<void> | void
  readonly projectDirectory: string | null
  readonly run: WorkflowRunSnapshot | null
  readonly workspaceId: string | null
}

interface PublishedWorkflowNotification {
  hiddenByScopeChange: boolean
  notificationId: string
  runId: string
  terminalStatusPublished: boolean
}

export function useTerminalWorkflowNotifications({
  isStopping,
  notifications,
  onStop,
  projectDirectory,
  run,
  workspaceId
}: UseTerminalWorkflowNotificationsInput): void {
  const { t } = useI18n()
  const publishedByScope = useRef(new Map<string, PublishedWorkflowNotification>())
  const { dismiss, notify, update } = notifications
  const scopeKey = createWorkflowScopeKey(projectDirectory, workspaceId)

  useEffect(
    () => () => {
      if (!scopeKey) {
        return
      }

      const published = publishedByScope.current.get(scopeKey)
      if (published) {
        dismiss(published.notificationId)
        published.hiddenByScopeChange = true
      }
    },
    [dismiss, scopeKey]
  )

  useEffect(() => {
    if (!run || !scopeKey || !workspaceId || run.workspaceId !== workspaceId) {
      return
    }

    const existing = publishedByScope.current.get(scopeKey)
    if (existing?.runId === run.id && existing.terminalStatusPublished) {
      return
    }

    const notification = createWorkflowRunNotification(run, { isStopping, onStop }, t)
    const isTerminalStatus =
      run.status === 'failed' || run.status === 'succeeded' || run.status === 'stopped'

    if (!existing || existing.runId !== run.id) {
      publishedByScope.current.set(scopeKey, {
        hiddenByScopeChange: false,
        notificationId: notify(notification),
        runId: run.id,
        terminalStatusPublished: isTerminalStatus
      })
      return
    }

    const isVisible = update(existing.notificationId, notification)
    existing.terminalStatusPublished = isTerminalStatus

    if (
      !isVisible &&
      (run.status === 'failed' || (!isTerminalStatus && existing.hiddenByScopeChange))
    ) {
      existing.notificationId = notify(notification)
    }
    existing.hiddenByScopeChange = false
  }, [isStopping, notify, onStop, run, scopeKey, t, update, workspaceId])
}

function createWorkflowScopeKey(
  projectDirectory: string | null,
  workspaceId: string | null
): string | null {
  return projectDirectory && workspaceId ? JSON.stringify([projectDirectory, workspaceId]) : null
}
