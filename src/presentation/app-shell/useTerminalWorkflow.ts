import type { Connection, Edge } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  TerminalBlockSnapshot,
  TerminalExecutionConfigSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkflowRunSnapshot } from '../../contexts/run/application/dto/WorkflowRunSnapshot'
import type { TerminalWorkflowPlanScope } from '../../contexts/run/application/ports/TerminalWorkflowPlanPort'
import { createTerminalWorkflowEdges } from './terminalWorkflowEdges'
import { resolveUserFacingErrorMessage } from '../shared/errors/appErrorMessages'
import type { AppNotificationController, NotifyApp } from '../shared/notifications/appNotifications'
import { useI18n } from '../i18n/useI18n'
import type { Translate } from '../i18n/messages'
import { getWorkflowRunRootBlockIds } from './terminalWorkflowNotifications'
import type { WorkbenchSnapshot } from './types'
import { useTerminalWorkflowNotifications } from './useTerminalWorkflowNotifications'
import { useWorkflowNotificationNavigation } from './useWorkflowNotificationNavigation'
import { readTerminalSourceTheme } from '../../contexts/run/presentation/terminal-surface/terminalTheme'

type CurrentWorkspace = WorkbenchSnapshot['project']['workspaces'][number]

interface UseTerminalWorkflowInput {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: CurrentWorkspace | undefined
  readonly focusWorkbenchNode: (nodeId: string) => void
  readonly notifications: AppNotificationController
  readonly setCurrentGraph: (graph: WorkbenchSnapshot['graph']) => void
}

export function useTerminalWorkflow({
  currentWorkbench,
  currentWorkspace,
  focusWorkbenchNode,
  notifications,
  setCurrentGraph
}: UseTerminalWorkflowInput) {
  const { t } = useI18n()
  const [runs, setRuns] = useState<readonly WorkflowRunSnapshot[]>([])
  const [stoppingRunIds, setStoppingRunIds] = useState<readonly string[]>([])
  const stoppingRunIdsRef = useRef(new Set<string>())
  const graphId = currentWorkbench?.graph.id ?? null
  const projectId = currentWorkbench?.project.id ?? null
  const projectDirectory = currentWorkbench?.project.directory ?? null
  const workspaceId = currentWorkspace?.workspaceId ?? null
  const { notify } = notifications
  const focusWorkflowNode = useWorkflowNotificationNavigation(currentWorkbench, focusWorkbenchNode)

  useEffect(() => {
    const api = window.cleancode
    stoppingRunIdsRef.current.clear()
    setStoppingRunIds([])

    if (
      !api ||
      !graphId ||
      !projectDirectory ||
      !workspaceId ||
      typeof api.onTerminalWorkflowEvent !== 'function' ||
      typeof api.getTerminalWorkflows !== 'function'
    ) {
      setRuns([])
      return undefined
    }

    let isActive = true
    const liveRuns = new Map<string, WorkflowRunSnapshot>()
    setRuns([])
    const unsubscribe = api.onTerminalWorkflowEvent((event) => {
      if (
        event.type === 'run-updated' &&
        event.run.graphId === graphId &&
        event.run.projectId === projectId &&
        event.run.workspaceId === workspaceId
      ) {
        liveRuns.set(event.run.id, event.run)
        setRuns((current) => upsertWorkflowRun(current, event.run))
      }
    })

    void api.getTerminalWorkflows({ projectDirectory, workspaceId }).then((workspaceRuns) => {
      if (isActive) {
        setRuns(
          [...liveRuns.values()].reduce<readonly WorkflowRunSnapshot[]>(
            (current, liveRun) => upsertWorkflowRun(current, liveRun),
            workspaceRuns
          )
        )
      }
    })

    return () => {
      isActive = false
      unsubscribe()
    }
  }, [graphId, projectDirectory, projectId, workspaceId])

  const nodeStatuses = useMemo(
    () =>
      Object.fromEntries(
        runs.flatMap((run) => run.nodes.map((node) => [node.blockId, node.status]))
      ) as Record<string, WorkflowRunSnapshot['nodes'][number]['status']>,
    [runs]
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

        if (nextRun) setRuns((current) => upsertWorkflowRun(current, nextRun))
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

  const stop = useCallback(
    async (runId: string) => {
      if (!projectDirectory || !workspaceId || stoppingRunIdsRef.current.has(runId)) return

      stoppingRunIdsRef.current.add(runId)
      setStoppingRunIds([...stoppingRunIdsRef.current])
      try {
        await performAction(notify, t, async () => {
          const stoppedRun = await window.cleancode?.stopTerminalWorkflow({
            projectDirectory,
            workspaceId,
            runId
          })
          setRuns((current) =>
            stoppedRun
              ? upsertWorkflowRun(current, stoppedRun)
              : current.filter((run) => run.id !== runId)
          )
        })
      } finally {
        stoppingRunIdsRef.current.delete(runId)
        setStoppingRunIds([...stoppingRunIdsRef.current])
      }
    },
    [notify, projectDirectory, t, workspaceId]
  )

  useTerminalWorkflowNotifications({
    notifications,
    onNavigateToTarget: focusWorkflowNode,
    onStop: stop,
    projectId,
    runs,
    stoppingRunIds,
    workspaceId
  })

  const activeRunIdByRootBlockId = useMemo(
    () =>
      Object.fromEntries(
        runs
          .filter(isActiveWorkflowRun)
          .flatMap((run) => getWorkflowRunRootBlockIds(run).map((blockId) => [blockId, run.id]))
      ) as Record<string, string>,
    [runs]
  )
  return {
    activeRunIdByRootBlockId,
    connect,
    deleteEdges,
    edges,
    nodeStatuses,
    runs,
    start,
    startScope,
    startTerminalCombination,
    stoppingRunIds,
    stop,
    updateExecutionConfig
  }
}

function upsertWorkflowRun(
  current: readonly WorkflowRunSnapshot[],
  incoming: WorkflowRunSnapshot
): readonly WorkflowRunSnapshot[] {
  const sameRunIndex = current.findIndex((run) => run.id === incoming.id)
  if (sameRunIndex >= 0) {
    return current.map((run, index) => (index === sameRunIndex ? incoming : run))
  }

  const incomingBlockIds = new Set(incoming.nodes.map((node) => node.blockId))
  const overlappingRuns = current.filter((run) =>
    run.nodes.some((node) => incomingBlockIds.has(node.blockId))
  )
  if (!isActiveWorkflowRun(incoming) && overlappingRuns.some(isActiveWorkflowRun)) {
    return current
  }

  return [
    ...current.filter((run) => !run.nodes.some((node) => incomingBlockIds.has(node.blockId))),
    incoming
  ]
}

function isActiveWorkflowRun(run: WorkflowRunSnapshot): boolean {
  return run.status === 'running' || run.status === 'ready'
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
