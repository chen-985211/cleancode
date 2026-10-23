import { useCallback } from 'react'
import { useAgentLayoutCoordination } from './useAgentLayoutCoordination'
import { useTerminalGroupDragActions } from './useTerminalGroupDragActions'

type LayoutInput = Parameters<typeof useAgentLayoutCoordination>[0]
type GroupInput = Parameters<typeof useTerminalGroupDragActions>[0]

export function useWorkbenchNodeDragging(
  input: Omit<
    LayoutInput,
    | 'clearTerminalGroupDropPreview'
    | 'moveWorkbenchNode'
    | 'currentProjectId'
    | 'currentWorkspaceId'
  > &
    Pick<GroupInput, 'currentWorkbench' | 'currentWorkspace' | 'graph' | 'layoutCommitQueue'>
) {
  const toFlowPosition = useCallback<NonNullable<GroupInput['toFlowPosition']>>(
    (point) => input.reactFlowInstanceRef.current?.screenToFlowPosition(point) ?? point,
    [input.reactFlowInstanceRef]
  )
  const groups = useTerminalGroupDragActions({
    ...input,
    getNodes: input.nodeStore.getNodes,
    setNodes: input.nodeStore.setNodes,
    toFlowPosition
  })
  const layout = useAgentLayoutCoordination({
    ...input,
    clearTerminalGroupDropPreview: groups.clearTerminalGroupDropPreview,
    moveWorkbenchNode: groups.moveWorkbenchNode,
    currentProjectId: input.currentWorkbench?.project.id ?? null,
    currentWorkspaceId: input.currentWorkspace?.workspaceId ?? null
  })
  const start = useCallback<typeof layout.onNodeDragStart>(
    (event, node, ids) => {
      const movedIds =
        ids ??
        (node.type === 'terminalGroup' ? [node.id, ...node.data.group.memberBlockIds] : [node.id])
      layout.onNodeDragStart(event, node, [
        ...movedIds,
        ...input.nodeStore
          .getNodes()
          .filter((entry) => entry.type === 'terminalGroup')
          .map((entry) => entry.id)
      ])
      groups.beginTerminalGroupDrag(event, node, ids)
    },
    [groups.beginTerminalGroupDrag, input.nodeStore, layout.onNodeDragStart]
  )
  const cancel = useCallback(
    (id: string) => {
      groups.cancelTerminalGroupDrag()
      layout.cancelNodeDrag(id)
    },
    [groups.cancelTerminalGroupDrag, layout.cancelNodeDrag]
  )
  return {
    ...layout,
    onNodeDragStart: start,
    cancelNodeDrag: cancel,
    previewTerminalGroupDrop: groups.previewTerminalGroupDrop,
    clearTerminalGroupDropPreview: groups.clearTerminalGroupDropPreview
  }
}
