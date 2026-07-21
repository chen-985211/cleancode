import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react'

import {
  isSameTerminalGroupDropAction,
  projectTerminalGroupDropAction,
  resolveTerminalGroupDropAction,
  type TerminalGroupDropAction
} from './terminalGroupDropTarget'
import type { WorkbenchFlowNode, WorkbenchSnapshot } from './types'
import type { WorkbenchNodeLayoutCommitQueue } from './workbenchNodeLayoutCommitQueue'
import { restoreWorkbenchNodeLayout } from './restoreWorkbenchNodeLayout'

type CurrentWorkspace = WorkbenchSnapshot['project']['workspaces'][number]

interface UseTerminalGroupDragActionsInput {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: CurrentWorkspace | undefined
  readonly graph: WorkbenchSnapshot['graph'] | null
  readonly getNodes: () => WorkbenchFlowNode[]
  readonly isTerminalGroupSelectionMode: boolean
  readonly layoutCommitQueue: WorkbenchNodeLayoutCommitQueue
  readonly setCurrentGraph: (graphSnapshot: WorkbenchSnapshot['graph']) => void
  readonly setNodes: Dispatch<SetStateAction<WorkbenchFlowNode[]>>
}

export function useTerminalGroupDragActions({
  currentWorkbench,
  currentWorkspace,
  graph,
  getNodes,
  isTerminalGroupSelectionMode,
  layoutCommitQueue,
  setCurrentGraph,
  setNodes
}: UseTerminalGroupDragActionsInput) {
  const terminalGroupDropActionRef = useRef<TerminalGroupDropAction>({ type: 'none' })
  const updateTerminalGroupDropAction = useCallback(
    (action: TerminalGroupDropAction): void => {
      if (isSameTerminalGroupDropAction(terminalGroupDropActionRef.current, action)) return

      terminalGroupDropActionRef.current = action
      setNodes((nodes) => projectTerminalGroupDropAction(nodes, action))
    },
    [setNodes]
  )

  const previewTerminalGroupDrop = useCallback(
    (_event: globalThis.MouseEvent | TouchEvent, node: WorkbenchFlowNode) => {
      if (!isTerminalGroupSelectionMode || node.type !== 'terminal' || !graph) {
        updateTerminalGroupDropAction({ type: 'none' })
        return
      }

      updateTerminalGroupDropAction(
        resolveTerminalGroupDropAction({
          graph,
          draggedNode: node,
          nodes: getNodes()
        })
      )
    },
    [getNodes, graph, isTerminalGroupSelectionMode, updateTerminalGroupDropAction]
  )

  const clearTerminalGroupDropPreview = useCallback(() => {
    updateTerminalGroupDropAction({ type: 'none' })
  }, [updateTerminalGroupDropAction])

  useEffect(() => {
    if (!isTerminalGroupSelectionMode) clearTerminalGroupDropPreview()
  }, [clearTerminalGroupDropPreview, isTerminalGroupSelectionMode])

  const moveWorkbenchNode = useCallback(
    async (_event: globalThis.MouseEvent | TouchEvent, node: WorkbenchFlowNode) => {
      if (!currentWorkbench || !currentWorkspace) {
        return
      }

      if (node.type === 'agentConsole') {
        clearTerminalGroupDropPreview()
        return
      }

      try {
        if (node.type === 'terminal') {
          const dropAction = isTerminalGroupSelectionMode
            ? resolveTerminalGroupDropAction({
                graph: currentWorkbench.graph,
                draggedNode: node,
                nodes: getNodes()
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
          return
        }

        await layoutCommitQueue.enqueue(
          `terminal-group:${currentWorkbench.project.id}:${currentWorkspace.name}:${node.id}`,
          () =>
            window.cleancode?.moveTerminalGroup({
              projectDirectory: currentWorkbench.project.directory,
              workspaceName: currentWorkspace.name,
              terminalGroupId: node.id,
              position: node.position
            }) ?? Promise.resolve(undefined),
          (graphSnapshot) => {
            if (graphSnapshot) setCurrentGraph(graphSnapshot)
          }
        )
      } catch (error) {
        setNodes((nodes) => restoreWorkbenchNodeLayout(nodes, currentWorkbench.graph, node))
        throw error
      } finally {
        clearTerminalGroupDropPreview()
      }
    },
    [
      clearTerminalGroupDropPreview,
      currentWorkbench,
      currentWorkspace,
      getNodes,
      isTerminalGroupSelectionMode,
      layoutCommitQueue,
      setCurrentGraph,
      setNodes
    ]
  )

  return {
    clearTerminalGroupDropPreview,
    moveWorkbenchNode,
    previewTerminalGroupDrop
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
