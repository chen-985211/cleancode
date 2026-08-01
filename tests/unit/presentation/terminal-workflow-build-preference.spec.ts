import {
  defaultTerminalWorkflowBuildMode,
  readTerminalWorkflowBuildPreference,
  writeTerminalWorkflowBuildPreference
} from '../../../src/presentation/app-shell/terminalWorkflowBuildPreference'

describe('terminal workflow build preference', () => {
  it('defaults malformed and unsupported stored values to progressive construction', () => {
    expect(readTerminalWorkflowBuildPreference(createStorage())).toEqual({
      mode: defaultTerminalWorkflowBuildMode
    })
    expect(readTerminalWorkflowBuildPreference(createStorage('{broken'))).toEqual({
      mode: 'progressive'
    })
    expect(
      readTerminalWorkflowBuildPreference(
        createStorage(JSON.stringify({ mode: 'unknown', version: 1 }))
      )
    ).toEqual({ mode: 'progressive' })
  })

  it('round-trips progressive and parallel modes through the versioned preference', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    }

    writeTerminalWorkflowBuildPreference({ mode: 'parallel' }, storage)
    expect(readTerminalWorkflowBuildPreference(storage)).toEqual({ mode: 'parallel' })
  })
})

function createStorage(value?: string): Pick<Storage, 'getItem'> {
  return { getItem: () => value ?? null }
}
