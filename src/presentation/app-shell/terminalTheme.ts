import type { ITheme, Terminal as XTerm } from '@xterm/xterm'

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
  const styles = getComputedStyle(root)

  return Object.fromEntries(
    Object.entries(terminalThemeVariables).map(([key, variable]) => [
      key,
      styles.getPropertyValue(variable).trim()
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
