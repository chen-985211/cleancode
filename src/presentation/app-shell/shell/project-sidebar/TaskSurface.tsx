import { useLayoutEffect, type ReactNode, type Ref, type RefObject } from 'react'
import { useSurfaceMotionPresence } from '../../../shared/hooks/useSurfaceMotionPresence'
import { useSurfaceSpringMotion } from '../../../shared/hooks/useSurfaceSpringMotion'
import { acquireSurfaceIsolationLease } from '../../../shared/motion/surfaceIsolation'

export function TaskSurface({
  open,
  surfaceRef,
  sidebarMotionRef,
  onExitComplete,
  children
}: {
  readonly open: boolean
  readonly surfaceRef: RefObject<HTMLDivElement | null>
  readonly sidebarMotionRef?: Ref<HTMLDivElement>
  readonly onExitComplete: () => void
  readonly children: ReactNode
}) {
  const presence = useSurfaceMotionPresence(open, { onExitComplete })
  useSurfaceSpringMotion(open, surfaceRef, presence, 'fullscreen-bottom')
  useLayoutEffect(() => {
    if (!open) return
    const shell = surfaceRef.current?.closest('.app-shell')
    const targets = shell
      ? Array.from(
          shell.querySelectorAll<HTMLElement>(
            ':scope > .app-shell__workspace, :scope > .app-shell__settings'
          )
        )
      : []
    return acquireSurfaceIsolationLease(targets)
  }, [open, surfaceRef])
  return (
    <div ref={sidebarMotionRef} className="task-surface-host" hidden={!presence.isPresent}>
      <div
        ref={surfaceRef}
        className="task-surface anchored-surface-motion"
        data-surface-spring-preset="fullscreen-bottom"
        data-shortcut-capture=""
        data-shortcut-allow="toggleSidebar"
        {...presence.surfaceProps}
      >
        {children}
      </div>
    </div>
  )
}
