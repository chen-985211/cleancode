import type { TerminalSourceTheme } from '../../domain/aggregates/TerminalSession'

export const terminalEmulationName = 'xterm-256color'

const reservedCapabilityNames = new Set(['term', 'colorterm', 'term_program', 'colorfgbg'])

export function createTerminalCapabilityEnvironment(
  environment: Readonly<Record<string, string>> | undefined,
  terminalSourceTheme: TerminalSourceTheme
): Readonly<Record<string, string>> {
  const unreservedEnvironment = Object.fromEntries(
    Object.entries(environment ?? {}).filter(
      ([name]) => !reservedCapabilityNames.has(name.toLowerCase())
    )
  )

  return {
    ...unreservedEnvironment,
    TERM: terminalEmulationName,
    COLORTERM: 'truecolor',
    TERM_PROGRAM: 'cleancode',
    COLORFGBG: terminalSourceTheme === 'light' ? '0;15' : '15;0'
  }
}
