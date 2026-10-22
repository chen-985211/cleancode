import { getViewportForBounds, type Edge, type ReactFlowInstance, type Rect } from '@xyflow/react'

import { minimumCanvasZoom } from '../../../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkbenchFlowNode } from '../../types/workbenchFlowNode'
import { isWorkbenchNodePresentationHidden } from '../../projections/workbenchNodeVisibility'
import { readWorkbenchCanvasCreationGeometry } from './workbenchCanvasSafeViewport'
import { resolveWorkbenchNodeFocusZoom } from './workbenchNodeFocusViewport'
import { resolveWorkbenchCommandCanvasSize } from './workbenchViewportMotionTarget'
import {
  readWorkbenchViewportTargetZoom,
  transitionWorkbenchViewport,
  type WorkbenchViewportMotionIntent
} from './workbenchViewportMotion'

// Single-node navigation shares directional selection's center, readable scale
// and adaptive motion. Creation and explicit overview actions have other intents.
export function revealNavigatedWorkbenchNode({
  bounds,
  instance,
  motion,
  targetZoom
}: {
  readonly bounds: Rect
  readonly instance: ReactFlowInstance<WorkbenchFlowNode, Edge>
  readonly motion?: WorkbenchViewportMotionIntent
  readonly targetZoom?: number
}): Promise<boolean> {
  const canvasSize = resolveWorkbenchCommandCanvasSize(motion ?? { type: 'spatial' }, {
    width: 960,
    height: 640
  })
  return transitionWorkbenchViewport(instance, {
    type: 'center',
    center: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
    intent: motion ?? { type: 'adaptive-focus', canvasSize },
    zoom:
      targetZoom ??
      resolveWorkbenchNodeFocusZoom({
        canvasSize,
        currentZoom: readWorkbenchViewportTargetZoom(instance),
        nodeSize: bounds
      })
  })
}

// Collection navigation keeps every visible target below canvas chrome. Callers
// own which objects to reveal; they do not own another fit/zoom/motion policy.
export function focusWorkbenchNodesInCanvas(
  instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
  nodes: readonly WorkbenchFlowNode[]
): boolean {
  if (nodes.length === 0 || nodes.some(isWorkbenchNodePresentationHidden)) return false
  let geometry: ReturnType<typeof readWorkbenchCanvasCreationGeometry>
  try {
    geometry = readWorkbenchCanvasCreationGeometry()
  } catch {
    return false
  }
  const { canvasSize, safeViewport } = geometry
  const bounds = instance.getNodesBounds([...nodes])
  const preferredZoom = resolveWorkbenchNodeFocusZoom({
    canvasSize,
    currentZoom: readWorkbenchViewportTargetZoom(instance),
    nodeSize: bounds
  })
  const viewport = getViewportForBounds(
    bounds,
    safeViewport.width,
    safeViewport.height,
    minimumCanvasZoom,
    preferredZoom,
    0.24
  )
  void transitionWorkbenchViewport(instance, {
    intent: { type: 'adaptive-focus', canvasSize },
    type: 'set-viewport',
    viewport: { ...viewport, x: viewport.x + safeViewport.x, y: viewport.y + safeViewport.y }
  })
  return true
}
