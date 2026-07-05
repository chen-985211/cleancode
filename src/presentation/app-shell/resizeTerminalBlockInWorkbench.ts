import type { TerminalBlockSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { TerminalBlockSizeInput, WorkbenchSnapshot } from './types'

type CurrentWorkspace = WorkbenchSnapshot['project']['workspaces'][number]

interface ResizeTerminalBlockInWorkbenchInput {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: CurrentWorkspace | undefined
  readonly block: TerminalBlockSnapshot
  readonly size: TerminalBlockSizeInput
  readonly setCurrentGraph: (graph: WorkbenchSnapshot['graph']) => void
}

export async function resizeTerminalBlockInWorkbench({
  currentWorkbench,
  currentWorkspace,
  block,
  size,
  setCurrentGraph
}: ResizeTerminalBlockInWorkbenchInput): Promise<void> {
  if (!currentWorkbench || !currentWorkspace) {
    return
  }

  const graphSnapshot = await window.cleancode?.resizeTerminalBlock({
    projectDirectory: currentWorkbench.project.directory,
    workspaceName: currentWorkspace.name,
    blockId: block.id,
    size
  })

  if (graphSnapshot) {
    setCurrentGraph(graphSnapshot)
  }
}
