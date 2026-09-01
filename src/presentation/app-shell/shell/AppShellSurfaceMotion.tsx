import { forwardRef } from 'react'

import {
  AnchoredSurfaceMotion,
  OverlaySurfaceMotion as SharedOverlaySurfaceMotion,
  type OverlaySurfaceMotionProps
} from '../../shared/components/SurfaceMotion'

export { AnchoredSurfaceMotion }

export const OverlaySurfaceMotion = forwardRef<HTMLDivElement, OverlaySurfaceMotionProps>(
  function AppShellOverlaySurfaceMotion({ isolationTargets, ...surfaceProps }, ref) {
    return (
      <SharedOverlaySurfaceMotion
        {...surfaceProps}
        isolationTargets={isolationTargets ?? resolveAppShellSurfaceIsolationTargets}
        ref={ref}
      />
    )
  }
)

function resolveAppShellSurfaceIsolationTargets(): readonly HTMLElement[] {
  const root = document.getElementById('root')
  if (root) return [root]
  return Array.from(
    document.querySelectorAll<HTMLElement>('.project-sidebar, .app-shell__workspace')
  )
}
