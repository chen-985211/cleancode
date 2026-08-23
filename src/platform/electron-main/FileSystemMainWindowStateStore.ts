import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { dirname } from 'node:path'

import type { Logger } from '../logging/Logger'
import { decodeMainWindowState, type MainWindowStateSnapshot } from './mainWindowStatePolicy'

export interface MainWindowStateStore {
  load(): MainWindowStateSnapshot | null
  save(state: MainWindowStateSnapshot): void
}

export class FileSystemMainWindowStateStore implements MainWindowStateStore {
  private readonly filePath: string
  private readonly logger: Logger

  constructor(input: { readonly filePath: string; readonly logger: Logger }) {
    this.filePath = input.filePath
    this.logger = input.logger
  }

  load(): MainWindowStateSnapshot | null {
    try {
      const state = decodeMainWindowState(JSON.parse(readFileSync(this.filePath, 'utf8')))
      if (!state) throw new Error('Unsupported window state schema.')
      return state
    } catch (error) {
      if (isMissingFileError(error)) return null
      this.logger.error({
        scope: 'platform.window',
        operation: 'loadWindowState',
        outcome: 'failure',
        error: { message: 'The saved window state could not be loaded.' }
      })
      return null
    }
  }

  save(state: MainWindowStateSnapshot): void {
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`
    let handle: number | null = null
    try {
      mkdirSync(dirname(this.filePath), { recursive: true, mode: 0o700 })
      rmSync(temporaryPath, { force: true })
      handle = openSync(temporaryPath, 'w', 0o600)
      writeFileSync(handle, `${JSON.stringify(state)}\n`, 'utf8')
      fsyncSync(handle)
      closeSync(handle)
      handle = null
      renameSync(temporaryPath, this.filePath)
    } catch {
      if (handle !== null) closeFileWithoutThrowing(handle)
      rmFileWithoutThrowing(temporaryPath)
      this.logger.error({
        scope: 'platform.window',
        operation: 'saveWindowState',
        outcome: 'failure',
        error: { message: 'The window state could not be saved.' }
      })
    }
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function closeFileWithoutThrowing(handle: number): void {
  try {
    closeSync(handle)
  } catch {
    // The primary save failure is already recorded by the caller.
  }
}

function rmFileWithoutThrowing(path: string): void {
  try {
    rmSync(path, { force: true })
  } catch {
    // The primary save failure is already recorded by the caller.
  }
}
