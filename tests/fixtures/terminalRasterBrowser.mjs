import { app, BrowserWindow } from 'electron'

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
