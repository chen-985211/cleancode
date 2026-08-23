import { useCallback, useEffect, useRef } from 'react'

import type { WorkflowRunSnapshot } from '../../contexts/run/application/dto/WorkflowRunSnapshot'
import type { CanvasObjectIdentity } from '../../shared-kernel/domain/value-objects/CanvasObjectIdentity'
import type { AppNotificationController } from './appNotifications'
import { createWorkflowRunNotification } from './terminalWorkflowNotifications'
import { useI18n } from './i18n/useI18n'

interface UseTerminalWorkflowNotificationsInput {
  readonly isStopping: boolean
  readonly notifications: AppNotificationController
  readonly onNavigateToTarget: (target: CanvasObjectIdentity) => Promise<void> | void
  readonly onStop: () => Promise<void> | void
  readonly projectId: string | null
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
  onNavigateToTarget,
  onStop,
  projectId,
  run,
  workspaceId
}: UseTerminalWorkflowNotificationsInput): void {
  const { t } = useI18n()
  const publishedByScope = useRef(new Map<string, PublishedWorkflowNotification>())
  const navigateToTargetRef = useRef(onNavigateToTarget)
  navigateToTargetRef.current = onNavigateToTarget
  const navigateToTarget = useCallback(
    (target: CanvasObjectIdentity): Promise<void> | void => navigateToTargetRef.current(target),
    []
  )
  const { dismiss, notify, update } = notifications
  const scopeKey = createWorkflowScopeKey(projectId, workspaceId)

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
    if (
      !run ||
      !scopeKey ||
      !projectId ||
      !workspaceId ||
      run.projectId !== projectId ||
      run.workspaceId !== workspaceId
    ) {
      return
    }

    const existing = publishedByScope.current.get(scopeKey)
    if (existing?.runId === run.id && existing.terminalStatusPublished) {
      return
    }

    const notification = createWorkflowRunNotification(
      run,
      { isStopping, onNavigateToTarget: navigateToTarget, onStop },
      t
    )
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
  }, [
    isStopping,
    navigateToTarget,
    notify,
    onStop,
    projectId,
    run,
    scopeKey,
    t,
    update,
    workspaceId
  ])
}

function createWorkflowScopeKey(
  projectId: string | null,
  workspaceId: string | null
): string | null {
  return projectId && workspaceId ? JSON.stringify([projectId, workspaceId]) : null
}
