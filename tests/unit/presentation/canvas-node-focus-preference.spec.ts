import {
  readCanvasNodeFocusPreference,
  writeCanvasNodeFocusPreference
} from '../../../src/presentation/app-shell/app-features/settings/canvasNodeFocusPreference'
import { act, renderHook } from '@testing-library/react'
import { useCanvasNodeFocusPreference } from '../../../src/presentation/app-shell/app-features/settings/useCanvasNodeFocusPreference'

describe('canvas node focus preference', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('updates immediately and restores the selected mode after remount', () => {
    const first = renderHook(useCanvasNodeFocusPreference)
    expect(first.result.current.nodeFocusMode).toBe('center')
    act(() => first.result.current.changeNodeFocusMode('preserve-view'))
    expect(first.result.current.nodeFocusMode).toBe('preserve-view')
    first.unmount()
    const restored = renderHook(useCanvasNodeFocusPreference)
    expect(restored.result.current.nodeFocusMode).toBe('preserve-view')
  })

  it('still changes the session preference when saving is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('unavailable')
    })
    const hook = renderHook(useCanvasNodeFocusPreference)
    act(() => hook.result.current.changeNodeFocusMode('preserve-view'))
    expect(hook.result.current.nodeFocusMode).toBe('preserve-view')
  })
  it.each([
    null,
    '{broken',
    'null',
    '[]',
    '{"version":2,"mode":"preserve-view"}',
    '{"version":1,"mode":"unknown"}'
  ])('defaults missing or invalid data to center: %s', (stored) => {
    expect(readCanvasNodeFocusPreference({ getItem: () => stored })).toBe('center')
  })

  it.each(['center', 'preserve-view'] as const)('restores saved %s on a fresh read', (mode) => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value)
      }
    }
    writeCanvasNodeFocusPreference(mode, storage)
    expect(values.size).toBe(1)
    expect(readCanvasNodeFocusPreference(storage)).toBe(mode)
  })

  it('keeps settings usable when storage is unavailable', () => {
    expect(
      readCanvasNodeFocusPreference({
        getItem: () => {
          throw new Error('unavailable')
        }
      })
    ).toBe('center')
  })
})
