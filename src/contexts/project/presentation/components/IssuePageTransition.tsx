import { useRef, useState, type ReactNode } from 'react'
import { useSurfaceMotionPresence } from '../../../../presentation/shared/hooks/useSurfaceMotionPresence'
import { useSurfaceSpringMotion } from '../../../../presentation/shared/hooks/useSurfaceSpringMotion'

export function IssuePageTransition({
  children,
  detail
}: {
  readonly children: ReactNode
  readonly detail: ReactNode
}) {
  const root = useRef<HTMLDivElement>(null)
  const [retainedDetail, setRetainedDetail] = useState(detail)
  const showingDetail = Boolean(detail)
  // Keep the outgoing page until the shared spring settles; a reverse reuses its DOM.
  if (detail && detail !== retainedDetail) setRetainedDetail(detail)
  const presence = useSurfaceMotionPresence(showingDetail, {
    onExitComplete: () => setRetainedDetail(null)
  })
  useSurfaceSpringMotion(showingDetail, root, presence, 'page-right')

  return (
    <div
      ref={root}
      className="project-issues__pages"
      data-page-motion-state={presence.phase}
      data-page-target={showingDetail ? 'detail' : 'list'}
    >
      <div
        className="project-issues__list-page"
        aria-hidden={showingDetail || undefined}
        inert={showingDetail}
      >
        {children}
      </div>
      <div
        className="project-issues__detail-page"
        hidden={!presence.isPresent}
        aria-hidden={!showingDetail || undefined}
        inert={!showingDetail}
      >
        {detail || retainedDetail}
      </div>
    </div>
  )
}
