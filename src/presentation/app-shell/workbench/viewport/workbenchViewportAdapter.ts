import type { Edge, ReactFlowInstance, Viewport } from '@xyflow/react'

import type { WorkbenchFlowNode } from '../../types/workbenchFlowNode'

const applyingInstances = new WeakSet<ReactFlowInstance<WorkbenchFlowNode, Edge>>()

export function isApplyingWorkbenchViewport(
  instance: ReactFlowInstance<WorkbenchFlowNode, Edge> | null
): boolean {
  return instance !== null && applyingInstances.has(instance)
}

export async function applyWorkbenchViewport(
  instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
  viewport: Viewport
): Promise<boolean> {
  try {
    let applied: Promise<boolean>
    applyingInstances.add(instance)
    try {
      // React Flow emits move-start synchronously, but defers move-end. The
      // canvas captures this source at start so a late end keeps its owner.
      applied = instance.setViewport(viewport, { duration: 0 })
    } finally {
      applyingInstances.delete(instance)
    }
    return (await applied) !== false
  } catch {
    return false
  }
}
