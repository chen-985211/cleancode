import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  WorkspaceExternalOpenCapabilitiesSnapshot,
  WorkspaceExternalOpenTarget
} from '../../application/dto/WorkspaceExternalOpen'
import type { ProjectSnapshot } from '../../application/dto/ProjectSnapshot'
import { getAppErrorCode } from '../../../../shared-kernel/application/errors/AppError'
import { resolveUserFacingErrorMessage } from '../../../../presentation/shared/errors/appErrorMessages'
import type {
  AppNotificationController,
  AppNotificationInput
} from '../../../../presentation/shared/notifications/appNotifications'
import type { Translate } from '../../../../presentation/i18n/messages'
import { useI18n } from '../../../../presentation/i18n/useI18n'

type CurrentWorkspace = ProjectSnapshot['workspaces'][number]

interface UseWorkspaceExternalOpenInput {
  readonly currentProject: ProjectSnapshot | null
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
  currentProject,
  currentWorkspace,
  notifications
}: UseWorkspaceExternalOpenInput) {
  const { t } = useI18n()
  const [capabilities, setCapabilities] =
    useState<WorkspaceExternalOpenCapabilitiesSnapshot>(unavailableCapabilities)
  const [isPending, setIsPending] = useState(false)
  const capabilityDiscoveryGenerationRef = useRef(0)
  const isPendingRef = useRef(false)
  const notificationsRef = useRef(notifications)
  const publishedErrorsRef = useRef(new Map<string, PublishedWorkspaceExternalOpenError>())
  const translateRef = useRef(t)

  useEffect(() => {
    notificationsRef.current = notifications
    translateRef.current = t
  }, [notifications, t])

  const refreshCapabilities = useCallback((): void => {
    const generation = ++capabilityDiscoveryGenerationRef.current
    setCapabilities(unavailableCapabilities)
    const runtime = window.cleancode
    if (!runtime) return

    void runtime
      .getWorkspaceExternalOpenCapabilities()
      .then((nextCapabilities) => {
        if (capabilityDiscoveryGenerationRef.current === generation) {
          setCapabilities(nextCapabilities)
        }
      })
      .catch(() => {
        if (capabilityDiscoveryGenerationRef.current === generation) {
          setCapabilities(unavailableCapabilities)
        }
      })
  }, [])

  useEffect(() => {
    refreshCapabilities()
    window.addEventListener('focus', refreshCapabilities)

    return () => {
      window.removeEventListener('focus', refreshCapabilities)
      capabilityDiscoveryGenerationRef.current += 1
    }
  }, [refreshCapabilities])

  useEffect(() => {
    for (const [key, published] of publishedErrorsRef.current) {
      if (publishedErrorsRef.current.get(key) !== published) continue

      const updated = notifications.update(
        published.notificationId,
        createExternalOpenErrorNotification(published, t)
      )
      if (!updated && publishedErrorsRef.current.get(key) === published) {
        publishedErrorsRef.current.delete(key)
      }
    }
  }, [notifications, t])

  const openWorkspace = useCallback(
    async (target: WorkspaceExternalOpenTarget): Promise<void> => {
      const runtime = window.cleancode
      if (!runtime || !currentProject || !currentWorkspace || isPendingRef.current) return

      const key = `workspace:${currentProject.id}:${currentWorkspace.workspaceId}:external-open`
      const previousError = publishedErrorsRef.current.get(key)

      isPendingRef.current = true
      setIsPending(true)

      try {
        await runtime.openWorkspaceExternally({
          projectDirectory: currentProject.directory,
          target,
          workspaceId: currentWorkspace.workspaceId
        })
        if (previousError && publishedErrorsRef.current.get(key) === previousError) {
          publishedErrorsRef.current.delete(key)
          notificationsRef.current.dismiss(previousError.notificationId)
        }
      } catch (error) {
        if (target === 'vscode' && getAppErrorCode(error) === 'WORKSPACE_OPEN_TARGET_UNAVAILABLE') {
          capabilityDiscoveryGenerationRef.current += 1
          setCapabilities(unavailableCapabilities)
        }

        const published = {
          error,
          key,
          occurrenceId: createOccurrenceId()
        }
        const notificationId = notificationsRef.current.notify(
          createExternalOpenErrorNotification(published, translateRef.current)
        )
        if (notificationId) {
          publishedErrorsRef.current.set(key, { ...published, notificationId })
        }
      } finally {
        isPendingRef.current = false
        setIsPending(false)
      }
    },
    [currentProject, currentWorkspace]
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
