import type { Connection, Edge } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  TerminalBlockSnapshot,
  TerminalExecutionConfigSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkflowRunSnapshot } from '../../contexts/run/application/dto/WorkflowRunSnapshot'
import { createTerminalWorkflowEdges } from './terminalWorkflowEdges'
import { resolveUserFacingErrorMessage } from './appErrorMessages'
import type { AppNotificationController, NotifyApp } from './appNotifications'
import { getWorkflowRunRootBlockIds } from './terminalWorkflowNotifications'
import type { WorkbenchSnapshot } from './types'
import { useTerminalWorkflowNotifications } from './useTerminalWorkflowNotifications'

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
  const [run, setRun] = useState<WorkflowRunSnapshot | null>(null)
  const [isStopping, setIsStopping] = useState(false)
  const isStoppingRef = useRef(false)
  const graphId = currentWorkbench?.graph.id ?? null
  const projectDirectory = currentWorkbench?.project.directory ?? null
  const workspaceName = currentWorkspace?.name ?? null
  const { notify } = notifications

  useEffect(() => {
    const api = window.cleancode
    isStoppingRef.current = false
    setIsStopping(false)

    if (
      !api ||
      !graphId ||
      !projectDirectory ||
      !workspaceName ||
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
        event.run.workspaceName === workspaceName
      ) {
        setRun(event.run)
      }
    })

    void api.getTerminalWorkflow({ projectDirectory, workspaceName }).then((activeRun) => {
      if (isActive) {
        setRun(activeRun)
      }
    })

    return () => {
      isActive = false
      unsubscribe()
    }
  }, [graphId, projectDirectory, workspaceName])

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

      await performAction(notify, async () => {
        const graph = await window.cleancode?.connectTerminalBlocks({
          projectDirectory: currentWorkbench.project.directory,
          workspaceName: currentWorkspace.name,
          sourceBlockId: connection.source ?? '',
          targetBlockId: connection.target ?? ''
        })

        if (graph) setCurrentGraph(graph)
      })
    },
    [currentWorkbench, currentWorkspace, notify, setCurrentGraph]
  )

  const deleteEdges = useCallback(
    async (deletedEdges: Edge[]) => {
      if (!currentWorkbench || !currentWorkspace) return

      await performAction(notify, async () => {
        for (const edge of deletedEdges) {
          const graph = await window.cleancode?.disconnectTerminalBlocks({
            projectDirectory: currentWorkbench.project.directory,
            workspaceName: currentWorkspace.name,
            connectionId: edge.id
          })

          if (graph) setCurrentGraph(graph)
        }
      })
    },
    [currentWorkbench, currentWorkspace, notify, setCurrentGraph]
  )

  const updateExecutionConfig = useCallback(
    async (block: TerminalBlockSnapshot, executionConfig: TerminalExecutionConfigSnapshot) => {
      if (!currentWorkbench || !currentWorkspace) return

      await performAction(notify, async () => {
        const graph = await window.cleancode?.updateTerminalExecutionConfig({
          projectDirectory: currentWorkbench.project.directory,
          workspaceName: currentWorkspace.name,
          blockId: block.id,
          executionConfig
        })

        if (graph) setCurrentGraph(graph)
      })
    },
    [currentWorkbench, currentWorkspace, notify, setCurrentGraph]
  )

  const start = useCallback(
    async (blockId?: string) => {
      if (!currentWorkbench || !currentWorkspace) return

      await performAction(notify, async () => {
        const nextRun = await window.cleancode?.startTerminalWorkflow({
          projectDirectory: currentWorkbench.project.directory,
          workspaceName: currentWorkspace.name,
          workingDirectory: currentWorkspace.directory,
          scope: blockId ? { type: 'from-block', blockId } : { type: 'full' }
        })

        if (nextRun) setRun(nextRun)
      })
    },
    [currentWorkbench, currentWorkspace, notify]
  )

  const stop = useCallback(async () => {
    if (!currentWorkbench || !currentWorkspace || isStoppingRef.current) return

    isStoppingRef.current = true
    setIsStopping(true)
    try {
      await performAction(notify, async () => {
        setRun(
          (await window.cleancode?.stopTerminalWorkflow({
            projectDirectory: currentWorkbench.project.directory,
            workspaceName: currentWorkspace.name
          })) ?? null
        )
      })
    } finally {
      isStoppingRef.current = false
      setIsStopping(false)
    }
  }, [currentWorkbench, currentWorkspace, notify])

  useTerminalWorkflowNotifications({
    isStopping,
    notifications,
    onStop: stop,
    projectDirectory,
    run,
    workspaceName
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
    stop,
    updateExecutionConfig
  }
}

async function performAction(notify: NotifyApp, action: () => Promise<void>): Promise<void> {
  try {
    await action()
  } catch (error) {
    notify({
      kind: 'error',
      title: '流程操作失败',
      message: resolveUserFacingErrorMessage(error, '流程操作失败，请稍后重试。')
    })
  }
}
