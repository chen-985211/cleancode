import {
  defaultTerminalWorkflowBuildMode,
  readTerminalWorkflowBuildPreference,
  writeTerminalWorkflowBuildPreference
} from '../../../src/presentation/app-shell/app-features/settings/terminalWorkflowBuildPreference'

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

  it('migrates the previous parallel preference to simultaneous construction', () => {
    expect(
      readTerminalWorkflowBuildPreference(
        createStorage(JSON.stringify({ mode: 'parallel', version: 1 }))
      )
    ).toEqual({ mode: 'simultaneous' })
  })

  it('round-trips progressive and simultaneous modes through the versioned preference', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    }

    writeTerminalWorkflowBuildPreference({ mode: 'simultaneous' }, storage)
    expect(readTerminalWorkflowBuildPreference(storage)).toEqual({ mode: 'simultaneous' })
    expect([...values.values()]).toEqual([JSON.stringify({ mode: 'simultaneous', version: 2 })])
  })
})

function createStorage(value?: string): Pick<Storage, 'getItem'> {
  return { getItem: () => value ?? null }
}
