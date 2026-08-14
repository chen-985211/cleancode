import { SidebarSimpleIcon } from '@phosphor-icons/react/dist/csr/SidebarSimple'
import type { Ref } from 'react'

import { useI18n } from './i18n/useI18n'
import { TooltipLabel } from './Tooltip'

export function ProjectSidebarToggle({
  buttonRef,
  isCollapsed,
  motionSurfaceRef,
  shortcutTooltip,
  onToggle
}: {
  readonly buttonRef: Ref<HTMLButtonElement>
  readonly isCollapsed: boolean
  readonly motionSurfaceRef: Ref<HTMLDivElement>
  readonly shortcutTooltip: string
  readonly onToggle: () => void
}) {
  const { t } = useI18n()

  return (
    <nav className="app-shell__titlebar-navigation" aria-label={t('app.windowNavigation')}>
      <div
        ref={motionSurfaceRef}
        className="app-shell__titlebar-navigation-surface"
        aria-hidden="true"
      />
      <span className="app-shell__titlebar-traffic-light-pad" aria-hidden="true" />
      <TooltipLabel content={shortcutTooltip} side="bottom">
        <button
          ref={buttonRef}
          className="project-sidebar-toggle"
          type="button"
          aria-controls="project-sidebar"
          aria-expanded={!isCollapsed}
          aria-label={t(isCollapsed ? 'sidebar.expand' : 'sidebar.collapse')}
          onClick={onToggle}
        >
          <SidebarSimpleIcon size={16} weight="bold" aria-hidden="true" />
        </button>
      </TooltipLabel>
    </nav>
  )
}
