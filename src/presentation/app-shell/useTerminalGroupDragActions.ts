import { useCallback, useState } from 'react'

import {
  resolveTerminalGroupDropAction,
  type TerminalGroupDropAction
} from './terminalGroupDropTarget'
import type { WorkbenchFlowNode, WorkbenchSnapshot } from './types'
import type { WorkbenchNodeLayoutCommitQueue } from './workbenchNodeLayoutCommitQueue'

type CurrentWorkspace = WorkbenchSnapshot['project']['workspaces'][number]

interface UseTerminalGroupDragActionsInput {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: CurrentWorkspace | undefined
  readonly graph: WorkbenchSnapshot['graph'] | null
  readonly isTerminalGroupSelectionMode: boolean
  readonly layoutCommitQueue: WorkbenchNodeLayoutCommitQueue
  readonly nodes: readonly WorkbenchFlowNode[]
  readonly setCurrentGraph: (graphSnapshot: WorkbenchSnapshot['graph']) => void
}

export function useTerminalGroupDragActions({
  currentWorkbench,
  currentWorkspace,
  graph,
  isTerminalGroupSelectionMode,
  layoutCommitQueue,
  nodes,
  setCurrentGraph
}: UseTerminalGroupDragActionsInput) {
  const [terminalGroupDropAction, setTerminalGroupDropAction] = useState<TerminalGroupDropAction>({
    type: 'none'
  })

  const previewTerminalGroupDrop = useCallback(
    (_event: globalThis.MouseEvent | TouchEvent, node: WorkbenchFlowNode) => {
      if (!isTerminalGroupSelectionMode || node.type !== 'terminal' || !graph) {
        setTerminalGroupDropAction({ type: 'none' })
        return
      }

      setTerminalGroupDropAction(
        resolveTerminalGroupDropAction({
          graph,
          draggedNode: node,
          nodes
        })
      )
    },
    [graph, isTerminalGroupSelectionMode, nodes]
  )

  const clearTerminalGroupDropPreview = useCallback(() => {
    setTerminalGroupDropAction({ type: 'none' })
  }, [])

  const moveWorkbenchNode = useCallback(
    async (_event: globalThis.MouseEvent | TouchEvent, node: WorkbenchFlowNode) => {
      if (!currentWorkbench || !currentWorkspace) {
        return
      }

      if (node.type === 'agentConsole') {
        setTerminalGroupDropAction({ type: 'none' })
        return
      }

      if (node.type === 'terminal') {
        const dropAction = isTerminalGroupSelectionMode
          ? resolveTerminalGroupDropAction({
              graph: currentWorkbench.graph,
              draggedNode: node,
              nodes
            })
          : { type: 'none' as const }
        await layoutCommitQueue.enqueue(
          `terminal:${currentWorkbench.project.id}:${currentWorkspace.name}:${node.id}`,
          async () => {
            let graphSnapshot = await window.cleancode?.moveBlock({
              projectDirectory: currentWorkbench.project.directory,
              workspaceName: currentWorkspace.name,
              blockId: node.id,
              position: node.position
            })

            graphSnapshot =
              (await applyTerminalGroupDropAction({
                action: dropAction,
                blockId: node.id,
                currentWorkbench,
                currentWorkspace
              })) ?? graphSnapshot

            return graphSnapshot
          },
          (graphSnapshot) => {
            if (graphSnapshot) setCurrentGraph(graphSnapshot)
          }
        )

        setTerminalGroupDropAction({ type: 'none' })
        return
      }

      const graphSnapshot = await window.cleancode?.moveTerminalGroup({
        projectDirectory: currentWorkbench.project.directory,
        workspaceName: currentWorkspace.name,
        terminalGroupId: node.id,
        position: node.position
      })

      if (graphSnapshot) {
        setCurrentGraph(graphSnapshot)
      }

      setTerminalGroupDropAction({ type: 'none' })
    },
    [
      currentWorkbench,
      currentWorkspace,
      isTerminalGroupSelectionMode,
      layoutCommitQueue,
      nodes,
      setCurrentGraph
    ]
  )

  return {
    clearTerminalGroupDropPreview,
    moveWorkbenchNode,
    previewTerminalGroupDrop,
    terminalGroupDropAction
  }
}

interface ApplyTerminalGroupDropActionInput {
  readonly action: TerminalGroupDropAction
  readonly blockId: string
  readonly currentWorkbench: WorkbenchSnapshot
  readonly currentWorkspace: CurrentWorkspace
}

async function applyTerminalGroupDropAction({
  action,
  blockId,
  currentWorkbench,
  currentWorkspace
}: ApplyTerminalGroupDropActionInput): Promise<WorkbenchSnapshot['graph'] | undefined> {
  if (action.type === 'join-group') {
    return window.cleancode?.addTerminalToGroup({
      projectDirectory: currentWorkbench.project.directory,
      workspaceName: currentWorkspace.name,
      terminalGroupId: action.terminalGroupId,
      blockId
    })
  }

  if (action.type === 'leave-group') {
    return window.cleancode?.removeTerminalFromGroup({
      projectDirectory: currentWorkbench.project.directory,
      workspaceName: currentWorkspace.name,
      terminalGroupId: action.terminalGroupId,
      blockId
    })
  }

  return undefined
}
