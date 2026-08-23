import type { MainWindowStateStore } from './FileSystemMainWindowStateStore'
import {
  decodeMainWindowState,
  mainWindowStateSchemaVersion,
  type MainWindowBounds,
  type MainWindowDisplayMode,
  type MainWindowStateSnapshot
} from './mainWindowStatePolicy'

export const mainWindowStateSaveDelayMs = 200

interface MainWindowStateTarget {
  getNormalBounds(): MainWindowBounds
  isFullScreen(): boolean
  isMaximized(): boolean
  isMinimized(): boolean
  on(event: string, listener: () => void): unknown
  removeListener(event: string, listener: () => void): unknown
}

export interface MainWindowStateBinding {
  dispose(): void
  flush(): void
}

export function bindMainWindowStatePersistence(input: {
  readonly initialState: MainWindowStateSnapshot
  readonly persistDisplayMode: boolean
  readonly store: MainWindowStateStore
  readonly target: MainWindowStateTarget
}): MainWindowStateBinding {
  let disposed = false
  let pendingSave: ReturnType<typeof setTimeout> | null = null
  let lastSnapshot = input.initialState
  let lastNonMinimizedMode = input.initialState.displayMode

  const captureSnapshot = (): MainWindowStateSnapshot => {
    const displayMode = resolveDisplayMode(
      input.target,
      input.persistDisplayMode,
      lastNonMinimizedMode
    )
    if (!input.target.isMinimized()) lastNonMinimizedMode = displayMode
    return (
      decodeMainWindowState({
        version: mainWindowStateSchemaVersion,
        displayMode,
        normalBounds: input.target.getNormalBounds()
      }) ?? { ...lastSnapshot, displayMode }
    )
  }
  const persist = (): void => {
    if (disposed) return
    lastSnapshot = captureSnapshot()
    input.store.save(lastSnapshot)
  }
  const flush = (): void => {
    if (disposed) return
    clearPendingSave()
    persist()
  }
  const scheduleSave = (): void => {
    if (disposed) return
    clearPendingSave()
    pendingSave = setTimeout(() => {
      pendingSave = null
      persist()
    }, mainWindowStateSaveDelayMs)
  }
  const rememberModeAndScheduleSave = (): void => {
    if (!input.target.isMinimized()) {
      lastNonMinimizedMode = resolveDisplayMode(
        input.target,
        input.persistDisplayMode,
        lastNonMinimizedMode
      )
    }
    scheduleSave()
  }
  const dispose = (): void => {
    if (disposed) return
    disposed = true
    clearPendingSave()
    for (const [event, listener] of listeners) {
      input.target.removeListener(event, listener)
    }
  }
  const clearPendingSave = (): void => {
    if (pendingSave === null) return
    clearTimeout(pendingSave)
    pendingSave = null
  }
  const listeners: ReadonlyArray<readonly [string, () => void]> = [
    ['move', scheduleSave],
    ['resize', scheduleSave],
    ['maximize', rememberModeAndScheduleSave],
    ['unmaximize', rememberModeAndScheduleSave],
    ['enter-full-screen', rememberModeAndScheduleSave],
    ['leave-full-screen', rememberModeAndScheduleSave],
    ['minimize', scheduleSave],
    ['restore', rememberModeAndScheduleSave],
    ['close', flush],
    ['closed', dispose]
  ]

  for (const [event, listener] of listeners) input.target.on(event, listener)

  return { dispose, flush }
}

function resolveDisplayMode(
  target: Pick<MainWindowStateTarget, 'isFullScreen' | 'isMaximized' | 'isMinimized'>,
  persistDisplayMode: boolean,
  lastNonMinimizedMode: MainWindowDisplayMode
): MainWindowDisplayMode {
  if (!persistDisplayMode) return 'normal'
  if (target.isMinimized()) return lastNonMinimizedMode
  if (target.isFullScreen()) return 'fullscreen'
  if (target.isMaximized()) return 'maximized'
  return 'normal'
}
