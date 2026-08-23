import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { FileSystemMainWindowStateStore } from '../../../src/platform/electron-main/FileSystemMainWindowStateStore'
import type { MainWindowStateSnapshot } from '../../../src/platform/electron-main/mainWindowStatePolicy'
import type { Logger } from '../../../src/platform/logging/Logger'

describe('platform main window state store', () => {
  let directory: string
  let logger: Logger

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cleancode-window-state-'))
    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn()
    }
  })

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true })
  })

  it('returns no state without logging when the file does not exist', () => {
    const store = createStore(directory, logger)

    expect(store.load()).toBeNull()
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('atomically replaces and reads a versioned state snapshot', async () => {
    const store = createStore(directory, logger)
    const first = snapshot({ x: 120, y: 80, width: 1_200, height: 800 }, 'normal')
    const second = snapshot({ x: -1_400, y: 40, width: 1_360, height: 860 }, 'maximized')

    store.save(first)
    store.save(second)

    expect(store.load()).toEqual(second)
    expect(JSON.parse(await readFile(join(directory, 'window-state-v1.json'), 'utf8'))).toEqual(
      second
    )
    expect(await readdir(directory)).toEqual(['window-state-v1.json'])
    expect(logger.error).not.toHaveBeenCalled()
  })

  it.each([
    ['malformed JSON', '{incomplete'],
    [
      'unsupported schema',
      JSON.stringify({
        version: 2,
        displayMode: 'normal',
        normalBounds: { x: 120, y: 80, width: 1_200, height: 800 }
      })
    ]
  ])('fails open and logs %s', async (_name, contents) => {
    const path = join(directory, 'window-state-v1.json')
    await writeFile(path, contents, 'utf8')
    const store = new FileSystemMainWindowStateStore({ filePath: path, logger })

    expect(store.load()).toBeNull()
    expect(logger.error).toHaveBeenCalledWith({
      scope: 'platform.window',
      operation: 'loadWindowState',
      outcome: 'failure',
      error: { message: 'The saved window state could not be loaded.' }
    })
  })

  it('fails open and logs when the state path cannot be written', async () => {
    const blockedDirectory = join(directory, 'blocked')
    await writeFile(blockedDirectory, 'not-a-directory', 'utf8')
    const store = new FileSystemMainWindowStateStore({
      filePath: join(blockedDirectory, 'window-state-v1.json'),
      logger
    })

    expect(() =>
      store.save(snapshot({ x: 120, y: 80, width: 1_200, height: 800 }, 'fullscreen'))
    ).not.toThrow()
    expect(logger.error).toHaveBeenCalledWith({
      scope: 'platform.window',
      operation: 'saveWindowState',
      outcome: 'failure',
      error: { message: 'The window state could not be saved.' }
    })
  })
})

function createStore(directory: string, logger: Logger): FileSystemMainWindowStateStore {
  return new FileSystemMainWindowStateStore({
    filePath: join(directory, 'window-state-v1.json'),
    logger
  })
}

function snapshot(
  normalBounds: MainWindowStateSnapshot['normalBounds'],
  displayMode: MainWindowStateSnapshot['displayMode']
): MainWindowStateSnapshot {
  return { version: 1, displayMode, normalBounds }
}
