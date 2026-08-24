import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  WorkspaceExternalOpenCapabilitiesSnapshot,
  WorkspaceExternalOpenTarget
} from '../../contexts/project/application/dto/WorkspaceExternalOpen'
import { resolveUserFacingErrorMessage } from './appErrorMessages'
import type { AppNotificationController, AppNotificationInput } from './appNotifications'
import type { Translate } from './i18n/messages'
import { useI18n } from './i18n/useI18n'
import type { WorkbenchSnapshot } from './types'

type CurrentWorkspace = WorkbenchSnapshot['project']['workspaces'][number]

interface UseWorkspaceExternalOpenInput {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: CurrentWorkspace | undefined
  readonly notifications: AppNotificationController
}

interface PublishedWorkspaceExternalOpenError {
  readonly error: unknown
  readonly key: string
  readonly notificationId: string
  readonly occurrenceId: string
}

const unavailableCapabilities: WorkspaceExternalOpenCapabilitiesSnapshot = {
  vscode: { available: false }
}

export function useWorkspaceExternalOpen({
  currentWorkbench,
  currentWorkspace,
  notifications
}: UseWorkspaceExternalOpenInput) {
  const { t } = useI18n()
  const [capabilities, setCapabilities] =
    useState<WorkspaceExternalOpenCapabilitiesSnapshot>(unavailableCapabilities)
  const [isPending, setIsPending] = useState(false)
  const isPendingRef = useRef(false)
  const publishedErrorRef = useRef<PublishedWorkspaceExternalOpenError | null>(null)

  useEffect(() => {
    let cancelled = false

    void window.cleancode
      ?.getWorkspaceExternalOpenCapabilities()
      .then((nextCapabilities) => {
        if (!cancelled) setCapabilities(nextCapabilities)
      })
      .catch(() => {
        if (!cancelled) setCapabilities(unavailableCapabilities)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const published = publishedErrorRef.current
    if (!published) return

    const updated = notifications.update(
      published.notificationId,
      createExternalOpenErrorNotification(published, t)
    )
    if (!updated && publishedErrorRef.current === published) {
      publishedErrorRef.current = null
    }
  }, [notifications, t])

  const openWorkspace = useCallback(
    async (target: WorkspaceExternalOpenTarget): Promise<void> => {
      const runtime = window.cleancode
      if (!runtime || !currentWorkbench || !currentWorkspace || isPendingRef.current) return

      if (publishedErrorRef.current) {
        notifications.dismiss(publishedErrorRef.current.notificationId)
        publishedErrorRef.current = null
      }

      isPendingRef.current = true
      setIsPending(true)

      try {
        await runtime.openWorkspaceExternally({
          projectDirectory: currentWorkbench.project.directory,
          target,
          workspaceId: currentWorkspace.workspaceId
        })
      } catch (error) {
        const published = {
          error,
          key: `workspace:${currentWorkspace.workspaceId}:external-open`,
          occurrenceId: createOccurrenceId()
        }
        const notificationId = notifications.notify(
          createExternalOpenErrorNotification(published, t)
        )
        publishedErrorRef.current = notificationId ? { ...published, notificationId } : null
      } finally {
        isPendingRef.current = false
        setIsPending(false)
      }
    },
    [currentWorkbench, currentWorkspace, notifications, t]
  )

  return { capabilities, isPending, openWorkspace }
}

function createExternalOpenErrorNotification(
  published: Omit<PublishedWorkspaceExternalOpenError, 'notificationId'>,
  t: Translate
): AppNotificationInput {
  return {
    identity: {
      key: published.key,
      occurrenceId: published.occurrenceId
    },
    kind: 'error',
    message: resolveUserFacingErrorMessage(published.error, 'workspaceExternalOpen.failed', t),
    title: t('workspaceExternalOpen.failedTitle')
  }
}

function createOccurrenceId(): string {
  return `workspace-external-open-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
