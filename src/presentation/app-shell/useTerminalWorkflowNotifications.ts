import { useCallback, useEffect, useRef } from 'react'

import type { WorkflowRunSnapshot } from '../../contexts/run/application/dto/WorkflowRunSnapshot'
import type { CanvasObjectIdentity } from '../../shared-kernel/domain/value-objects/CanvasObjectIdentity'
import type { AppNotificationController } from './appNotifications'
import { createWorkflowRunNotification } from './terminalWorkflowNotifications'
import { useI18n } from './i18n/useI18n'

interface UseTerminalWorkflowNotificationsInput {
  readonly notifications: AppNotificationController
  readonly onNavigateToTarget: (target: CanvasObjectIdentity) => Promise<void> | void
  readonly onStop: (runId: string) => Promise<void> | void
  readonly projectId: string | null
  readonly runs: readonly WorkflowRunSnapshot[]
  readonly stoppingRunIds: readonly string[]
  readonly workspaceId: string | null
}

interface PublishedWorkflowNotification {
  hiddenByScopeChange: boolean
  notificationId: string
  runId: string
  scopeKey: string
  terminalStatusPublished: boolean
}

export function useTerminalWorkflowNotifications({
  notifications,
  onNavigateToTarget,
  onStop,
  projectId,
  runs,
  stoppingRunIds,
  workspaceId
}: UseTerminalWorkflowNotificationsInput): void {
  const { t } = useI18n()
  const publishedByRun = useRef(new Map<string, PublishedWorkflowNotification>())
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

      for (const published of publishedByRun.current.values()) {
        if (published.scopeKey !== scopeKey) continue
        dismiss(published.notificationId)
        published.hiddenByScopeChange = true
      }
    },
    [dismiss, scopeKey]
  )

  useEffect(() => {
    if (!scopeKey || !projectId || !workspaceId) return
    const stoppingIds = new Set(stoppingRunIds)

    for (const run of runs) {
      if (run.projectId !== projectId || run.workspaceId !== workspaceId) continue
      const publicationKey = createWorkflowPublicationKey(scopeKey, run.id)
      const existing = publishedByRun.current.get(publicationKey)
      if (existing?.terminalStatusPublished) continue

      const notification = createWorkflowRunNotification(
        run,
        {
          isStopping: stoppingIds.has(run.id),
          onNavigateToTarget: navigateToTarget,
          onStop: () => onStop(run.id)
        },
        t
      )
      const isTerminalStatus =
        run.status === 'failed' || run.status === 'succeeded' || run.status === 'stopped'

      if (!existing) {
        publishedByRun.current.set(publicationKey, {
          hiddenByScopeChange: false,
          notificationId: notify(notification),
          runId: run.id,
          scopeKey,
          terminalStatusPublished: isTerminalStatus
        })
        continue
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
    }
  }, [
    navigateToTarget,
    notify,
    onStop,
    projectId,
    runs,
    scopeKey,
    stoppingRunIds,
    t,
    update,
    workspaceId
  ])
}

function createWorkflowPublicationKey(scopeKey: string, runId: string): string {
  return JSON.stringify([scopeKey, runId])
}

function createWorkflowScopeKey(
  projectId: string | null,
  workspaceId: string | null
): string | null {
  return projectId && workspaceId ? JSON.stringify([projectId, workspaceId]) : null
}
