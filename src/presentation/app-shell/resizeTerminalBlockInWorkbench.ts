import type { TerminalBlockSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkbenchNodeLayoutInput, WorkbenchSnapshot } from './types'
import type { WorkbenchNodeLayoutCommitQueue } from './workbenchNodeLayoutCommitQueue'

type CurrentWorkspace = WorkbenchSnapshot['project']['workspaces'][number]

interface ResizeTerminalBlockInWorkbenchInput {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: CurrentWorkspace | undefined
  readonly block: TerminalBlockSnapshot
  readonly layout: WorkbenchNodeLayoutInput
  readonly layoutCommitQueue: WorkbenchNodeLayoutCommitQueue
  readonly setCurrentGraph: (graph: WorkbenchSnapshot['graph']) => void
}

export async function resizeTerminalBlockInWorkbench({
  currentWorkbench,
  currentWorkspace,
  block,
  layout,
  layoutCommitQueue,
  setCurrentGraph
}: ResizeTerminalBlockInWorkbenchInput): Promise<void> {
  if (!currentWorkbench || !currentWorkspace) {
    return
  }

  await layoutCommitQueue.enqueue(
    `terminal:${currentWorkbench.project.id}:${currentWorkspace.name}:${block.id}`,
    () =>
      window.cleancode?.resizeTerminalBlock({
        projectDirectory: currentWorkbench.project.directory,
        workspaceName: currentWorkspace.name,
        blockId: block.id,
        position: layout.position,
        size: layout.size
      }) ?? Promise.resolve(undefined),
    (graphSnapshot) => {
      if (graphSnapshot) setCurrentGraph(graphSnapshot)
    }
  )
}
