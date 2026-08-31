import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'

import type {
  QuickExecutionSlotNumber,
  QuickExecutionTargetSnapshot,
  TerminalBlockSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { TerminalWorkflowPlanScope } from '../../contexts/run/application/ports/TerminalWorkflowPlanPort'
import {
  executeQuickExecutionTarget,
  quickExecutionTargetKey,
  resolveQuickExecutionBinding
} from './quickExecutionTargets'
import type { AppNotificationController } from '../shared/notifications/appNotifications'
import { resolveUserFacingErrorMessage } from '../shared/errors/appErrorMessages'
import { useI18n } from '../i18n/useI18n'
import { focusQuickExecutionTargetInCanvas } from './quickExecutionFocus'
import type { WorkbenchFlowNode, WorkbenchSnapshot } from './types'
import { useCanvasQuickExecutionFollowPreference } from './useCanvasQuickExecutionFollowPreference'

export function useQuickExecutionActions({
  currentWorkbench,
  currentWorkspace,
  notifications,
  quickLaunchTerminal,
  reactFlowInstanceRef,
  requestTerminalLaunchCommand,
  setCurrentGraph,
  startScope,
  startTerminalCombination
}: {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: WorkbenchSnapshot['project']['workspaces'][number] | undefined
  readonly notifications: AppNotificationController
  readonly quickLaunchTerminal: (
    block: TerminalBlockSnapshot,
    options?: { readonly shouldFocus?: boolean }
  ) => Promise<unknown> | unknown
  readonly reactFlowInstanceRef: MutableRefObject<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>
  readonly requestTerminalLaunchCommand: (blockId: string) => void
  readonly setCurrentGraph: (graph: WorkbenchSnapshot['graph']) => void
  readonly startScope: (scope: TerminalWorkflowPlanScope) => Promise<unknown> | unknown
  readonly startTerminalCombination: (terminalGroupId: string) => Promise<unknown> | unknown
}) {
  const { t } = useI18n()
  const { changeFollowQuickExecutionTarget, followQuickExecutionTarget } =
    useCanvasQuickExecutionFollowPreference()
  const executingTargetsRef = useRef(new Set<string>())
  const projectDirectory = currentWorkbench?.project.directory ?? null
  const workspaceId = currentWorkspace?.workspaceId ?? null

  useEffect(() => {
    executingTargetsRef.current.clear()
  }, [projectDirectory, workspaceId])

  const updateSlot = useCallback(
    async (
      number: QuickExecutionSlotNumber,
      target: QuickExecutionTargetSnapshot | null
    ): Promise<void> => {
      if (!currentWorkbench || !currentWorkspace) return

      try {
        const graph = target
          ? await window.cleancode?.bindQuickExecutionSlot({
              number,
              projectDirectory: currentWorkbench.project.directory,
              target,
              workspaceId: currentWorkspace.workspaceId
            })
          : await window.cleancode?.clearQuickExecutionSlot({
              number,
              projectDirectory: currentWorkbench.project.directory,
              workspaceId: currentWorkspace.workspaceId
            })
        if (graph) setCurrentGraph(graph)
      } catch (error) {
        notifications.notify({
          kind: 'error',
          message: resolveUserFacingErrorMessage(error, 'quickExecution.updateFailed', t),
          title: t('quickExecution.updateFailedTitle')
        })
      }
    },
    [currentWorkbench, currentWorkspace, notifications, setCurrentGraph, t]
  )

  const addTarget = useCallback(
    async (target: QuickExecutionTargetSnapshot): Promise<void> => {
      if (!currentWorkbench || !currentWorkspace) return

      try {
        const graph = await window.cleancode?.addQuickExecutionTarget({
          projectDirectory: currentWorkbench.project.directory,
          target,
          workspaceId: currentWorkspace.workspaceId
        })
        if (graph) setCurrentGraph(graph)
      } catch (error) {
        notifications.notify({
          kind: 'error',
          message: resolveUserFacingErrorMessage(error, 'quickExecution.updateFailed', t),
          title: t('quickExecution.updateFailedTitle')
        })
      }
    },
    [currentWorkbench, currentWorkspace, notifications, setCurrentGraph, t]
  )

  const reorderSlots = useCallback(
    async (
      sourceNumber: QuickExecutionSlotNumber,
      destinationNumber: QuickExecutionSlotNumber
    ): Promise<void> => {
      if (!currentWorkbench || !currentWorkspace) return

      try {
        const graph = await window.cleancode?.reorderQuickExecutionSlots({
          destinationNumber,
          projectDirectory: currentWorkbench.project.directory,
          sourceNumber,
          workspaceId: currentWorkspace.workspaceId
        })
        if (graph) setCurrentGraph(graph)
      } catch (error) {
        notifications.notify({
          kind: 'error',
          message: resolveUserFacingErrorMessage(error, 'quickExecution.updateFailed', t),
          title: t('quickExecution.updateFailedTitle')
        })
      }
    },
    [currentWorkbench, currentWorkspace, notifications, setCurrentGraph, t]
  )

  const executeTarget = useCallback(
    async (target: QuickExecutionTargetSnapshot): Promise<void> => {
      const graph = currentWorkbench?.graph
      if (!graph) return

      const key = quickExecutionTargetKey(target)
      if (executingTargetsRef.current.has(key)) return

      executingTargetsRef.current.add(key)
      try {
        if (followQuickExecutionTarget && resolveQuickExecutionBinding(graph, target).isAvailable) {
          focusQuickExecutionTargetInCanvas({
            instance: reactFlowInstanceRef.current,
            target,
            terminalGroups: graph.terminalGroups
          })
        }
        await executeQuickExecutionTarget({
          graph,
          quickLaunchTerminal: (block) => quickLaunchTerminal(block, { shouldFocus: false }),
          requestTerminalLaunchCommand,
          startScope,
          startTerminalCombination,
          target
        })
      } catch {
        notifications.notify({
          kind: 'error',
          message: t('quickExecution.executeFailed'),
          title: t('quickExecution.executeFailedTitle')
        })
      } finally {
        executingTargetsRef.current.delete(key)
      }
    },
    [
      currentWorkbench?.graph,
      followQuickExecutionTarget,
      notifications,
      quickLaunchTerminal,
      reactFlowInstanceRef,
      requestTerminalLaunchCommand,
      startScope,
      startTerminalCombination,
      t
    ]
  )

  const executeSlot = useCallback(
    async (number: QuickExecutionSlotNumber): Promise<void> => {
      const target = currentWorkbench?.graph.quickExecutionSlots?.find(
        (slot) => slot.number === number
      )?.target
      if (target) await executeTarget(target)
    },
    [currentWorkbench?.graph, executeTarget]
  )

  return {
    addTarget,
    bindSlot: (number: QuickExecutionSlotNumber, target: QuickExecutionTargetSnapshot) =>
      updateSlot(number, target),
    changeFollowQuickExecutionTarget,
    clearSlot: (number: QuickExecutionSlotNumber) => updateSlot(number, null),
    executeSlot,
    executeTarget,
    followQuickExecutionTarget,
    reorderSlots
  }
}
