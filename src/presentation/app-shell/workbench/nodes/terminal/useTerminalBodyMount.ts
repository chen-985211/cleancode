import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

// The shell owns first-click feedback. Wait for visible size progress, then yield
// its paint before mounting xterm and the expanded controls. Later disclosure keeps them warm.
export function useTerminalBodyMount(
  expanded: boolean,
  initializationBlocked: boolean,
  surfaceRef: RefObject<HTMLElement | null>
): boolean {
  const [mounted, setMounted] = useState(expanded)
  const collapsedSize = useRef<{ width: number; height: number } | null>(null)
  useLayoutEffect(() => {
    if (!expanded && !mounted)
      collapsedSize.current = surfaceRef.current?.getBoundingClientRect() ?? null
  }, [expanded, mounted, surfaceRef])
  useEffect(() => {
    if (mounted || !expanded || initializationBlocked) return
    let task: number | undefined
    let frame: number
    const waitForFeedback = () => {
      const before = collapsedSize.current
      const current = surfaceRef.current?.getBoundingClientRect()
      const visibleProgress =
        current &&
        current.width > 0 &&
        current.height > 0 &&
        (!before ||
          Math.max(
            Math.abs(current.width - before.width),
            Math.abs(current.height - before.height)
          ) >= 1)
      if (!visibleProgress) {
        frame = window.requestAnimationFrame(waitForFeedback)
        return
      }
      frame = window.requestAnimationFrame(() => {
        task = window.setTimeout(() => setMounted(true), 0)
      })
    }
    frame = window.requestAnimationFrame(waitForFeedback)
    return () => {
      window.cancelAnimationFrame(frame)
      if (task !== undefined) window.clearTimeout(task)
    }
  }, [expanded, initializationBlocked, mounted, surfaceRef])
  return mounted
}
