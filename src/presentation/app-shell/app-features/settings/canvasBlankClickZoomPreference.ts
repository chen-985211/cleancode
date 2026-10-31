export const defaultZoomOnBlankClick = true
const storageKey = 'cleancode.canvas-blank-click-zoom-preference'

export function readCanvasBlankClickZoomPreference(
  storage: Pick<Storage, 'getItem'> = window.localStorage
): boolean {
  try {
    const stored = storage.getItem(storageKey)
    const value = stored === null ? null : JSON.parse(stored)
    return value?.version === 1 && typeof value.zoomOnBlankClick === 'boolean'
      ? value.zoomOnBlankClick
      : defaultZoomOnBlankClick
  } catch {
    return defaultZoomOnBlankClick
  }
}

export function writeCanvasBlankClickZoomPreference(
  zoomOnBlankClick: boolean,
  storage: Pick<Storage, 'setItem'> = window.localStorage
): void {
  storage.setItem(storageKey, JSON.stringify({ zoomOnBlankClick, version: 1 }))
}
