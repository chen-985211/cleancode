import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react'

import { resolveUserFacingErrorMessage } from '../../shared/errors/appErrorMessages'
import type {
  AppNotificationController,
  AppNotificationInput
} from '../../shared/notifications/appNotifications'
import type { Translate } from '../../i18n/messages'
import { useI18n } from '../../i18n/useI18n'
import { manualWorkspaceSelectionBrowserEventName } from './useTerminalWorkspaceSynchronization'
import type { WorkbenchSnapshot } from '../types/workbenchSnapshot'

interface UseBranchWorkspaceActionsInput {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly notifications: AppNotificationController
  readonly replaceWorkbench: (workbench: WorkbenchSnapshot) => void
  readonly setHoveredTerminalBlockId: Dispatch<SetStateAction<string | null>>
  readonly setSelectedTerminalBlockId: Dispatch<SetStateAction<string | null>>
  readonly terminateWorkspaceTerminalSessions: (
    workbench: WorkbenchSnapshot,
    workspaceId: string
  ) => Promise<void>
  readonly forgetWorkspaceTerminalStates: (projectId: string, workspaceId: string) => void
}

type WorkspaceActionFallbackKey =
  | 'workspaceAction.selectFailed'
  | 'workspaceAction.createFailed'
  | 'workspaceAction.archiveFailed'
  | 'workspaceAction.checkoutFailed'

type WorkspaceActionTitleKey =
  | 'workspaceAction.selectFailedTitle'
  | 'workspaceAction.createFailedTitle'
  | 'workspaceAction.archiveFailedTitle'
  | 'workspaceAction.checkoutFailedTitle'

interface PublishedWorkspaceActionError {
  readonly error: unknown
  readonly fallbackKey: WorkspaceActionFallbackKey
  readonly notificationId: string
  readonly occurrenceId: string
  readonly titleKey: WorkspaceActionTitleKey
}

export type WorkspaceSelectionResult = 'failed' | 'selected' | 'superseded'

