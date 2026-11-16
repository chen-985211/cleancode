import { app, BrowserWindow, screen } from 'electron'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'

const require = createRequire(import.meta.url)
globalThis.runUpdateProbe = async (input) => {
  const configPath = join(input.directory, 'app-update.yml')
  await writeFile(
    configPath,
    `provider: generic\nurl: ${input.url}\nupdaterCacheDirName: fixture-updater\n`
  )
  const { NsisUpdater } = require('electron-updater')
  const { ElectronHttpExecutor } = require('electron-updater/out/electronHttpExecutor')
  const updater = new NsisUpdater(null, {
    version: '0.1.0',
    name: 'CleanCodeUpdateTest',
    isPackaged: true,
    appUpdateConfigPath: configPath,
    userDataPath: join(input.directory, 'state'),
    baseCachePath: join(input.directory, 'cache'),
    whenReady: () => app.whenReady(),
    relaunch: () => undefined,
    quit: () => undefined,
    onQuit: () => undefined
  })
  Object.assign(updater, { httpExecutor: new ElectronHttpExecutor() })
  updater.setFeedURL({ provider: 'generic', url: input.url })
  updater.logger = null
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = false
  updater.disableDifferentialDownload = true
  updater.disableWebInstaller = true
  let ready = false
  updater.on('update-downloaded', () => {
    ready = true
  })
  await updater.checkForUpdates()
  try {
    const files = await updater.downloadUpdate()
    return { ready, size: (await readFile(files[0])).length, error: null }
  } catch (error) {
    return { ready, size: 0, error: error.code, message: error.message }
  }
}

app.whenReady().then(async () => {
  const rightEdge = Math.max(
    ...screen.getAllDisplays().map(({ bounds }) => bounds.x + bounds.width)
  )
  const window = new BrowserWindow({
    frame: false,
    width: 1000,
    height: 760,
    show: false,
    enableLargerThanScreen: true,
    webPreferences: { backgroundThrottling: false }
  })
  await window.loadURL('about:blank')
  window.setPosition(rightEdge + 100, 100)
  window.showInactive()
  window.setPosition(rightEdge + 100, 100)
})
app.on('window-all-closed', () => app.quit())
