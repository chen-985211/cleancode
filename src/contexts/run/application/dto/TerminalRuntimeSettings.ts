export const terminalScrollbackOptions = [1000, 5000, 10000] as const

export type TerminalScrollbackRows = (typeof terminalScrollbackOptions)[number]

export const defaultTerminalScrollbackRows: TerminalScrollbackRows = 1000

export function isTerminalScrollbackRows(value: unknown): value is TerminalScrollbackRows {
  return terminalScrollbackOptions.some((option) => option === value)
}
