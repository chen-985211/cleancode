import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

import { resolveUserFacingErrorMessage } from '../shared/errors/appErrorMessages'
import type {
  AppNotificationController,
  AppNotificationInput
} from '../shared/notifications/appNotifications'
import type { Translate } from '../i18n/messages'
import { useI18n } from '../i18n/useI18n'
import type { WorkbenchSnapshot } from './types'
import { resolveCurrentWorkbenchAfterRemoval } from './workbenchListUpdates'

interface UseProjectActionsInput {
  readonly notifications: AppNotificationController
  readonly rememberWorkbench: (workbench: WorkbenchSnapshot) => void
  readonly setCurrentWorkbench: Dispatch<SetStateAction<WorkbenchSnapshot | null>>
  readonly setHoveredTerminalBlockId: Dispatch<SetStateAction<string | null>>
  readonly setSelectedTerminalBlockIds: Dispatch<SetStateAction<string[]>>
  readonly setSelectedTerminalGroupId: Dispatch<SetStateAction<string | null>>
  readonly setWorkbenches: Dispatch<SetStateAction<WorkbenchSnapshot[]>>
  readonly terminateWorkbenchTerminalSessions: (workbench: WorkbenchSnapshot) => Promise<void>
}

type ProjectActionFallbackKey =
  'projectAction.addFailed' | 'projectAction.removeFailed' | 'sidebar.reorderFailed'

type ProjectActionTitleKey =
  | 'projectAction.addFailedTitle'
  | 'projectAction.removeFailedTitle'
  | 'projectAction.reorderFailedTitle'

interface PublishedProjectActionError {
  readonly error: unknown
  readonly fallbackKey: ProjectActionFallbackKey
  readonly notificationId: string
  readonly occurrenceId: string
  readonly titleKey: ProjectActionTitleKey
}

