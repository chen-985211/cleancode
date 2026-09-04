import process from 'node:process'

import { app, BrowserWindow } from 'electron'

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('use-gl', 'angle')
  app.commandLine.appendSwitch('use-angle', 'swiftshader-webgl')
  app.commandLine.appendSwitch('enable-unsafe-swiftshader')
}

app.whenReady().then(async () => {
  app.dock?.hide()
  const window = new BrowserWindow({
    show: false,
    width: 1400,
    height: 900,
    webPreferences: { backgroundThrottling: false }
  })
  await window.loadURL('about:blank')
})

app.on('window-all-closed', () => app.quit())
