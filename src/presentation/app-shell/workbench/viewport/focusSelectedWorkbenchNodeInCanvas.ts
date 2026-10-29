import type { Edge, ReactFlowInstance } from '@xyflow/react'
import type { WorkbenchFlowNode } from '../../types/workbenchFlowNode'
import type { CanvasNodeFocusMode } from '../../app-features/settings/canvasNodeFocusPreference'
import {
  resolveWorkbenchNodeCenter,
  type CanvasSize
} from '../../app-features/shortcuts/applicationShortcutNavigation'
import {
  resolveWorkbenchNodeFocusZoom,
  resolveWorkbenchNodeSize
} from './workbenchNodeFocusViewport'
import {
  readWorkbenchCanvasCreationGeometry,
  resolveWorkbenchSafeViewport
} from './workbenchCanvasSafeViewport'
import { resolveWorkbenchNodeRevealViewport } from './workbenchNodeRevealViewport'
import {
  readWorkbenchViewportPresentation,
  readWorkbenchViewportTargetZoom,
  transitionWorkbenchViewport
} from './workbenchViewportMotion'

export function focusSelectedWorkbenchNodeInCanvas(
  instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
  node: WorkbenchFlowNode,
  canvasSize: CanvasSize,
  mode: CanvasNodeFocusMode
): Promise<boolean> {
  const size = resolveWorkbenchNodeSize(node)
  const targetZoom = readWorkbenchViewportTargetZoom(instance)
  if (mode === 'center') {
    return transitionWorkbenchViewport(instance, {
      type: 'center',
      center: resolveWorkbenchNodeCenter(node),
      intent: { type: 'adaptive-focus', canvasSize },
      zoom: resolveWorkbenchNodeFocusZoom({ canvasSize, currentZoom: targetZoom, nodeSize: size })
    })
  }

  const geometry = readSelectionGeometry(canvasSize)
  if (!geometry) return Promise.resolve(false)
  const currentViewport = readWorkbenchViewportPresentation(instance)
  const viewport = resolveWorkbenchNodeRevealViewport({
    ...geometry,
    bounds: { ...node.position, ...size },
    currentViewport,
    targetZoom
  })
  const unchanged =
    viewport.x === currentViewport.x &&
    viewport.y === currentViewport.y &&
    viewport.zoom === currentViewport.zoom
  // A no-motion completion also replaces any older request and commits its final view.
  // Revealing uses the shared spring without the centering flight's temporary zoom-out.
  return transitionWorkbenchViewport(instance, {
    type: 'set-viewport',
    viewport,
    intent: { type: unchanged ? 'instant' : 'spatial' }
  })
}

function readSelectionGeometry(canvasSize: CanvasSize) {
  try {
    if (document.querySelector('.react-flow')) return readWorkbenchCanvasCreationGeometry()
    const width = canvasSize.width > 0 ? canvasSize.width : 960
    const height = canvasSize.height > 0 ? canvasSize.height : 640
    return {
      canvasSize: { width, height },
      safeViewport: resolveWorkbenchSafeViewport({
        canvasRect: { left: 0, top: 0, right: width, bottom: height },
        obstructionRects: []
      })
    }
  } catch {
    // A mounted but fully obstructed canvas has no valid positioning destination.
    return null
  }
}
