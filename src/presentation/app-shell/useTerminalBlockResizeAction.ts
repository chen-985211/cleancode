import { useCallback } from 'react'

import type { TerminalBlockSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { resizeTerminalBlockInWorkbench } from './resizeTerminalBlockInWorkbench'
import type { WorkbenchNodeLayoutInput } from './types/workbenchNodeLayout'
import type { WorkbenchSnapshot } from './types/workbenchSnapshot'
import type { WorkbenchNodeLayoutCommitQueue } from './workbenchNodeLayoutCommitQueue'

type CurrentWorkspace = WorkbenchSnapshot['project']['workspaces'][number]

export function useTerminalBlockResizeAction({
  currentWorkbench,
  currentWorkspace,
  layoutCommitQueue,
  setCurrentGraph
}: {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: CurrentWorkspace | undefined
  readonly layoutCommitQueue: WorkbenchNodeLayoutCommitQueue
  readonly setCurrentGraph: (graph: WorkbenchSnapshot['graph']) => void
}) {
  return useCallback(
    (block: TerminalBlockSnapshot, layout: WorkbenchNodeLayoutInput) =>
      resizeTerminalBlockInWorkbench({
        block,
        currentWorkbench,
        currentWorkspace,
        layout,
        layoutCommitQueue,
        setCurrentGraph
      }),
    [currentWorkbench, currentWorkspace, layoutCommitQueue, setCurrentGraph]
  )
}
