import {
  defaultTerminalScrollbackRows,
  readTerminalRuntimePreference,
  terminalScrollbackOptions,
  writeTerminalRuntimePreference
} from '../../../../src/contexts/run/presentation/view-models/terminalRuntimePreference'

describe('terminal runtime preference', () => {
  it('uses the default for missing, malformed and unsupported stored values', () => {
    expect(readTerminalRuntimePreference(createStorage())).toEqual({
      scrollbackRows: defaultTerminalScrollbackRows
    })
    expect(readTerminalRuntimePreference(createStorage('{broken'))).toEqual({
      scrollbackRows: defaultTerminalScrollbackRows
    })
    expect(
      readTerminalRuntimePreference(
        createStorage(JSON.stringify({ version: 1, scrollbackRows: 42 }))
      )
    ).toEqual({ scrollbackRows: defaultTerminalScrollbackRows })
  })

  it('round-trips only one of the bounded scrollback presets', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    }

    expect(terminalScrollbackOptions).toEqual([1000, 5000, 10000])
    writeTerminalRuntimePreference({ scrollbackRows: 5000 }, storage)

    expect(readTerminalRuntimePreference(storage)).toEqual({ scrollbackRows: 5000 })
  })
})

function createStorage(value?: string): Pick<Storage, 'getItem'> {
  return { getItem: () => value ?? null }
}
