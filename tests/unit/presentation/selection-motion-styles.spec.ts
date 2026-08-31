import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appShellStyles = readFileSync(
  resolve(process.cwd(), 'src/presentation/app-shell/AppShell.css'),
  'utf8'
)
const sharedSelectionStyles = readFileSync(
  resolve(process.cwd(), 'src/presentation/shared/styles/selection-motion.css'),
  'utf8'
)
const applicationSwitchStyles = readFileSync(
  resolve(process.cwd(), 'src/presentation/shared/styles/application-settings-switch.css'),
  'utf8'
)
const selectionStyles = readStyles('selection-motion.css')
const settingsStyles = readStyles('application-settings.css')
const agentSettingsStyles = readFileSync(
  resolve(process.cwd(), 'src/contexts/agent/presentation/styles/agent-settings.css'),
  'utf8'
)
const libraryStyles = readStyles('block-template-library.css')
const projectSidebarStyles = readFileSync(
  resolve(process.cwd(), 'src/contexts/project/presentation/styles/project-sidebar.css'),
  'utf8'
)
const themeStyles = readStyles('theme-settings.css')

describe('selection motion styles', () => {
  it('projects the shared moving material with compositor-only translation', () => {
    expect(appShellStyles).toContain("@import '../shared/styles/selection-motion.css';")
    const indicatorRule = readRule(sharedSelectionStyles, '.selection-motion-indicator')

    expect(indicatorRule).toContain('var(--cc-selection-motion-width, 0px)')
    expect(indicatorRule).toContain('var(--cc-selection-motion-height, 0px)')
    expect(indicatorRule).toContain('transform: translate3d(')
    expect(indicatorRule).toContain('var(--cc-selection-motion-x, 0px)')
    expect(indicatorRule).toContain('var(--cc-selection-motion-y, 0px)')
    expect(indicatorRule).not.toContain('transition:')
  })

  it('uses the shared material in settings navigation, workspace rows, and template scope tabs', () => {
    expect(selectionStyles).toContain('.application-settings-navigation__selection')
    expect(projectSidebarStyles).toContain('.workspace-list__selection')
    expect(libraryStyles).toContain('.block-template-library-tabs__selection')
    expect(readRule(settingsStyles, '.application-settings-navigation button')).toContain(
      'z-index: 1;'
    )
    expect(readRule(projectSidebarStyles, '.workspace-list')).toContain('position: relative;')
    expect(readRule(projectSidebarStyles, '.workspace-group')).toContain('z-index: 1;')
    expect(readRule(libraryStyles, '.block-template-library-tabs button')).toContain('z-index: 1;')
  })

  it('keeps an initial selected material until delayed settings geometry is projected', () => {
    expect(selectionStyles).toContain(
      ".application-settings-navigation:not([data-selection-motion-ready='true'])"
    )
    expect(selectionStyles).toContain("button[aria-current='page']::before")
    expect(projectSidebarStyles).toContain(
      ".workspace-list:not([data-selection-motion-ready='true'])"
    )
  })

  it('drives settings switches and stateful choices from shared spring progress', () => {
    expect(appShellStyles).toContain("@import '../shared/styles/application-settings-switch.css';")
    const switchThumbRule = readRule(applicationSwitchStyles, '.application-settings-switch span')

    expect(switchThumbRule).toContain('var(--cc-selection-motion-progress, 0)')
    expect(switchThumbRule).not.toContain('transition: transform')
    expect(selectionStyles).toContain('.terminal-settings-options__selection')
    expect(agentSettingsStyles).toContain('.agent-settings-segmented__selection')
    expect(agentSettingsStyles).toContain('var(--cc-selection-motion-progress, 0)')
  })

  it('derives theme card emphasis and check presentation from shared selection progress', () => {
    const previewRule = readRule(themeStyles, '.theme-option__preview')
    const checkRule = readRule(themeStyles, '.theme-option__check')

    expect(previewRule).toContain('var(--cc-selection-motion-progress, 0)')
    expect(checkRule).toContain('var(--cc-selection-motion-progress, 0)')
    expect(previewRule).not.toContain('transform var(')
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
