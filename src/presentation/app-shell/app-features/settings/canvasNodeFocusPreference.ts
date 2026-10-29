export type CanvasNodeFocusMode = 'center' | 'preserve-view'

export const defaultCanvasNodeFocusMode: CanvasNodeFocusMode = 'center'
const storageKey = 'cleancode.canvas-node-focus-preference'

export function readCanvasNodeFocusPreference(
  storage: Pick<Storage, 'getItem'> = window.localStorage
): CanvasNodeFocusMode {
  try {
    const stored = storage.getItem(storageKey)
    const value = stored === null ? null : JSON.parse(stored)
    return value?.version === 1 && (value.mode === 'center' || value.mode === 'preserve-view')
      ? value.mode
      : defaultCanvasNodeFocusMode
  } catch {
    return defaultCanvasNodeFocusMode
  }
}

export function writeCanvasNodeFocusPreference(
  mode: CanvasNodeFocusMode,
  storage: Pick<Storage, 'setItem'> = window.localStorage
): void {
  storage.setItem(storageKey, JSON.stringify({ mode, version: 1 }))
}
