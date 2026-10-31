import { act, renderHook } from '@testing-library/react'

import {
  readCanvasBlankClickZoomPreference,
  writeCanvasBlankClickZoomPreference
} from '../../../src/presentation/app-shell/app-features/settings/canvasBlankClickZoomPreference'
import { useCanvasBlankClickZoomPreference } from '../../../src/presentation/app-shell/app-features/settings/useCanvasBlankClickZoomPreference'

describe('canvas blank click zoom preference', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it.each([
    null,
    '{broken',
    'null',
    '[]',
    '{"version":2,"zoomOnBlankClick":false}',
    '{"version":1}',
    '{"version":1,"zoomOnBlankClick":"false"}'
  ])('defaults missing or invalid preferences to enabled: %s', (stored) => {
    expect(readCanvasBlankClickZoomPreference({ getItem: () => stored })).toBe(true)
  })

  it.each([true, false])('restores saved zoomOnBlankClick=%s', (enabled) => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value)
      }
    }
    writeCanvasBlankClickZoomPreference(enabled, storage)
    expect(readCanvasBlankClickZoomPreference(storage)).toBe(enabled)
  })

  it('applies changes immediately and restores the preference on remount', () => {
    const first = renderHook(useCanvasBlankClickZoomPreference)
    expect(first.result.current.zoomOnBlankClick).toBe(true)
    act(() => first.result.current.changeZoomOnBlankClick(false))
    expect(first.result.current.zoomOnBlankClick).toBe(false)
    first.unmount()

    const restored = renderHook(useCanvasBlankClickZoomPreference)
    expect(restored.result.current.zoomOnBlankClick).toBe(false)
    act(() => restored.result.current.changeZoomOnBlankClick(true))
    expect(restored.result.current.zoomOnBlankClick).toBe(true)
    expect(readCanvasBlankClickZoomPreference()).toBe(true)
  })

  it('defaults to enabled when storage cannot be read', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('unavailable')
    })
    const hook = renderHook(useCanvasBlankClickZoomPreference)
    expect(hook.result.current.zoomOnBlankClick).toBe(true)
  })

  it('still updates the current session when storage cannot be written', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('unavailable')
    })
    const hook = renderHook(useCanvasBlankClickZoomPreference)
    act(() => hook.result.current.changeZoomOnBlankClick(false))
    expect(hook.result.current.zoomOnBlankClick).toBe(false)
  })
})
