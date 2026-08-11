import type { Connection, Edge } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  TerminalBlockSnapshot,
  TerminalExecutionConfigSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkflowRunSnapshot } from '../../contexts/run/application/dto/WorkflowRunSnapshot'
import type { TerminalWorkflowPlanScope } from '../../contexts/run/application/ports/TerminalWorkflowPlanPort'
import { createTerminalWorkflowEdges } from './terminalWorkflowEdges'
import { resolveUserFacingErrorMessage } from './appErrorMessages'
import type { AppNotificationController, NotifyApp } from './appNotifications'
import { useI18n } from './i18n/useI18n'
import type { Translate } from './i18n/messages'
import { getWorkflowRunRootBlockIds } from './terminalWorkflowNotifications'
import type { WorkbenchSnapshot } from './types'
import { useTerminalWorkflowNotifications } from './useTerminalWorkflowNotifications'
import { readTerminalSourceTheme } from './terminalTheme'

type CurrentWorkspace = WorkbenchSnapshot['project']['workspaces'][number]

interface UseTerminalWorkflowInput {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: CurrentWorkspace | undefined
  readonly notifications: AppNotificationController
  readonly setCurrentGraph: (graph: WorkbenchSnapshot['graph']) => void
}

export function useTerminalWorkflow({
  currentWorkbench,
  currentWorkspace,
  notifications,
  setCurrentGraph
}: UseTerminalWorkflowInput) {
  const { t } = useI18n()
  const [run, setRun] = useState<WorkflowRunSnapshot | null>(null)
  const [isStopping, setIsStopping] = useState(false)
  const isStoppingRef = useRef(false)
  const graphId = currentWorkbench?.graph.id ?? null
  const projectDirectory = currentWorkbench?.project.directory ?? null
  const workspaceId = currentWorkspace?.workspaceId ?? null
  const { notify } = notifications

  useEffect(() => {
    const api = window.cleancode
    isStoppingRef.current = false
    setIsStopping(false)

    if (
      !api ||
      !graphId ||
      !projectDirectory ||
      !workspaceId ||
      typeof api.onTerminalWorkflowEvent !== 'function' ||
      typeof api.getTerminalWorkflow !== 'function'
    ) {
      setRun(null)
      return undefined
    }

    let isActive = true
    const unsubscribe = api.onTerminalWorkflowEvent((event) => {
      if (
        event.type === 'run-updated' &&
        event.run.graphId === graphId &&
        event.run.workspaceId === workspaceId
      ) {
        setRun(event.run)
      }
    })

    void api.getTerminalWorkflow({ projectDirectory, workspaceId }).then((activeRun) => {
      if (isActive) {
        setRun(activeRun)
      }
    })

    return () => {
      isActive = false
      unsubscribe()
    }
  }, [graphId, projectDirectory, workspaceId])

  const nodeStatuses = useMemo(
    () =>
      Object.fromEntries((run?.nodes ?? []).map((node) => [node.blockId, node.status])) as Record<
        string,
        WorkflowRunSnapshot['nodes'][number]['status']
      >,
    [run]
  )
  const edges = useMemo(
    () => createTerminalWorkflowEdges(currentWorkbench?.graph ?? null, nodeStatuses),
    [currentWorkbench?.graph, nodeStatuses]
  )

  const connect = useCallback(
    async (connection: Connection) => {
      if (
        !currentWorkbench ||
        !currentWorkspace ||
        !connection.source ||
        !connection.target ||
        !currentWorkbench.graph.blocks.some((block) => block.id === connection.source) ||
        !currentWorkbench.graph.blocks.some((block) => block.id === connection.target)
      ) {
        return
      }

      await performAction(notify, t, async () => {
        const graph = await window.cleancode?.connectTerminalBlocks({
          projectDirectory: currentWorkbench.project.directory,
          workspaceId: currentWorkspace.workspaceId,
          sourceBlockId: connection.source ?? '',
          targetBlockId: connection.target ?? ''
        })

        if (graph) setCurrentGraph(graph)
      })
    },
    [currentWorkbench, currentWorkspace, notify, setCurrentGraph, t]
  )

  const deleteEdges = useCallback(
    async (deletedEdges: Edge[]) => {
      if (!currentWorkbench || !currentWorkspace) return

      await performAction(notify, t, async () => {
        for (const edge of deletedEdges) {
          const graph = await window.cleancode?.disconnectTerminalBlocks({
            projectDirectory: currentWorkbench.project.directory,
            workspaceId: currentWorkspace.workspaceId,
            connectionId: edge.id
          })

          if (graph) setCurrentGraph(graph)
        }
      })
    },
    [currentWorkbench, currentWorkspace, notify, setCurrentGraph, t]
  )

  const updateExecutionConfig = useCallback(
    async (block: TerminalBlockSnapshot, executionConfig: TerminalExecutionConfigSnapshot) => {
      if (!currentWorkbench || !currentWorkspace) return

      await performAction(notify, t, async () => {
        const graph = await window.cleancode?.updateTerminalExecutionConfig({
          projectDirectory: currentWorkbench.project.directory,
          workspaceId: currentWorkspace.workspaceId,
          blockId: block.id,
          executionConfig
        })

        if (graph) setCurrentGraph(graph)
      })
    },
    [currentWorkbench, currentWorkspace, notify, setCurrentGraph, t]
  )

  const startScope = useCallback(
    async (scope: TerminalWorkflowPlanScope) => {
      if (!currentWorkbench || !currentWorkspace) return

      await performAction(notify, t, async () => {
        const nextRun = await window.cleancode?.startTerminalWorkflow({
          projectId: currentWorkbench.project.id,
          projectDirectory: currentWorkbench.project.directory,
          workspaceId: currentWorkspace.workspaceId,
          workspaceDirectory: currentWorkspace.directory,
          gitBranch: currentWorkspace.gitBranch,
          terminalSourceTheme: readTerminalSourceTheme(),
          scope
        })

        if (nextRun) setRun(nextRun)
      })
    },
    [currentWorkbench, currentWorkspace, notify, t]
  )
  const start = useCallback(
    (blockId?: string) => startScope(blockId ? { type: 'from-block', blockId } : { type: 'full' }),
    [startScope]
  )
  const startTerminalCombination = useCallback(
    (terminalGroupId: string) => startScope({ type: 'terminal-group', terminalGroupId }),
    [startScope]
  )

  const stop = useCallback(async () => {
    if (!projectDirectory || !workspaceId || isStoppingRef.current) return

    isStoppingRef.current = true
    setIsStopping(true)
    try {
      await performAction(notify, t, async () => {
        setRun(
          (await window.cleancode?.stopTerminalWorkflow({
            projectDirectory,
            workspaceId
          })) ?? null
        )
      })
    } finally {
      isStoppingRef.current = false
      setIsStopping(false)
    }
  }, [notify, projectDirectory, t, workspaceId])

  useTerminalWorkflowNotifications({
    isStopping,
    notifications,
    onStop: stop,
    projectDirectory,
    run,
    workspaceId
  })

  const isActive = run?.status === 'running' || run?.status === 'ready'
  const activeRootBlockIds = useMemo(
    () => (isActive && run ? getWorkflowRunRootBlockIds(run) : []),
    [isActive, run]
  )

  return {
    activeRootBlockIds,
    connect,
    deleteEdges,
    edges,
    isActive,
    isStopping,
    nodeStatuses,
    run,
    start,
    startScope,
    startTerminalCombination,
    stop,
    updateExecutionConfig
  }
}

async function performAction(
  notify: NotifyApp,
  t: Translate,
  action: () => Promise<void>
): Promise<void> {
  try {
    await action()
  } catch (error) {
    notify({
      kind: 'error',
      title: t('workflow.operationFailedTitle'),
      message: resolveUserFacingErrorMessage(error, 'workflow.operationFailed', t)
    })
  }
}
