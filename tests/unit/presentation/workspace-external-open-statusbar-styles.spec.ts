import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const styles = readFileSync(
  resolve(process.cwd(), 'src/presentation/app-shell/styles/workspace-external-open.css'),
  'utf8'
)
const themeStyles = readFileSync(
  resolve(process.cwd(), 'src/presentation/app-shell/styles/theme.css'),
  'utf8'
)

describe('workspace external open statusbar styles', () => {
  it('integrates the control into the statusbar instead of floating above it', () => {
    const controlRule = readRule('.workspace-external-open-control')
    const buttonRule = readRule('.workspace-external-open-control__button')
    const menuButtonRule = readRule('.workspace-external-open-control__button--menu')
    const appIconRule = readRule('.workspace-external-open-control__app-icon')
    const menuRule = readRule('.workspace-external-open-menu')
    const menuItemRule = readRule('.workspace-external-open-menu__item')
    const menuItemInteractiveRule = readRule(
      '.workspace-external-open-menu__item:hover:not(:disabled),\n.workspace-external-open-menu__item:focus-visible'
    )
    const buttonHoverRule = readRule(
      '.workspace-external-open-control__button:hover:not(:disabled)'
    )
    const menuButtonStateRule = readRule(
      ".workspace-external-open-control__button--menu:hover:not(:disabled),\n.workspace-external-open-control__button--menu[aria-expanded='true']"
    )
    const interactiveGroupRule = readRule(
      ".workspace-external-open-control:hover,\n.workspace-external-open-control:focus-within,\n.workspace-external-open-control[data-menu-open='true']"
    )

    expect(controlRule).toContain('height: 22px;')
    expect(controlRule).toContain('gap: 1px;')
    expect(controlRule).toContain('border: 1px solid transparent;')
    expect(controlRule).toContain('border-radius: 6px;')
    expect(controlRule).toContain('background: transparent;')
    expect(controlRule).toContain('box-shadow: none;')
    expect(interactiveGroupRule).toContain('border-color: var(--cc-border);')
    expect(interactiveGroupRule).toContain('background: var(--cc-surface);')
    expect(interactiveGroupRule).toContain('box-shadow: var(--cc-shadow-xs);')
    expect(interactiveGroupRule).toContain('color: var(--cc-foreground);')
    expect(buttonRule).toContain('border-radius: 4px;')
    expect(buttonHoverRule).toContain('background: var(--cc-surface-subtle);')
    expect(menuButtonRule).toContain('width: 17px;')
    expect(menuButtonRule).not.toContain('border-left:')
    expect(menuButtonStateRule).toContain('background: var(--cc-primary-border);')
    expect(menuButtonStateRule).toContain('color: var(--cc-primary-hover);')
    expect(appIconRule).toContain('width: 16px;')
    expect(appIconRule).toContain('height: 16px;')
    expect(appIconRule).toContain('background: var(--cc-brand-vscode);')
    expect(appIconRule).toContain("mask: url('../assets/vscode-code-icon.svg')")
    expect(menuRule).toContain('border-radius: 12px;')
    expect(menuRule).toContain('padding: 6px;')
    expect(menuItemRule).toContain('border-radius: 7px;')
    expect(menuItemRule).toContain('font-size: 13px;')
    expect(menuItemRule).toContain('var(--cc-motion-duration-feedback)')
    expect(menuItemInteractiveRule).toContain('background: var(--cc-surface-subtle);')
    expect(menuItemInteractiveRule).toContain('color: var(--cc-foreground);')
    expect(menuItemInteractiveRule).not.toContain('var(--cc-neutral-overlay)')
    expect(styles).not.toContain('.workspace-external-open-control--split {')
  })

  it('defines the menu hover surface independently in light and dark themes', () => {
    const lightThemeRule = readThemeRule(":root,\n:root[data-theme='light']")
    const darkThemeRule = readThemeRule(":root[data-theme='dark']")

    expect(lightThemeRule).toContain('--cc-surface-subtle:')
    expect(lightThemeRule).toContain('--cc-surface-overlay:')
    expect(darkThemeRule).toContain('--cc-surface-subtle:')
    expect(darkThemeRule).toContain('--cc-surface-overlay:')
    expect(readToken(lightThemeRule, '--cc-surface-subtle')).not.toBe(
      readToken(lightThemeRule, '--cc-surface-overlay')
    )
    expect(readToken(darkThemeRule, '--cc-surface-subtle')).not.toBe(
      readToken(darkThemeRule, '--cc-surface-overlay')
    )
  })
})

function readRule(selector: string): string {
  return styles.split(`${selector} {`)[1]?.split('\n}')[0] ?? ''
}

function readThemeRule(selector: string): string {
  return themeStyles.split(`${selector} {`)[1]?.split('\n}')[0] ?? ''
}

function readToken(rule: string, token: string): string {
  return rule.match(new RegExp(`${token}: ([^;]+);`))?.[1] ?? ''
}
