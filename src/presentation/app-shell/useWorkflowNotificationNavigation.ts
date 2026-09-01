import { useCallback } from 'react'

import type { CanvasObjectIdentity } from '../../shared-kernel/domain/value-objects/CanvasObjectIdentity'
import type { WorkbenchSnapshot } from './types'
import { resolveVisibleTerminalCanvasTarget } from '../../contexts/block-graph/presentation/view-models/visibleTerminalCanvasTarget'

export function useWorkflowNotificationNavigation(
  workbench: WorkbenchSnapshot | null,
  focusWorkbenchNode: (nodeId: string) => void
): (target: CanvasObjectIdentity) => void {
  return useCallback(
    (target: CanvasObjectIdentity): void => {
      if (
        !workbench ||
        target.objectKind !== 'terminal' ||
        target.projectId !== workbench.project.id ||
        target.projectId !== workbench.graph.projectId ||
        target.workspaceId !== workbench.graph.workspaceId
      ) {
        return
      }

      const visibleTarget = resolveVisibleTerminalCanvasTarget(workbench.graph, target.objectId)
      if (visibleTarget) focusWorkbenchNode(visibleTarget.nodeId)
    },
    [focusWorkbenchNode, workbench]
  )
}
