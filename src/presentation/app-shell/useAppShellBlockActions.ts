import { useCallback, useRef } from 'react'

import type {
  BatchTerminalRemovalTargetSnapshot,
  TerminalBlockSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { AppNotificationController } from './appNotifications'
import { resolveUserFacingErrorMessage } from './appErrorMessages'
import { useI18n } from './i18n/useI18n'
import type { WorkbenchSnapshot } from './types'

interface UseAppShellBlockActionsInput {
  readonly beginTerminalGroupSelection?: (groupId: string) => void
  readonly canCreateTerminalGroup?: boolean
  readonly completeTerminalGroupSelection?: () => void
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: WorkbenchSnapshot['project']['workspaces'][number] | undefined
  readonly notifications: AppNotificationController
  readonly setCurrentGraph: (graph: WorkbenchSnapshot['graph']) => void
  readonly selectedUngroupedTerminalBlockIds?: readonly string[]
  readonly setSelectedTerminalGroupId?: (groupId: string | null) => void
  readonly terminateTerminalSession: (block: TerminalBlockSnapshot) => Promise<void>
}

export function useAppShellBlockActions({
  beginTerminalGroupSelection,
  currentWorkbench,
  currentWorkspace,
  notifications,
  setCurrentGraph,
  terminateTerminalSession
}: UseAppShellBlockActionsInput) {
  const { t } = useI18n()
  const deletingWorkspaceScopesRef = useRef(new Set<string>())
  const createTerminalGroup = useCallback(
    async (position: { x: number; y: number } = { x: 0, y: 0 }) => {
      if (!currentWorkbench || !currentWorkspace) return

      const existingGroupIds = new Set(
        currentWorkbench.graph.terminalGroups.map((group) => group.id)
      )
      const graphSnapshot = await window.cleancode?.createTerminalGroup({
        projectDirectory: currentWorkbench.project.directory,
        workspaceId: currentWorkspace.workspaceId,
        name: t('group.defaultName', {
          index: currentWorkbench.graph.terminalGroups.length + 1
        }),
        position
      })

      if (!graphSnapshot) return

      setCurrentGraph(graphSnapshot)
      const createdGroupId = graphSnapshot.terminalGroups.find(
        (group) => !existingGroupIds.has(group.id)
      )?.id
      if (createdGroupId) beginTerminalGroupSelection?.(createdGroupId)
    },
    [beginTerminalGroupSelection, currentWorkbench, currentWorkspace, setCurrentGraph, t]
  )

  const deleteTerminalBlock = useCallback(
    async (block: TerminalBlockSnapshot) => {
      if (!currentWorkbench || !currentWorkspace) return

      await terminateTerminalSession(block)
      const graphSnapshot = await window.cleancode?.deleteBlock({
        projectDirectory: currentWorkbench.project.directory,
        workspaceId: currentWorkspace.workspaceId,
        blockId: block.id
      })

      if (graphSnapshot) setCurrentGraph(graphSnapshot)
    },
    [currentWorkbench, currentWorkspace, setCurrentGraph, terminateTerminalSession]
  )

  const deleteTerminalScope = useCallback(
    async (target: BatchTerminalRemovalTargetSnapshot): Promise<void> => {
      if (!currentWorkbench || !currentWorkspace) return
      const scopeKey = `${currentWorkbench.project.id}\0${currentWorkspace.workspaceId}`
      if (deletingWorkspaceScopesRef.current.has(scopeKey)) return

      deletingWorkspaceScopesRef.current.add(scopeKey)
      const notificationId = notifications.notify({
        isActivity: true,
        kind: 'info',
        title: t(`canvas.remove.pending.${target.type}`)
      })
      try {
        const graphSnapshot = await window.cleancode?.deleteTerminalScope({
          projectDirectory: currentWorkbench.project.directory,
          target,
          workspaceId: currentWorkspace.workspaceId
        })
        if (graphSnapshot) setCurrentGraph(graphSnapshot)
        notifications.dismiss(notificationId)
      } catch (error) {
        const failure = {
          kind: 'error' as const,
          message: resolveUserFacingErrorMessage(error, 'canvas.remove.failed', t),
          title: t('canvas.remove.failedTitle')
        }
        if (!notifications.update(notificationId, failure)) notifications.notify(failure)
      } finally {
        deletingWorkspaceScopesRef.current.delete(scopeKey)
      }
    },
    [currentWorkbench, currentWorkspace, notifications, setCurrentGraph, t]
  )

  return { createTerminalGroup, deleteTerminalBlock, deleteTerminalScope }
}
