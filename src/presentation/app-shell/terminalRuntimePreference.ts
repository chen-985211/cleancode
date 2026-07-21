import {
  defaultTerminalScrollbackRows,
  isTerminalScrollbackRows,
  terminalScrollbackOptions,
  type TerminalScrollbackRows
} from '../../contexts/run/application/dto/TerminalRuntimeSettings'

const terminalRuntimePreferenceStorageKey = 'cleancode.terminal-runtime-preference'

export { defaultTerminalScrollbackRows, terminalScrollbackOptions }

export interface TerminalRuntimePreference {
  readonly scrollbackRows: TerminalScrollbackRows
}

export function readTerminalRuntimePreference(
  storage: Pick<Storage, 'getItem'> = window.localStorage
): TerminalRuntimePreference {
  const stored = storage.getItem(terminalRuntimePreferenceStorageKey)
  if (stored === null) return { scrollbackRows: defaultTerminalScrollbackRows }

  try {
    const value = JSON.parse(stored) as {
      readonly scrollbackRows?: unknown
      readonly version?: unknown
    }
    return value.version === 1 && isTerminalScrollbackRows(value.scrollbackRows)
      ? { scrollbackRows: value.scrollbackRows }
      : { scrollbackRows: defaultTerminalScrollbackRows }
  } catch {
    return { scrollbackRows: defaultTerminalScrollbackRows }
  }
}

export function writeTerminalRuntimePreference(
  preference: TerminalRuntimePreference,
  storage: Pick<Storage, 'setItem'> = window.localStorage
): void {
  storage.setItem(
    terminalRuntimePreferenceStorageKey,
    JSON.stringify({ version: 1, scrollbackRows: preference.scrollbackRows })
  )
}
