import { useCallback, type Dispatch, type SetStateAction } from 'react'

import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type { CanvasArrangementSnapshot } from '../../contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'
import { useI18n } from '../i18n/useI18n'
import type { WorkbenchSnapshot } from './types'
import { useCanvasArrangementActions } from './useCanvasArrangementActions'

export function useAppShellCanvasArrangement({
  currentWorkbench,
  currentWorkspace,
  moveWorkspaceAgent,
  notify,
  setCurrentGraph,
  setCurrentWorkbench,
  setWorkbenches
}: {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: WorkbenchSnapshot['project']['workspaces'][number] | undefined
  readonly moveWorkspaceAgent: (
    agent: WorkspaceAgentSnapshot,
    position: { readonly x: number; readonly y: number },
    size: { readonly width: number; readonly height: number }
  ) => Promise<void>
  readonly notify: (notification: {
    readonly kind: 'error'
    readonly message: string
    readonly title: string
  }) => void
  readonly setCurrentGraph: (graph: WorkbenchSnapshot['graph']) => void
  readonly setCurrentWorkbench: Dispatch<SetStateAction<WorkbenchSnapshot | null>>
  readonly setWorkbenches: Dispatch<SetStateAction<WorkbenchSnapshot[]>>
}) {
  const { t } = useI18n()
  const setCurrentArrangement = useCallback(
    (arrangement: CanvasArrangementSnapshot): void => {
      const update = (workbench: WorkbenchSnapshot): WorkbenchSnapshot =>
        workbench.project.id === arrangement.projectId &&
        workbench.graph.workspaceId === arrangement.workspaceId
          ? { ...workbench, canvasArrangement: arrangement }
          : workbench
      setCurrentWorkbench((workbench) => (workbench ? update(workbench) : workbench))
      setWorkbenches((entries) => entries.map(update))
    },
    [setCurrentWorkbench, setWorkbenches]
  )

  return useCanvasArrangementActions({
    currentWorkbench,
    currentWorkspace,
    failureMessage: t('canvas.arrangement.failed'),
    failureTitle: t('canvas.arrangement.failedTitle'),
    moveWorkspaceAgent,
    notify,
    setCurrentArrangement,
    setCurrentGraph
  })
}
