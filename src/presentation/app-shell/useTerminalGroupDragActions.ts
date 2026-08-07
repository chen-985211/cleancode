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
  readonly editingTerminalGroupId?: string | null
  readonly isTerminalGroupSelectionMode?: boolean
  readonly layoutCommitQueue: WorkbenchNodeLayoutCommitQueue
  readonly setCurrentGraph: (graphSnapshot: WorkbenchSnapshot['graph']) => void
  readonly setNodes: Dispatch<SetStateAction<WorkbenchFlowNode[]>>
}

export function useTerminalGroupDragActions({
  currentWorkbench,
  currentWorkspace,
  graph,
  getNodes,
  editingTerminalGroupId,
  isTerminalGroupSelectionMode = false,
  layoutCommitQueue,
  setCurrentGraph,
  setNodes
}: UseTerminalGroupDragActionsInput) {
  const activeEditingTerminalGroupId =
    editingTerminalGroupId ??
    (isTerminalGroupSelectionMode ? (graph?.terminalGroups[0]?.id ?? null) : null)
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
      if (!activeEditingTerminalGroupId || node.type !== 'terminal' || !graph) {
        updateTerminalGroupDropAction({ type: 'none' })
        return
      }

      updateTerminalGroupDropAction(
        resolveTerminalGroupDropAction({
          graph,
          draggedNode: node,
          editingTerminalGroupId: activeEditingTerminalGroupId,
          nodes: getNodes()
        })
      )
    },
    [activeEditingTerminalGroupId, getNodes, graph, updateTerminalGroupDropAction]
  )

  const clearTerminalGroupDropPreview = useCallback(() => {
    updateTerminalGroupDropAction({ type: 'none' })
  }, [updateTerminalGroupDropAction])

  useEffect(() => {
    if (!activeEditingTerminalGroupId) clearTerminalGroupDropPreview()
  }, [activeEditingTerminalGroupId, clearTerminalGroupDropPreview])

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
          const dropAction = activeEditingTerminalGroupId
            ? resolveTerminalGroupDropAction({
                graph: currentWorkbench.graph,
                draggedNode: node,
                editingTerminalGroupId: activeEditingTerminalGroupId,
                nodes: getNodes()
              })
            : { type: 'none' as const }
          await layoutCommitQueue.enqueue(
            `terminal:${currentWorkbench.project.id}:${currentWorkspace.workspaceId}:${node.id}`,
            async () => {
              if (!activeEditingTerminalGroupId) {
                return window.cleancode?.moveBlock({
                  projectDirectory: currentWorkbench.project.directory,
                  workspaceId: currentWorkspace.workspaceId,
                  blockId: node.id,
                  position: node.position
                })
              }

              return window.cleancode?.moveTerminalWorkflowToGroup({
                projectDirectory: currentWorkbench.project.directory,
                workspaceId: currentWorkspace.workspaceId,
                blockId: node.id,
                position: node.position,
                targetTerminalGroupId: resolveDropTargetGroupId(
                  currentWorkbench,
                  node.id,
                  dropAction
                )
              })
            },
            (graphSnapshot) => {
              if (graphSnapshot) setCurrentGraph(graphSnapshot)
            }
          )
          return
        }

        await layoutCommitQueue.enqueue(
          `terminal-group:${currentWorkbench.project.id}:${currentWorkspace.workspaceId}:${node.id}`,
          () =>
            window.cleancode?.moveTerminalGroup({
              projectDirectory: currentWorkbench.project.directory,
              workspaceId: currentWorkspace.workspaceId,
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
      activeEditingTerminalGroupId,
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

function resolveDropTargetGroupId(
  currentWorkbench: WorkbenchSnapshot,
  blockId: string,
  action: TerminalGroupDropAction
): string | null {
  if (action.type === 'join-group') {
    return action.terminalGroupId
  }

  if (action.type === 'leave-group') {
    return null
  }

  return (
    currentWorkbench.graph.terminalGroups.find((group) => group.memberBlockIds.includes(blockId))
      ?.id ?? null
  )
}
