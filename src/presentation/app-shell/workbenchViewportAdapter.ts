import type { Edge, ReactFlowInstance, Viewport } from '@xyflow/react'

import type { WorkbenchFlowNode } from './types/workbenchFlowNode'

export async function applyWorkbenchViewport(
  instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
  viewport: Viewport
): Promise<boolean> {
  try {
    return (await instance.setViewport(viewport, { duration: 0 })) !== false
  } catch {
    return false
  }
}
