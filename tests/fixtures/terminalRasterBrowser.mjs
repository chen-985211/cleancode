import process from 'node:process'

import { app, BrowserWindow, screen } from 'electron'

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('use-gl', 'angle')
  app.commandLine.appendSwitch('use-angle', 'swiftshader-webgl')
  app.commandLine.appendSwitch('enable-unsafe-swiftshader')
}

app.whenReady().then(async () => {
  app.dock?.hide()
  const window = new BrowserWindow({
    show: false,
    frame: false,
    width: 1400,
    height: 900,
    enableLargerThanScreen: true,
    webPreferences: { backgroundThrottling: false }
  })
  await window.loadURL('about:blank')
  if (process.env.CLEANCODE_RASTER_WINDOW_MODE !== 'hidden') {
    const rightEdge = Math.max(
      ...screen.getAllDisplays().map(({ bounds }) => bounds.x + bounds.width)
    )
    window.setPosition(rightEdge + 100, 100)
    window.showInactive()
  }
})

app.on('window-all-closed', () => app.quit())
