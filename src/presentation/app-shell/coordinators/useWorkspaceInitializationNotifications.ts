import { useCallback, useRef } from 'react'
import type { WorkspaceInitializationSnapshot } from '../../../contexts/project/application/dto/WorkspaceInitializationDetails'
import type { WorkbenchSnapshot } from '../types/workbenchSnapshot'
import type { AppNotificationController } from '../../shared/notifications/appNotifications'
import { resolveUserFacingErrorMessage } from '../../shared/errors/appErrorMessages'
import { useI18n } from '../../i18n/useI18n'

type ApplyAction = { readonly retryItemId?: string; readonly skipItemId?: string }

export function useWorkspaceInitializationNotifications(
  notifications: AppNotificationController,
  onApply: (workbench: WorkbenchSnapshot, action?: ApplyAction) => Promise<void>
) {
  const { t } = useI18n()
  const context = useRef({ notifications, onApply, t })
  context.current = { notifications, onApply, t }
  const published = useRef(
    new Map<string, { id: string; occurrence: string; presentation: string; revision: number }>()
  )
  const cleanups = useRef(new Map<string, string>())

  const reportCleanup = useCallback((key: string, removedIds: readonly string[]) => {
    if (!removedIds.length) return
    const signature = [...removedIds].sort().join(',')
    if (cleanups.current.get(key) === signature) return
    cleanups.current.set(key, signature)
    const { notifications, t } = context.current
    notifications.notify({
      identity: { key: `workspace-defaults-cleanup:${key}`, occurrenceId: signature },
      kind: 'info',
      title: t('workspaceInitialization.cleaned', { count: removedIds.length }),
      message: t('workspaceInitialization.cleanedDescription'),
      autoDismissMs: 4000
    })
  }, [])

  const report = useCallback(
    (
      workbench: WorkbenchSnapshot,
      snapshot: WorkspaceInitializationSnapshot,
      pending = false,
      error: unknown = null,
      announceCleanup = false
    ) => {
      const { notifications, t } = context.current
      const key = `workspace-initialization:${snapshot.id}`
      const previous = published.current.get(key)
      const unresolved = snapshot.items.filter(
        (item) =>
          item.status === 'failed' ||
          item.status === 'pending' ||
          item.runStatus === 'failed' ||
          item.runStatus === 'uncertain'
      )
      if (announceCleanup && snapshot.stage !== 'cancelled')
        reportCleanup(
          snapshot.projectDirectory,
          snapshot.items
            .filter(
              (item) =>
                item.status === 'skipped' &&
                (item.errorCode === 'BLOCK_TEMPLATE_NOT_FOUND' ||
                  item.errorCode === 'BLOCK_TEMPLATE_PROJECT_SCOPE_INVALID')
            )
            .map((item) => item.templateId!)
        )
      if (snapshot.stage === 'cancelled' || (!unresolved.length && !error)) {
        if (previous) notifications.dismiss(previous.id)
        published.current.delete(key)
        return
      }
      if (pending && !previous) return
      const failed = unresolved.find((item) => item.status === 'failed')
      const waiting = unresolved.some((item) => item.status === 'pending')
      const runProblem = unresolved.find(
        (item) => item.runStatus === 'failed' || item.runStatus === 'uncertain'
      )
      const message = error
        ? resolveUserFacingErrorMessage(error, 'workspaceDefaults.failed', t)
        : failed?.errorCode
          ? resolveUserFacingErrorMessage(
              { code: failed.errorCode, message: '', isExpected: true },
              'workspaceDefaults.failed',
              t
            )
          : runProblem
            ? t(
                runProblem.runStatus === 'uncertain'
                  ? 'workspaceInitialization.uncertain'
                  : 'workspaceInitialization.runFailed'
              )
            : t('workspaceInitialization.pending')
      const action =
        failed || waiting || error
          ? {
              icon: 'retry' as const,
              label: t(
                failed ? 'workspaceInitialization.retryFailed' : 'workspaceInitialization.continue'
              ),
              disabled: pending,
              onClick: () =>
                context.current.onApply(workbench, failed ? { retryItemId: failed.id } : undefined)
            }
          : undefined
      const occurrence = JSON.stringify([
        unresolved.map((item) => [item.id, item.status, item.errorCode, item.runStatus]),
        Boolean(error)
      ])
      const input = {
        identity: { key, occurrenceId: occurrence, revision: (previous?.revision ?? 0) + 1 },
        kind: 'error' as const,
        title: t('workspaceInitialization.notificationTitle'),
        message,
        source: { label: workbench.project.name, detail: snapshot.branchName ?? undefined },
        accessibleLabel: t('workspaceInitialization.notificationLabel', {
          project: workbench.project.name,
          branch: snapshot.branchName ?? '',
          message
        }),
        action
      }
      const presentation = JSON.stringify([input.title, message, pending, occurrence, input.source])
      if (previous?.presentation === presentation) return
      const id = previous?.occurrence === occurrence ? previous.id : notifications.notify(input)
      if (previous?.occurrence === occurrence) notifications.update(id, input)
      published.current.set(key, {
        id,
        occurrence,
        presentation,
        revision: input.identity.revision
      })
    },
    [reportCleanup]
  )
  return { report, reportCleanup }
}
