import {
  defaultFollowQuickExecutionTarget,
  readCanvasQuickExecutionFollowPreference,
  writeCanvasQuickExecutionFollowPreference
} from '../../../src/presentation/app-shell/app-features/settings/canvasQuickExecutionFollowPreference'

describe('canvas quick execution follow preference', () => {
  it('defaults missing, malformed, and unsupported stored values to following the target', () => {
    expect(readCanvasQuickExecutionFollowPreference(createStorage())).toEqual({
      followQuickExecutionTarget: defaultFollowQuickExecutionTarget
    })
    expect(readCanvasQuickExecutionFollowPreference(createStorage('{broken'))).toEqual({
      followQuickExecutionTarget: true
    })
    expect(
      readCanvasQuickExecutionFollowPreference(
        createStorage(JSON.stringify({ followQuickExecutionTarget: false, version: 2 }))
      )
    ).toEqual({ followQuickExecutionTarget: true })
    expect(
      readCanvasQuickExecutionFollowPreference(
        createStorage(JSON.stringify({ followQuickExecutionTarget: 'sometimes', version: 1 }))
      )
    ).toEqual({ followQuickExecutionTarget: true })
  })

  it.each([true, false])(
    'round-trips followQuickExecutionTarget=%s through the versioned preference',
    (followQuickExecutionTarget) => {
      const values = new Map<string, string>()
      const storage = {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value)
      }

      writeCanvasQuickExecutionFollowPreference({ followQuickExecutionTarget }, storage)

      expect(readCanvasQuickExecutionFollowPreference(storage)).toEqual({
        followQuickExecutionTarget
      })
    }
  )
})

function createStorage(value?: string): Pick<Storage, 'getItem'> {
  return { getItem: () => value ?? null }
}
