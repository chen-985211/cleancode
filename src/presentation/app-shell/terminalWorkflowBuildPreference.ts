const terminalWorkflowBuildPreferenceStorageKey = 'cleancode.terminal-workflow-build-preference'

export type TerminalWorkflowBuildMode = 'parallel' | 'progressive'

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

    return value.version === 1 && isTerminalWorkflowBuildMode(value.mode)
      ? { mode: value.mode }
      : { mode: defaultTerminalWorkflowBuildMode }
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
    JSON.stringify({ mode: preference.mode, version: 1 })
  )
}

function isTerminalWorkflowBuildMode(value: unknown): value is TerminalWorkflowBuildMode {
  return value === 'parallel' || value === 'progressive'
}
