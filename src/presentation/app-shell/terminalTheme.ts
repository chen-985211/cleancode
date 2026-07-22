import type { ITheme } from '@xterm/xterm'

import { canonicalTerminalPalettes } from '../../contexts/run/application/dto/TerminalPalette.generated'
import type { EffectiveTheme } from './themePreference'

export function readCanonicalTerminalSearchTheme(theme: EffectiveTheme): {
  readonly active: string
  readonly border: string
  readonly match: string
} {
  return readTerminalSearchThemeVariables(document.documentElement, (variable) =>
    variable.replace('--cc-terminal-', `--cc-terminal-${theme}-`)
  )
}

function readTerminalSearchThemeVariables(
  root: HTMLElement,
  resolveVariable: (variable: string) => string
): {
  readonly active: string
  readonly border: string
  readonly match: string
} {
  const styles = getComputedStyle(root)
  return {
    active: styles.getPropertyValue(resolveVariable('--cc-terminal-search-active')).trim(),
    border: styles.getPropertyValue(resolveVariable('--cc-terminal-search-border')).trim(),
    match: styles.getPropertyValue(resolveVariable('--cc-terminal-search-match')).trim()
  }
}

export function readCanonicalTerminalTheme(theme: EffectiveTheme): ITheme {
  return canonicalTerminalPalettes[theme]
}

export function readTerminalSourceTheme(
  root: HTMLElement = document.documentElement
): EffectiveTheme {
  return root.dataset.theme === 'light' ? 'light' : 'dark'
}
