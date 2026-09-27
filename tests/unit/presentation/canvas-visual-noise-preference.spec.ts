import {
  defaultReduceCanvasVisualNoise,
  readCanvasVisualNoisePreference,
  writeCanvasVisualNoisePreference
} from '../../../src/presentation/app-shell/app-features/settings/canvasVisualNoisePreference'

describe('canvas visual noise preference', () => {
  it('defaults missing, malformed, and unsupported stored values to full visual detail', () => {
    expect(defaultReduceCanvasVisualNoise).toBe(false)
    expect(readCanvasVisualNoisePreference(createStorage())).toEqual({
      reduceVisualNoise: false
    })
    expect(readCanvasVisualNoisePreference(createStorage('{broken'))).toEqual({
      reduceVisualNoise: false
    })
    expect(
      readCanvasVisualNoisePreference(
        createStorage(JSON.stringify({ reduceVisualNoise: false, version: 2 }))
      )
    ).toEqual({ reduceVisualNoise: false })
    expect(
      readCanvasVisualNoisePreference(
        createStorage(JSON.stringify({ reduceVisualNoise: 'sometimes', version: 1 }))
      )
    ).toEqual({ reduceVisualNoise: false })
  })

  it.each([true, false])(
    'round-trips reduceVisualNoise=%s through the versioned preference',
    (reduceVisualNoise) => {
      const values = new Map<string, string>()
      const storage = {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value)
      }

      writeCanvasVisualNoisePreference({ reduceVisualNoise }, storage)

      expect(readCanvasVisualNoisePreference(storage)).toEqual({ reduceVisualNoise })
    }
  )
})

function createStorage(value?: string): Pick<Storage, 'getItem'> {
  return { getItem: () => value ?? null }
}