export function useBranchWorkspaceActions({
  currentWorkbench,
  notifications,
  replaceWorkbench,
  setHoveredTerminalBlockId,
  setSelectedTerminalBlockId,
  terminateWorkspaceTerminalSessions,
  forgetWorkspaceTerminalStates
}: UseBranchWorkspaceActionsInput) {
  const { t } = useI18n()
  const notificationsRef = useRef(notifications)
  const publishedActionErrorsRef = useRef(new Map<string, PublishedWorkspaceActionError>())
  const translateRef = useRef(t)
  const currentActionOccurrenceIdsRef = useRef(new Map<string, string>())
  const currentSelectionAttemptRef = useRef<{
    readonly key: string
    readonly occurrenceId: string
  } | null>(null)

  useEffect(() => {
    notificationsRef.current = notifications
    translateRef.current = t
  }, [notifications, t])

  useEffect(() => {
    for (const [key, published] of publishedActionErrorsRef.current) {
      if (publishedActionErrorsRef.current.get(key) !== published) continue

      const updated = notifications.update(
        published.notificationId,
        createWorkspaceActionErrorNotification(key, published, t)
      )
      if (!updated && publishedActionErrorsRef.current.get(key) === published) {
        publishedActionErrorsRef.current.delete(key)
      }
    }
  }, [notifications, t])

  const clearCurrentBlockSelection = useCallback(() => {
    setSelectedTerminalBlockId(null)
    setHoveredTerminalBlockId(null)
  }, [setHoveredTerminalBlockId, setSelectedTerminalBlockId])
  const dismissPublishedActionError = useCallback((key: string): void => {
    const published = publishedActionErrorsRef.current.get(key)
    publishedActionErrorsRef.current.delete(key)
    if (published) notificationsRef.current.dismiss(published.notificationId)
  }, [])
  const beginActionAttempt = useCallback(
    (key: string): string => {
      const occurrenceId = createWorkspaceActionOccurrenceId()
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
  const beginSelectionAttempt = useCallback(
    (key: string): string => {
      const previous = currentSelectionAttemptRef.current
      if (
        previous &&
        currentActionOccurrenceIdsRef.current.get(previous.key) === previous.occurrenceId
      ) {
        currentActionOccurrenceIdsRef.current.delete(previous.key)
      }

      const occurrenceId = beginActionAttempt(key)
      currentSelectionAttemptRef.current = { key, occurrenceId }
      return occurrenceId
    },
    [beginActionAttempt]
  )
  const isCurrentSelectionAttempt = useCallback(
    (key: string, occurrenceId: string): boolean => {
      const current = currentSelectionAttemptRef.current
      return (
        current?.key === key &&
        current.occurrenceId === occurrenceId &&
        isCurrentActionAttempt(key, occurrenceId)
      )
    },
    [isCurrentActionAttempt]
  )
  const settleSelectionAttempt = useCallback(
    (key: string, occurrenceId: string): boolean => {
      if (!isCurrentSelectionAttempt(key, occurrenceId)) return false
      currentSelectionAttemptRef.current = null
      return settleCurrentActionAttempt(key, occurrenceId)
    },
    [isCurrentSelectionAttempt, settleCurrentActionAttempt]
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
      readonly fallbackKey: WorkspaceActionFallbackKey
      readonly key: string
      readonly occurrenceId: string
      readonly titleKey: WorkspaceActionTitleKey
    }): void => {
      if (!settleCurrentActionAttempt(key, occurrenceId)) return

      const descriptor = { error, fallbackKey, occurrenceId, titleKey }
      const notificationId = notificationsRef.current.notify(
        createWorkspaceActionErrorNotification(key, descriptor, translateRef.current)
      )
      if (notificationId) {
        publishedActionErrorsRef.current.set(key, { ...descriptor, notificationId })
      }
    },
    [settleCurrentActionAttempt]
  )

  const selectWorkspaceWithResult = useCallback(
    async (
      workbench: WorkbenchSnapshot,
      workspaceId: string
    ): Promise<WorkspaceSelectionResult> => {
      const key = createWorkspaceActionKey(workbench.project.id, 'select', workspaceId)

      if (currentWorkbench?.project.id === workbench.project.id) {
        const selectedWorkspace = currentWorkbench.project.workspaces.find(
          (workspace) => workspace.workspaceId === workspaceId
        )

        if (selectedWorkspace?.isCurrent) {
          const occurrenceId = beginSelectionAttempt(key)
          settleSelectionAttempt(key, occurrenceId)
          dismissPublishedActionError(key)
          return 'selected'
        }
      }

      const occurrenceId = beginSelectionAttempt(key)

      try {
        const switchedWorkbench = await window.cleancode?.switchBranchWorkspace({
          projectDirectory: workbench.project.directory,
          workspaceId
        })

        if (!isCurrentSelectionAttempt(key, occurrenceId)) return 'superseded'
        if (switchedWorkbench) {
          window.dispatchEvent(new CustomEvent(manualWorkspaceSelectionBrowserEventName))
          clearCurrentBlockSelection()
          replaceWorkbench(switchedWorkbench)
        }
        if (settleSelectionAttempt(key, occurrenceId)) dismissPublishedActionError(key)
        return switchedWorkbench ? 'selected' : 'failed'
      } catch (error) {
        if (!isCurrentSelectionAttempt(key, occurrenceId)) return 'superseded'
        currentSelectionAttemptRef.current = null
        publishActionError({
          error,
          fallbackKey: 'workspaceAction.selectFailed',
          key,
          occurrenceId,
          titleKey: 'workspaceAction.selectFailedTitle'
        })
        return 'failed'
      }
    },
    [
      clearCurrentBlockSelection,
      beginSelectionAttempt,
      currentWorkbench,
      dismissPublishedActionError,
      isCurrentSelectionAttempt,
      publishActionError,
      replaceWorkbench,
      settleSelectionAttempt
    ]
  )
  const selectWorkspace = useCallback(
    async (workbench: WorkbenchSnapshot, workspaceId: string): Promise<void> => {
      await selectWorkspaceWithResult(workbench, workspaceId)
    },
    [selectWorkspaceWithResult]
  )

  const createBranchWorkspace = useCallback(
    async (workbench: WorkbenchSnapshot, branchName: string): Promise<void> => {
      const key = createWorkspaceActionKey(workbench.project.id, 'create')
      const occurrenceId = beginActionAttempt(key)

      try {
        const createdWorkbench = await window.cleancode?.createBranchWorkspace({
          projectDirectory: workbench.project.directory,
          branchName
        })

        if (!isCurrentActionAttempt(key, occurrenceId)) return
        if (!createdWorkbench) {
          completeActionAttempt(key, occurrenceId)
          return
        }

        clearCurrentBlockSelection()
        replaceWorkbench(createdWorkbench)
        completeActionAttempt(key, occurrenceId)
      } catch (error) {
        publishActionError({
          error,
          fallbackKey: 'workspaceAction.createFailed',
          key,
          occurrenceId,
          titleKey: 'workspaceAction.createFailedTitle'
        })
      }
    },
    [
      beginActionAttempt,
      clearCurrentBlockSelection,
      completeActionAttempt,
      isCurrentActionAttempt,
      publishActionError,
      replaceWorkbench
    ]
  )

  const archiveBranchWorkspace = useCallback(
    async (
      workbench: WorkbenchSnapshot,
      workspaceId: string,
      lockedWorktreeConfirmation?: { readonly lockReason: string | null }
    ): Promise<void> => {
      const key = createWorkspaceActionKey(workbench.project.id, 'archive', workspaceId)
      const occurrenceId = beginActionAttempt(key)

      try {
        const selectedWorkspace = currentWorkbench?.project.workspaces.find(
          (workspace) => workspace.workspaceId === workspaceId
        )
        const shouldTerminateCurrentWorkspace =
          currentWorkbench?.project.id === workbench.project.id &&
          Boolean(selectedWorkspace?.isCurrent)

        if (shouldTerminateCurrentWorkspace && currentWorkbench) {
          await terminateWorkspaceTerminalSessions(currentWorkbench, workspaceId)
          if (!isCurrentActionAttempt(key, occurrenceId)) return
        }

        const archivedWorkbench = await window.cleancode?.archiveBranchWorkspace({
          projectDirectory: workbench.project.directory,
          workspaceId,
          ...(lockedWorktreeConfirmation ? { lockedWorktreeConfirmation } : {})
        })

        if (!isCurrentActionAttempt(key, occurrenceId)) return
        if (archivedWorkbench) {
          forgetWorkspaceTerminalStates(workbench.project.id, workspaceId)
          clearCurrentBlockSelection()
          replaceWorkbench(archivedWorkbench)
        }
        completeActionAttempt(key, occurrenceId)
      } catch (error) {
        publishActionError({
          error,
          fallbackKey: 'workspaceAction.archiveFailed',
          key,
          occurrenceId,
          titleKey: 'workspaceAction.archiveFailedTitle'
        })
      }
    },
    [
      beginActionAttempt,
      clearCurrentBlockSelection,
      completeActionAttempt,
      currentWorkbench,
      isCurrentActionAttempt,
      replaceWorkbench,
      publishActionError,
      terminateWorkspaceTerminalSessions,
      forgetWorkspaceTerminalStates
    ]
  )

  const checkoutMainBranch = useCallback(
    async (workbench: WorkbenchSnapshot, branchName: string): Promise<void> => {
      const key = createWorkspaceActionKey(workbench.project.id, 'checkout-main')
      const occurrenceId = beginActionAttempt(key)

      try {
        const checkedOutWorkbench = await window.cleancode?.checkoutMainWorkspaceBranch({
          projectDirectory: workbench.project.directory,
          branchName
        })

        if (!isCurrentActionAttempt(key, occurrenceId)) return
        if (checkedOutWorkbench) {
          replaceWorkbench(checkedOutWorkbench)
        }
        completeActionAttempt(key, occurrenceId)
      } catch (error) {
        publishActionError({
          error,
          fallbackKey: 'workspaceAction.checkoutFailed',
          key,
          occurrenceId,
          titleKey: 'workspaceAction.checkoutFailedTitle'
        })
      }
    },
    [
      beginActionAttempt,
      completeActionAttempt,
      isCurrentActionAttempt,
      publishActionError,
      replaceWorkbench
    ]
  )

  return {
    archiveBranchWorkspace,
    checkoutMainBranch,
    createBranchWorkspace,
    selectWorkspace,
    selectWorkspaceWithResult
  }
}

type WorkspaceAction = 'archive' | 'checkout-main' | 'create' | 'select'

function createWorkspaceActionKey(
  projectId: string,
  action: WorkspaceAction,
  workspaceId?: string
): string {
  return workspaceId
    ? `workspace:${projectId}:${workspaceId}:${action}`
    : `workspace:${projectId}:${action}`
}

function createWorkspaceActionOccurrenceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `workspace-action-${Date.now()}-${Math.random()}`
}

function createWorkspaceActionErrorNotification(
  key: string,
  descriptor: Omit<PublishedWorkspaceActionError, 'notificationId'>,
  t: Translate
): AppNotificationInput {
  return {
    identity: { key, occurrenceId: descriptor.occurrenceId },
    kind: 'error',
    message: resolveUserFacingErrorMessage(descriptor.error, descriptor.fallbackKey, t),
    title: t(descriptor.titleKey)
  }
}
