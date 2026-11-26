import type { OnMove, Viewport } from '@xyflow/react'
import { useRef } from 'react'

interface CanvasMoveHandlers {
  onMoveStart: OnMove
  onMove: OnMove
  onMoveEnd: OnMove
}

// React Flow reports a start/end pair even for a stationary mouse click.
export function useCanvasMoveHandlers(
  getViewport: () => Viewport,
  handlers: CanvasMoveHandlers
): CanvasMoveHandlers {
  const lastPanMove = useRef<number | null>(null)
  return {
    onMoveStart(event, viewport) {
      if (event?.type !== 'mousedown') handlers.onMoveStart(event, viewport)
    },
    onMove(event, viewport) {
      if (event?.type === 'mousemove') {
        const current = getViewport()
        if (current.x === viewport.x && current.y === viewport.y && current.zoom === viewport.zoom)
          return
        if (lastPanMove.current === null) handlers.onMoveStart(event, viewport)
        lastPanMove.current = event.timeStamp
      }
      handlers.onMove(event, viewport)
    },
    onMoveEnd(event, viewport) {
      if (event?.type === 'mouseup') {
        // A deferred end from an earlier press must not finish a newer drag.
        if (lastPanMove.current === null || event.timeStamp < lastPanMove.current) return
        lastPanMove.current = null
      }
      handlers.onMoveEnd(event, viewport)
    }
  }
}
