import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const applicationSettingsStyles = readFileSync(
  resolve(process.cwd(), 'src/presentation/app-shell/styles/application-settings.css'),
  'utf8'
)
const agentSettingsStyles = readFileSync(
  resolve(process.cwd(), 'src/presentation/app-shell/styles/agent-settings.css'),
  'utf8'
)

function readRule(selector: string): string {
  return applicationSettingsStyles.split(`${selector} {`)[1]?.split('}')[0] ?? ''
}

function readAgentRule(selector: string): string {
  return agentSettingsStyles.split(`${selector} {`)[1]?.split('}')[0] ?? ''
}

describe('application settings visual hierarchy', () => {
  it('keeps the page chrome borderless on one continuous canvas surface', () => {
    const headerRule = readRule('.application-settings-header')
    const navigationRule = readRule('.application-settings-navigation')
    const contentRule = readRule('.application-settings-content')
    const selectedNavigationRule = readRule(
      ".application-settings-navigation button[aria-current='page']"
    )

    expect(headerRule).not.toContain('border-bottom')
    expect(headerRule).not.toContain('box-shadow')
    expect(navigationRule).not.toContain('border-right')
    expect(headerRule).toContain('background: var(--cc-canvas);')
    expect(navigationRule).toContain('background: var(--cc-canvas);')
    expect(contentRule).toContain('background: var(--cc-canvas);')
    expect(selectedNavigationRule).toContain('border-color: transparent;')
    expect(selectedNavigationRule).not.toContain('box-shadow')
  })

  it('keeps the macOS title-safe header and navigation proportion compact', () => {
    const macHeaderRule = readRule(
      '.application-settings-surface--mac .application-settings-header'
    )
    const layoutRule = readRule('.application-settings-layout')
    const backButtonRule = readRule('.application-settings-back')

    expect(macHeaderRule).toContain(
      'min-height: max(84px, calc(var(--cc-window-controls-height) + 54px));'
    )
    expect(layoutRule).toContain('grid-template-columns: clamp(200px, 16vw, 220px) minmax(0, 1fr);')
    expect(backButtonRule).toContain('width: 38px;')
    expect(backButtonRule).toContain('height: 38px;')
  })

  it('centers settings panes while keeping the single-control terminal pane compact', () => {
    const contentRule = readRule('.application-settings-content')
    const shortcutPaneRule = readRule('.shortcut-settings-pane')
    const terminalPaneRule = readRule('.terminal-settings-pane')
    const agentPaneRule = readAgentRule('.agent-settings-pane')

    expect(contentRule).toContain('justify-items: center;')
    expect(shortcutPaneRule).toContain('width: min(100%, 1120px);')
    expect(terminalPaneRule).toContain('width: min(100%, 760px);')
    expect(agentPaneRule).toContain('width: min(100%, 1120px);')
  })
})
