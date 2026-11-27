import { createRequire } from 'node:module'
import { release } from 'node:os'
import type { BrowserWindow } from 'electron'
import {
  desktopWindowChannels,
  supportsSnapLayouts,
  type SnapButtonBounds
} from '../ipc/desktopWindowControls'
import { consoleLogger } from '../logging/ConsoleLogSink'

interface NativeSnapLayout {
  readonly pointerMessage: number
  setBounds(handle: Buffer, x: number, y: number, width: number, height: number): void
}

let native: NativeSnapLayout | undefined

export function bindWindowsSnapLayout(window: BrowserWindow): void {
  if (!supportsSnapLayouts(process.platform, release())) return
  try {
    native ??= createRequire(import.meta.url)('./windows-snap-layout.node') as NativeSnapLayout
    window.hookWindowMessage(native.pointerMessage, (state) => {
      if (!window.webContents.isDestroyed()) {
        const pointer = state[0] === 2 ? 'pressed' : state[0] === 1 ? 'hover' : 'idle'
        window.webContents.send(desktopWindowChannels.snapPointerChanged, pointer)
      }
    })
    const clear = () => setWindowsSnapButtonBounds(window, null)
    window.on('enter-full-screen', clear)
    window.webContents.on('did-navigate', clear)
  } catch (error) {
    consoleLogger.warn({
      scope: 'platform.window',
      operation: 'bindWindowsSnapLayout',
      outcome: 'failure',
      error: { message: error instanceof Error ? error.message : String(error) }
    })
  }
}

export function setWindowsSnapButtonBounds(
  window: Pick<BrowserWindow, 'getNativeWindowHandle' | 'isFullScreen'>,
  bounds: SnapButtonBounds | null
): void {
  if (!native) return
  const handle = window.getNativeWindowHandle()
  if (bounds === null || window.isFullScreen()) {
    native.setBounds(handle, 0, 0, 0, 0)
    return
  }
  const { x, y, width, height } = bounds
  if (
    ![x, y, width, height].every((v) => Number.isInteger(v) && v >= 0) ||
    width === 0 ||
    height === 0 ||
    x + width > 0x7fffffff ||
    y + height > 0x7fffffff
  ) {
    throw new Error('Invalid window snap button bounds.')
  }
  native.setBounds(handle, x, y, width, height)
}
