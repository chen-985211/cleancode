import type { TerminalSourceTheme } from '../../domain/aggregates/TerminalSession'

export function createPowerShellConsoleThemeScript(theme: TerminalSourceTheme): string {
  const colors =
    theme === 'light'
      ? { background: 'White', foreground: 'Black' }
      : { background: 'Black', foreground: 'Gray' }

  return [
    `[Console]::ForegroundColor = [ConsoleColor]::${colors.foreground}`,
    `[Console]::BackgroundColor = [ConsoleColor]::${colors.background}`
  ].join('\n')
}
