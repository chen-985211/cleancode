import { useEffect, useRef, type RefObject } from 'react'
import type { TerminalFlowNode } from '../../../types/terminalFlowNode'

export function useTerminalLaunchCommandEditing({
  data,
  ready,
  surfaceRef,
  onEdit
}: {
  readonly data: Pick<
    TerminalFlowNode['data'],
    'block' | 'launchCommandEditRequestId' | 'onResizeBlock'
  >
  readonly ready: boolean
  readonly surfaceRef: RefObject<HTMLElement | null>
  readonly onEdit: () => void
}): void {
  const lastRequestRef = useRef<number | undefined>(undefined)
  const pendingRequestRef = useRef<number | null>(null)
  useEffect(() => {
    const requestId = data.launchCommandEditRequestId
    if (requestId === undefined) {
      pendingRequestRef.current = null
      return
    }
    if (requestId !== lastRequestRef.current) {
      lastRequestRef.current = requestId
      pendingRequestRef.current = requestId
      if (data.block.isCollapsed) {
        void Promise.resolve(
          data.onResizeBlock(data.block, {
            position: data.block.position,
            size: data.block.size,
            isCollapsed: false
          })
        ).catch(() => {
          if (pendingRequestRef.current === requestId) pendingRequestRef.current = null
        })
      }
    }
    if (!ready || pendingRequestRef.current !== requestId) return
    // React Flow can hide a newly expanded node until its dimensions are measured.
    // Focusing a descendant during that interval is silently ignored by the browser.
    let frame: number
    const openWhenVisible = () => {
      if (pendingRequestRef.current !== requestId) return
      const surface = surfaceRef.current
      if (
        !surface ||
        surface.closest('[inert]') ||
        getComputedStyle(surface).visibility !== 'visible'
      ) {
        frame = requestAnimationFrame(openWhenVisible)
        return
      }
      pendingRequestRef.current = null
      onEdit()
    }
    frame = requestAnimationFrame(openWhenVisible)
    return () => cancelAnimationFrame(frame)
  }, [data, onEdit, ready, surfaceRef])
}
