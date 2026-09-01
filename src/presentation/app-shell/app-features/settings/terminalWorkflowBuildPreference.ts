const terminalWorkflowBuildPreferenceStorageKey = 'cleancode.terminal-workflow-build-preference'

export type TerminalWorkflowBuildMode = 'progressive' | 'simultaneous'

export const defaultTerminalWorkflowBuildMode: TerminalWorkflowBuildMode = 'progressive'

export interface TerminalWorkflowBuildPreference {
  readonly mode: TerminalWorkflowBuildMode
}

export function readTerminalWorkflowBuildPreference(
  storage: Pick<Storage, 'getItem'> = window.localStorage
): TerminalWorkflowBuildPreference {
  const stored = storage.getItem(terminalWorkflowBuildPreferenceStorageKey)
  if (stored === null) return { mode: defaultTerminalWorkflowBuildMode }

  try {
    const value = JSON.parse(stored) as {
      readonly mode?: unknown
      readonly version?: unknown
    }

    if (value.version === 2 && isTerminalWorkflowBuildMode(value.mode)) {
      return { mode: value.mode }
    }
    if (value.version === 1 && value.mode === 'parallel') {
      return { mode: 'simultaneous' }
    }
    if (value.version === 1 && value.mode === 'progressive') {
      return { mode: 'progressive' }
    }
    return { mode: defaultTerminalWorkflowBuildMode }
  } catch {
    return { mode: defaultTerminalWorkflowBuildMode }
  }
}

export function writeTerminalWorkflowBuildPreference(
  preference: TerminalWorkflowBuildPreference,
  storage: Pick<Storage, 'setItem'> = window.localStorage
): void {
  storage.setItem(
    terminalWorkflowBuildPreferenceStorageKey,
    JSON.stringify({ mode: preference.mode, version: 2 })
  )
}

function isTerminalWorkflowBuildMode(value: unknown): value is TerminalWorkflowBuildMode {
  return value === 'progressive' || value === 'simultaneous'
}