export function useProjectActions({
  notifications,
  rememberWorkbench,
  setCurrentWorkbench,
  setHoveredTerminalBlockId,
  setSelectedTerminalBlockIds,
  setSelectedTerminalGroupId,
  setWorkbenches,
  terminateWorkbenchTerminalSessions
}: UseProjectActionsInput) {
  const { t } = useI18n()
  const [isReorderingProject, setIsReorderingProject] = useState(false)
  const isReorderingProjectRef = useRef(false)
  const notificationsRef = useRef(notifications)
  const publishedActionErrorsRef = useRef(new Map<string, PublishedProjectActionError>())
  const translateRef = useRef(t)
  const currentActionOccurrenceIdsRef = useRef(new Map<string, string>())

  useEffect(() => {
    notificationsRef.current = notifications
    translateRef.current = t
  }, [notifications, t])

  useEffect(() => {
    for (const [key, published] of publishedActionErrorsRef.current) {
      if (publishedActionErrorsRef.current.get(key) !== published) continue

      const updated = notifications.update(
        published.notificationId,
        createProjectActionErrorNotification(key, published, t)
      )
      if (!updated && publishedActionErrorsRef.current.get(key) === published) {
        publishedActionErrorsRef.current.delete(key)
      }
    }
  }, [notifications, t])

  const dismissPublishedActionError = useCallback((key: string): void => {
    const published = publishedActionErrorsRef.current.get(key)
    publishedActionErrorsRef.current.delete(key)
    if (published) notificationsRef.current.dismiss(published.notificationId)
  }, [])
  const beginActionAttempt = useCallback(
    (key: string): string => {
      const occurrenceId = createProjectActionOccurrenceId()
      currentActionOccurrenceIdsRef.current.set(key, occurrenceId)
      dismissPublishedActionError(key)
      return occurrenceId
    },
    [dismissPublishedActionError]
  )
  const settleCurrentActionAttempt = useCallback((key: string, occurrenceId: string): boolean => {
    if (currentActionOccurrenceIdsRef.current.get(key) !== occurrenceId) return false

    currentActionOccurrenceIdsRef.current.delete(key)
    return true
  }, [])
  const isCurrentActionAttempt = useCallback(
    (key: string, occurrenceId: string): boolean =>
      currentActionOccurrenceIdsRef.current.get(key) === occurrenceId,
    []
  )
  const completeActionAttempt = useCallback(
    (key: string, occurrenceId: string): void => {
      if (!settleCurrentActionAttempt(key, occurrenceId)) return
      dismissPublishedActionError(key)
    },
    [dismissPublishedActionError, settleCurrentActionAttempt]
  )
  const publishActionError = useCallback(
    ({
      error,
      fallbackKey,
      key,
      occurrenceId,
      titleKey
    }: {
      readonly error: unknown
      readonly fallbackKey: ProjectActionFallbackKey
      readonly key: string
      readonly occurrenceId: string
      readonly titleKey: ProjectActionTitleKey
    }): void => {
      if (!settleCurrentActionAttempt(key, occurrenceId)) return

      const descriptor = { error, fallbackKey, occurrenceId, titleKey }
      const notificationId = notificationsRef.current.notify(
        createProjectActionErrorNotification(key, descriptor, translateRef.current)
      )
      if (notificationId) {
        publishedActionErrorsRef.current.set(key, { ...descriptor, notificationId })
      }
    },
    [settleCurrentActionAttempt]
  )
  const addProject = useCallback(async () => {
    const key = 'project:add'
    const occurrenceId = beginActionAttempt(key)

    try {
      const workbench = await window.cleancode?.addProject()

      if (!isCurrentActionAttempt(key, occurrenceId)) return
      if (workbench) {
        rememberWorkbench(workbench)
      }
      completeActionAttempt(key, occurrenceId)
    } catch (error) {
      publishActionError({
        error,
        fallbackKey: 'projectAction.addFailed',
        key,
        occurrenceId,
        titleKey: 'projectAction.addFailedTitle'
      })
    }
  }, [
    beginActionAttempt,
    completeActionAttempt,
    isCurrentActionAttempt,
    publishActionError,
    rememberWorkbench
  ])

  const removeProject = useCallback(
    async (workbench: WorkbenchSnapshot) => {
      const key = createProjectActionKey(workbench.project.id, 'remove')
      const occurrenceId = beginActionAttempt(key)

      try {
        await terminateWorkbenchTerminalSessions(workbench)
        if (!isCurrentActionAttempt(key, occurrenceId)) return

        const rememberedWorkbenches = await window.cleancode?.removeProject({
          projectDirectory: workbench.project.directory
        })

        if (!isCurrentActionAttempt(key, occurrenceId)) return
        if (!rememberedWorkbenches) {
          completeActionAttempt(key, occurrenceId)
          return
        }

        setSelectedTerminalBlockIds([])
        setSelectedTerminalGroupId(null)
        setHoveredTerminalBlockId(null)
        setWorkbenches(rememberedWorkbenches)
        setCurrentWorkbench((current) =>
          resolveCurrentWorkbenchAfterRemoval(current, workbench, rememberedWorkbenches)
        )
        completeActionAttempt(key, occurrenceId)
      } catch (error) {
        publishActionError({
          error,
          fallbackKey: 'projectAction.removeFailed',
          key,
          occurrenceId,
          titleKey: 'projectAction.removeFailedTitle'
        })
      }
    },
    [
      beginActionAttempt,
      completeActionAttempt,
      isCurrentActionAttempt,
      publishActionError,
      setCurrentWorkbench,
      setHoveredTerminalBlockId,
      setSelectedTerminalBlockIds,
      setSelectedTerminalGroupId,
      setWorkbenches,
      terminateWorkbenchTerminalSessions
    ]
  )

  const reorderProject = useCallback(
    async (workbench: WorkbenchSnapshot, beforeProjectDirectory: string | null): Promise<void> => {
      if (isReorderingProjectRef.current) {
        return
      }

      const key = createProjectActionKey(workbench.project.id, 'reorder')
      const occurrenceId = beginActionAttempt(key)
      isReorderingProjectRef.current = true
      setIsReorderingProject(true)

      try {
        const reorderedWorkbenches = await window.cleancode?.reorderProject({
          projectDirectory: workbench.project.directory,
          beforeProjectDirectory
        })

        if (!isCurrentActionAttempt(key, occurrenceId)) return
        if (!reorderedWorkbenches) {
          completeActionAttempt(key, occurrenceId)
          return
        }

        setWorkbenches(reorderedWorkbenches)
        setCurrentWorkbench((current) =>
          current
            ? (reorderedWorkbenches.find(
                (entry) => entry.project.directory === current.project.directory
              ) ?? current)
            : null
        )
        completeActionAttempt(key, occurrenceId)
      } catch (error) {
        publishActionError({
          error,
          fallbackKey: 'sidebar.reorderFailed',
          key,
          occurrenceId,
          titleKey: 'projectAction.reorderFailedTitle'
        })
      } finally {
        isReorderingProjectRef.current = false
        setIsReorderingProject(false)
      }
    },
    [
      beginActionAttempt,
      completeActionAttempt,
      isCurrentActionAttempt,
      publishActionError,
      setCurrentWorkbench,
      setWorkbenches
    ]
  )

  return {
    addProject,
    isReorderingProject,
    removeProject,
    reorderProject
  }
}

function createProjectActionKey(projectId: string, action: 'remove' | 'reorder'): string {
  return `project:${projectId}:${action}`
}

function createProjectActionOccurrenceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `project-action-${Date.now()}-${Math.random()}`
}

function createProjectActionErrorNotification(
  key: string,
  descriptor: Omit<PublishedProjectActionError, 'notificationId'>,
  t: Translate
): AppNotificationInput {
  return {
    identity: { key, occurrenceId: descriptor.occurrenceId },
    kind: 'error',
    message: resolveUserFacingErrorMessage(descriptor.error, descriptor.fallbackKey, t),
    title: t(descriptor.titleKey)
  }
}
