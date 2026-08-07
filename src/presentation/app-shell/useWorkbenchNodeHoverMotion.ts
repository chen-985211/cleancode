import { useEffect, useMemo, type PointerEvent } from 'react'

import {
  createWorkbenchNodeHoverMotionController,
  type WorkbenchNodeHoverMotionSurface
} from './workbenchNodeHoverMotion'
import { prefersReducedMotion } from './workbenchViewportMotionEnvironment'

interface WorkbenchNodeHoverMotionHandlers {
  readonly continuePointerMotion: (event: PointerEvent<HTMLElement>) => void
  readonly leaveCanvas: () => void
  readonly suspend: () => void
}

const nodeSurfaceSelector = '.terminal-node, .terminal-group-node, .agent-console-node'

export function useWorkbenchNodeHoverMotion(): WorkbenchNodeHoverMotionHandlers {
  const controller = useMemo(() => createWorkbenchNodeHoverMotionController(), [])

  useEffect(() => () => controller.dispose(), [controller])

  return {
    continuePointerMotion: (event) => {
      if (
        event.pointerType !== 'mouse' ||
        event.buttons !== 0 ||
        prefersReducedMotion() ||
        event.currentTarget.classList.contains('canvas-surface--dragging-terminal')
      ) {
        controller.suspend()
        return
      }

      controller.pointerMoved(resolveNodeSurface(event), {
        x: event.clientX,
        y: event.clientY
      })
    },
    leaveCanvas: controller.suspend,
    suspend: controller.suspend
  }
}

function resolveNodeSurface(
  event: PointerEvent<HTMLElement>
): WorkbenchNodeHoverMotionSurface | null {
  if (!(event.target instanceof Element)) return null

  const surface = event.target.closest<HTMLElement>(nodeSurfaceSelector)
  if (!surface || !event.currentTarget.contains(surface)) return null
  if (surface.closest('.react-flow__node')?.classList.contains('dragging')) return null
  if (
    [...surface.classList].some((className) => className.startsWith('workbench-object-motion--'))
  ) {
    return null
  }

  return surface
}
