import type { Connection, Edge } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type {
  TerminalBlockSnapshot,
  TerminalExecutionConfigSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkflowRunSnapshot } from '../../contexts/run/application/dto/WorkflowRunSnapshot'
import { createTerminalWorkflowEdges } from './terminalWorkflowEdges'
import { resolveUserFacingErrorMessage } from './appErrorMessages'
import type { WorkbenchSnapshot } from './types'

type CurrentWorkspace = WorkbenchSnapshot['project']['workspaces'][number]

interface UseTerminalWorkflowInput {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: CurrentWorkspace | undefined
  readonly setCurrentGraph: (graph: WorkbenchSnapshot['graph']) => void
}

export function useTerminalWorkflow({
  currentWorkbench,
  currentWorkspace,
  setCurrentGraph
}: UseTerminalWorkflowInput) {
  const [run, setRun] = useState<WorkflowRunSnapshot | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const workspaceName = currentWorkspace?.name ?? null

  useEffect(() => {
    const api = window.cleancode

    if (
      !api ||
      !workspaceName ||
      typeof api.onTerminalWorkflowEvent !== 'function' ||
      typeof api.getTerminalWorkflow !== 'function'
    ) {
      setRun(null)
      return undefined
    }

    let isActive = true
    const unsubscribe = api.onTerminalWorkflowEvent((event) => {
      if (event.type === 'run-updated' && event.run.workspaceName === workspaceName) {
        setRun(event.run)
      }
    })

    void api.getTerminalWorkflow({ workspaceName }).then((activeRun) => {
      if (isActive) {
        setRun(activeRun)
      }
    })

    return () => {
      isActive = false
      unsubscribe()
    }
  }, [workspaceName])

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

      await performAction(setActionError, async () => {
        const graph = await window.cleancode?.connectTerminalBlocks({
          projectDirectory: currentWorkbench.project.directory,
          workspaceName: currentWorkspace.name,
          sourceBlockId: connection.source ?? '',
          targetBlockId: connection.target ?? ''
        })

        if (graph) setCurrentGraph(graph)
      })
    },
    [currentWorkbench, currentWorkspace, setCurrentGraph]
  )

  const deleteEdges = useCallback(
    async (deletedEdges: Edge[]) => {
      if (!currentWorkbench || !currentWorkspace) return

      await performAction(setActionError, async () => {
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
    [currentWorkbench, currentWorkspace, setCurrentGraph]
  )

  const updateExecutionConfig = useCallback(
    async (block: TerminalBlockSnapshot, executionConfig: TerminalExecutionConfigSnapshot) => {
      if (!currentWorkbench || !currentWorkspace) return

      await performAction(setActionError, async () => {
        const graph = await window.cleancode?.updateTerminalExecutionConfig({
          projectDirectory: currentWorkbench.project.directory,
          workspaceName: currentWorkspace.name,
          blockId: block.id,
          executionConfig
        })

        if (graph) setCurrentGraph(graph)
      })
    },
    [currentWorkbench, currentWorkspace, setCurrentGraph]
  )

  const start = useCallback(
    async (blockId?: string) => {
      if (!currentWorkbench || !currentWorkspace) return

      await performAction(setActionError, async () => {
        const nextRun = await window.cleancode?.startTerminalWorkflow({
          projectDirectory: currentWorkbench.project.directory,
          workspaceName: currentWorkspace.name,
          workingDirectory: currentWorkspace.directory,
          scope: blockId ? { type: 'from-block', blockId } : { type: 'full' }
        })

        if (nextRun) setRun(nextRun)
      })
    },
    [currentWorkbench, currentWorkspace]
  )

  const stop = useCallback(async () => {
    if (!currentWorkspace) return

    await performAction(setActionError, async () => {
      setRun(
        (await window.cleancode?.stopTerminalWorkflow({
          workspaceName: currentWorkspace.name
        })) ?? null
      )
    })
  }, [currentWorkspace])

  return {
    actionError,
    clearActionError: () => setActionError(null),
    connect,
    deleteEdges,
    edges,
    isActive: run?.status === 'running' || run?.status === 'ready',
    nodeStatuses,
    run,
    start,
    stop,
    updateExecutionConfig
  }
}

async function performAction(
  setError: (error: string | null) => void,
  action: () => Promise<void>
): Promise<void> {
  setError(null)

  try {
    await action()
  } catch (error) {
    setError(
      resolveUserFacingErrorMessage(error, error instanceof Error ? error.message : String(error))
    )
  }
}
