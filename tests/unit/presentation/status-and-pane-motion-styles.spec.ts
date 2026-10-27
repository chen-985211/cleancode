import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const notificationStyles = readStyles('app-features/notifications/notifications.css')
const branchFormStyles = readProjectStyles('project-sidebar-branch-workspace-form.css')
const projectRemovalStyles = readProjectStyles('project-sidebar-project-removal.css')
const applicationSettingsStyles = readStyles('app-features/settings/application-settings.css')

describe('status and pane motion styles', () => {
  it('keeps every notification on one fixed card geometry and surface', () => {
    const cardRule = readRule(notificationStyles, '.notification-card')
    const bodyRule = readRule(notificationStyles, '.notification-card__body')
    const identityRule = readRule(notificationStyles, '.notification-card__identity')
    const controlRule = readRule(notificationStyles, '.notification-card__expand')
    const controlsRule = readRule(notificationStyles, '.notification-card__controls')
    const viewportRule = readRule(notificationStyles, '.notification-viewport')
    const cardHeight = readDeclaration(cardRule, 'height')

    expect(readDeclaration(readRule(notificationStyles, '.notification-stack'), 'width')).toMatch(
      /^min\(.+, calc\(100vw - /
    )
    expect(readDeclaration(viewportRule, 'max-height')).toContain(
      'calc(100vh - var(--notification-viewport-top)'
    )
    expect(viewportRule).toContain('background: transparent;')
    expect(viewportRule).toContain('overflow-y: auto;')
    expect(notificationStyles).not.toContain('.notification-card--compact')
    expect(cardHeight).toBe('var(--notification-card-height)')
    expect(readDeclaration(viewportRule, '--notification-card-height')).toMatch(/^\d+px$/)
    expect(readDeclaration(cardRule, 'min-height')).toBe(cardHeight)
    expect(readDeclaration(cardRule, 'max-height')).toBe(cardHeight)
    expect(cardRule).toContain('border: 1px solid var(--cc-border);')
    expect(cardRule).toContain('background: var(--cc-surface);')
    expect(cardRule).toContain('box-shadow: var(--cc-shadow-xs);')
    expect(cardRule).not.toContain('backdrop-filter')
    expect(bodyRule).toContain('background: transparent;')
    expect(bodyRule).toContain('height: 100%;')
    expect(bodyRule).toContain('min-width: 0;')
    expect(Number.parseFloat(readDeclaration(controlRule, 'min-width'))).toBeGreaterThanOrEqual(24)
    expect(readDeclaration(identityRule, 'width')).toBe(readDeclaration(identityRule, 'height'))
    expect(controlsRule).toContain('flex: 0 0 auto;')
    for (const [, variantRule] of notificationStyles.matchAll(
      /\.notification-card--[\w-]+ \{([^}]+)\}/g
    )) {
      expect(variantRule).not.toMatch(
        /\n\s*(?:[\w-]*height|width|padding|background|border|box-shadow):/
      )
    }
  })

  it('uses finite stack and title transitions without continuous notification animation', () => {
    const stackRule = readRule(notificationStyles, '.notification-stack-item')
    const outgoingRule = readRule(
      notificationStyles,
      ".notification-card__title-layer[data-notification-status-motion-state='outgoing']"
    )

    expect(stackRule).toContain('var(--notification-index)')
    expect(stackRule).toContain('var(--cc-motion-duration-surface)')
    expect(notificationStyles).not.toMatch(/\binfinite\b/)
    expect(outgoingRule).toContain('opacity: 0;')
    expect(outgoingRule).toContain('translate3d(')
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
  return readFileSync(resolve(process.cwd(), 'src', 'presentation', 'app-shell', fileName), 'utf8')
}

function readProjectStyles(fileName: string): string {
  return readFileSync(
    resolve(process.cwd(), 'src/contexts/project/presentation/styles', fileName),
    'utf8'
  )
}

function readRule(styles: string, selector: string): string {
  return `\n${styles}`.split(`\n${selector} {`)[1]?.split('\n}')[0] ?? ''
}

function readDeclaration(rule: string, property: string): string {
  return rule.match(new RegExp(`(?:^|\\n)\\s*${property}: ([^;]+);`))?.[1] ?? ''
}
