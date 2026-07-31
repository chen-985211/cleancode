import { useCallback } from 'react'

import type { QuickExecutionTargetSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { restoreWorkbenchNodeLayout } from './restoreWorkbenchNodeLayout'
import type { WorkbenchFlowNode, WorkbenchSnapshot } from './types'
import type { WorkbenchNodeStore } from './workbenchNodeStore'

interface UseAppShellNodeDragActionsInput {
  readonly addQuickExecutionTarget: (target: QuickExecutionTargetSnapshot) => Promise<void>
  readonly cancelNodeDrag: (nodeId: string) => void
  readonly graph: WorkbenchSnapshot['graph'] | null
  readonly layoutSaveFailedMessage: string
  readonly layoutSaveFailedTitle: string
  readonly nodeStore: WorkbenchNodeStore
  readonly notify: (notification: {
    readonly kind: 'error'
    readonly message: string
    readonly title: string
  }) => void
  readonly onNodeDragStop: (
    event: globalThis.MouseEvent | TouchEvent,
    node: WorkbenchFlowNode
  ) => Promise<void>
}

export function useAppShellNodeDragActions({
  addQuickExecutionTarget,
  cancelNodeDrag,
  graph,
  layoutSaveFailedMessage,
  layoutSaveFailedTitle,
  nodeStore,
  notify,
  onNodeDragStop
}: UseAppShellNodeDragActionsInput) {
  const bindQuickExecutionFromNodeDrop = useCallback(
    async (target: QuickExecutionTargetSnapshot, node: WorkbenchFlowNode): Promise<void> => {
      cancelNodeDrag(node.id)
      nodeStore.setNodes((nodes) => restoreWorkbenchNodeLayout(nodes, graph, node))
      await addQuickExecutionTarget(target)
    },
    [addQuickExecutionTarget, cancelNodeDrag, graph, nodeStore]
  )

  const commitWorkbenchNodeDrag = useCallback(
    (event: globalThis.MouseEvent | TouchEvent, node: WorkbenchFlowNode): void => {
      void onNodeDragStop(event, node).catch(() => {
        notify({
          kind: 'error',
          message: layoutSaveFailedMessage,
          title: layoutSaveFailedTitle
        })
      })
    },
    [layoutSaveFailedMessage, layoutSaveFailedTitle, notify, onNodeDragStop]
  )

  return { bindQuickExecutionFromNodeDrop, commitWorkbenchNodeDrag }
}
