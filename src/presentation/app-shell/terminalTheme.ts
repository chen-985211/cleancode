import type { ITheme, Terminal as XTerm } from '@xterm/xterm'

import type { AgentTerminalSourceTheme } from '../../contexts/agent/application/dto/AgentSessionProtocol'
import { effectiveThemeChangeEventName } from './themePreference'

const terminalThemeVariables = {
  background: '--cc-terminal-background',
  black: '--cc-terminal-black',
  blue: '--cc-terminal-blue',
  brightBlack: '--cc-terminal-bright-black',
  brightBlue: '--cc-terminal-bright-blue',
  brightCyan: '--cc-terminal-bright-cyan',
  brightGreen: '--cc-terminal-bright-green',
  brightMagenta: '--cc-terminal-bright-magenta',
  brightRed: '--cc-terminal-bright-red',
  brightWhite: '--cc-terminal-bright-white',
  brightYellow: '--cc-terminal-bright-yellow',
  cursor: '--cc-terminal-cursor',
  cyan: '--cc-terminal-cyan',
  foreground: '--cc-terminal-foreground',
  green: '--cc-terminal-green',
  magenta: '--cc-terminal-magenta',
  red: '--cc-terminal-red',
  selectionBackground: '--cc-terminal-selection',
  white: '--cc-terminal-white',
  yellow: '--cc-terminal-yellow'
} as const satisfies Partial<Record<keyof ITheme, string>>

export function readTerminalTheme(root: HTMLElement = document.documentElement): ITheme {
  return readTerminalThemeVariables(root, (variable) => variable)
}

export function readTerminalSearchTheme(root: HTMLElement = document.documentElement): {
  readonly active: string
  readonly border: string
  readonly match: string
} {
  const styles = getComputedStyle(root)
  return {
    active: styles.getPropertyValue('--cc-terminal-search-active').trim(),
    border: styles.getPropertyValue('--cc-terminal-search-border').trim(),
    match: styles.getPropertyValue('--cc-terminal-search-match').trim()
  }
}

export function readCanonicalTerminalTheme(theme: AgentTerminalSourceTheme): ITheme {
  return readTerminalThemeVariables(document.documentElement, (variable) =>
    variable.replace('--cc-terminal-', `--cc-terminal-${theme}-`)
  )
}

function readTerminalThemeVariables(
  root: HTMLElement,
  resolveVariable: (variable: string) => string
): ITheme {
  const styles = getComputedStyle(root)

  return Object.fromEntries(
    Object.entries(terminalThemeVariables).map(([key, variable]) => [
      key,
      styles.getPropertyValue(resolveVariable(variable)).trim()
    ])
  ) as ITheme
}

export function synchronizeTerminalTheme(terminal: XTerm): () => void {
  const updateTheme = (): void => {
    terminal.options.theme = readTerminalTheme()
  }

  window.addEventListener(effectiveThemeChangeEventName, updateTheme)

  return () => window.removeEventListener(effectiveThemeChangeEventName, updateTheme)
}
