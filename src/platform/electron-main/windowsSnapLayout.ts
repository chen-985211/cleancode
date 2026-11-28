import { createRequire } from 'node:module'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { release } from 'node:os'
import { join } from 'node:path'
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

export function resolveWindowsSnapModulePath(
  bundledPath: string,
  developmentCache?: string
): string {
  if (!developmentCache) return bundledPath
  // Windows locks a loaded DLL until process exit. Keep the build output replaceable.
  const bytes = readFileSync(bundledPath)
  const digest = createHash('sha256').update(bytes).digest('hex')
  const cachedPath = join(developmentCache, digest + '.node')
  if (existsSync(cachedPath)) return cachedPath

  mkdirSync(developmentCache, { recursive: true })
  const temporaryPath = join(developmentCache, randomUUID() + '.tmp')
  try {
    writeFileSync(temporaryPath, bytes, { flag: 'wx' })
    try {
      renameSync(temporaryPath, cachedPath)
    } catch (error) {
      // A concurrent launch may already have published and loaded the same bytes.
      if (!existsSync(cachedPath)) throw error
    }
  } finally {
    rmSync(temporaryPath, { force: true })
  }
  return cachedPath
}

export function bindWindowsSnapLayout(window: BrowserWindow, developmentCache?: string): void {
  if (!supportsSnapLayouts(process.platform, release())) return
  try {
    if (!native) {
      const require = createRequire(import.meta.url)
      const bundledPath = join(import.meta.dirname, 'windows-snap-layout.node')
      native = require(
        resolveWindowsSnapModulePath(bundledPath, developmentCache)
      ) as NativeSnapLayout
    }
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
