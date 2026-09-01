import type { CanvasViewportSnapshot } from '../../../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkbenchSnapshot } from '../../types/workbenchSnapshot'

type CurrentWorkspace = WorkbenchSnapshot['project']['workspaces'][number]

interface UpdateGraphViewportInWorkbenchInput {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: CurrentWorkspace | undefined
  readonly viewport: CanvasViewportSnapshot
  readonly setCurrentGraph: (graph: WorkbenchSnapshot['graph']) => void
}

export async function updateGraphViewportInWorkbench({
  currentWorkbench,
  currentWorkspace,
  viewport,
  setCurrentGraph
}: UpdateGraphViewportInWorkbenchInput): Promise<void> {
  if (!currentWorkbench || !currentWorkspace) {
    return
  }

  const graphSnapshot = await window.cleancode?.updateGraphViewport({
    projectDirectory: currentWorkbench.project.directory,
    workspaceId: currentWorkspace.workspaceId,
    viewport
  })

  if (graphSnapshot) {
    setCurrentGraph(graphSnapshot)
  }
}
