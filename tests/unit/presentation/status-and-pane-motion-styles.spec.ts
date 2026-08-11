import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const notificationStyles = readStyles('notifications.css')
const branchFormStyles = readStyles('project-sidebar-branch-workspace-form.css')
const projectRemovalStyles = readStyles('project-sidebar-project-removal.css')
const applicationSettingsStyles = readStyles('application-settings.css')

describe('status and pane motion styles', () => {
  it('keeps every notification on one fixed card geometry and surface', () => {
    const cardRule = readRule(notificationStyles, '.notification-card')
    const bodyRule = readRule(notificationStyles, '.notification-card__body')
    const iconRule = readRule(notificationStyles, '.notification-card__icon')
    const dismissRule = readRule(notificationStyles, '.notification-card__dismiss')
    const actionRule = readRule(notificationStyles, '.notification-card__action')
    const controlsRule = readRule(notificationStyles, '.notification-card__controls')

    expect(notificationStyles).toContain('width: min(300px, calc(100vw - 82px));')
    expect(notificationStyles).toContain(
      'width: min(300px, calc(100vw - var(--cc-shell-control-inset) * 2 - 2px));'
    )
    expect(notificationStyles).not.toContain('.notification-card--compact')
    expect(cardRule).toContain('flex: 0 0 62px;')
    expect(cardRule).toContain('height: 62px;')
    expect(cardRule).toContain('min-height: 62px;')
    expect(cardRule).toContain('max-height: 62px;')
    expect(cardRule).toContain('background: var(--cc-surface);')
    expect(cardRule).toContain('box-shadow: var(--cc-shadow-xs);')
    expect(cardRule).not.toContain('backdrop-filter')
    expect(bodyRule).toContain('grid-template-columns: 24px minmax(0, 1fr);')
    expect(bodyRule).toContain('background: transparent;')
    expect(bodyRule).toContain('height: 100%;')
    expect(iconRule).toContain('width: 24px;')
    expect(iconRule).toContain('height: 24px;')
    expect(dismissRule).toContain('width: 24px;')
    expect(dismissRule).toContain('height: 24px;')
    expect(actionRule).toContain('width: 24px;')
    expect(actionRule).toContain('height: 24px;')
    expect(controlsRule).toContain('gap: 4px;')
    expect(notificationStyles).toContain(
      'max-height: calc(100vh - var(--notification-viewport-top) - 12px);'
    )
  })

  it('uses spring-owned spatial properties while titles crossfade independently', () => {
    const iconLayerRule = readRule(notificationStyles, '.notification-card__icon-layer')
    const outgoingRule = readRule(
      notificationStyles,
      ".notification-card__title-layer[data-notification-status-motion-state='outgoing']"
    )

    expect(iconLayerRule).toContain('var(--notification-icon-motion-opacity, 1)')
    expect(iconLayerRule).toContain('var(--notification-icon-motion-y, 0px)')
    expect(iconLayerRule).toContain('var(--notification-icon-motion-scale, 1)')
    expect(iconLayerRule).not.toContain('transition:')
    expect(outgoingRule).toContain('opacity: 0;')
    expect(outgoingRule).toContain('translate3d(0, -6px, 0)')
    expect(notificationStyles).toContain(
      ".notification-card__title-layer[data-notification-status-motion-state='current']"
    )
  })

  it('anchors the branch workspace surface directly below its project action', () => {
    const owningProjectCardRule = readRule(
      branchFormStyles,
      '.project-card:has(> .branch-workspace-surface)'
    )
    const surfaceRule = readRule(branchFormStyles, '.branch-workspace-surface')

    expect(owningProjectCardRule).toContain('z-index: 7;')
    expect(surfaceRule).toContain('position: absolute;')
    expect(surfaceRule).toContain('top: 32px;')
    expect(surfaceRule).toContain('right: 28px;')
    expect(surfaceRule).toContain('box-shadow: var(--cc-shadow-floating);')
    expect(surfaceRule).toContain('var(--branch-workspace-motion-opacity, 1)')
    expect(surfaceRule).toContain('var(--branch-workspace-motion-y, 0px)')
    expect(surfaceRule).toContain('var(--branch-workspace-motion-scale, 1)')
    expect(surfaceRule).not.toContain('transition:')
  })

  it('elevates the project card that owns the project removal surface', () => {
    const owningProjectCardRule = readRule(
      projectRemovalStyles,
      '.project-card:has(> .project-removal-popover)'
    )
    const surfaceRule = readRule(projectRemovalStyles, '.project-removal-popover')

    expect(owningProjectCardRule).toContain('z-index: 7;')
    expect(surfaceRule).toContain('position: absolute;')
    expect(surfaceRule).toContain('z-index: 55;')
  })

  it('projects settings pane spring values onto compositor-only properties', () => {
    const contentRule = readRule(applicationSettingsStyles, '.application-settings-content')
    const paneLayerRule = readRule(
      applicationSettingsStyles,
      '.application-settings-pane-transition__layer'
    )

    expect(contentRule).toContain('scrollbar-gutter: stable;')
    expect(paneLayerRule).toContain('var(--application-settings-pane-motion-opacity, 1)')
    expect(paneLayerRule).toContain(
      'translate3d(var(--application-settings-pane-motion-x, 0), 0, 0)'
    )
    expect(applicationSettingsStyles).toContain(
      ".application-settings-pane-transition__layer[data-application-settings-pane-role='outgoing']"
    )
  })
})

function readStyles(fileName: string): string {
  return readFileSync(
    resolve(process.cwd(), 'src', 'presentation', 'app-shell', 'styles', fileName),
    'utf8'
  )
}

function readRule(styles: string, selector: string): string {
  return styles.split(`${selector} {`)[1]?.split('\n}')[0] ?? ''
}
