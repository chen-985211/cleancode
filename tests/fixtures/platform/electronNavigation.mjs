import { writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import process from 'node:process'
import { clearTimeout, setTimeout } from 'node:timers'
import { pathToFileURL } from 'node:url'

import { app, BrowserWindow } from 'electron'

const [policyPath, directory] = process.argv.slice(2)
const { bindElectronExternalNavigationPolicy } = await import(pathToFileURL(policyPath).href)
app.setPath('userData', join(directory, 'profile'))
app.setPath('sessionData', join(directory, 'session'))
app.on('window-all-closed', () => {})

const html = '<!doctype html><title>Renderer navigation fixture</title><p>Loaded</p>'
const server = createServer((_request, response) => {
  response.setHeader('Content-Type', 'text/html')
  response.end(html)
})

async function observeNavigation(window, trigger, subscribeExternal) {
  let finish
  let deadline
  const outcome = new Promise((resolve, reject) => {
    finish = resolve
    deadline = setTimeout(() => reject(new Error('No renderer navigation outcome')), 5_000)
  })
  const loaded = () => finish('loaded-in-electron')
  const navigating = (event) => {
    if (event.defaultPrevented) finish('blocked')
  }
  window.webContents.once('did-finish-load', loaded)
  window.webContents.on('will-navigate', navigating)
  const unsubscribe = subscribeExternal(() => finish('opened-externally'))
  try {
    trigger()
    return await outcome
  } finally {
    clearTimeout(deadline)
    window.webContents.removeListener('did-finish-load', loaded)
    window.webContents.removeListener('will-navigate', navigating)
    unsubscribe()
  }
}

async function run() {
  try {
    await app.whenReady()
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const filePath = join(directory, 'index.html')
    await writeFile(filePath, html)
    const cases = [
      ['development', `http://127.0.0.1:${server.address().port}/`],
      ['packaged', pathToFileURL(filePath).href]
    ]
    const report = []
    for (const [mode, rendererUrl] of cases) {
      const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
      let onExternal
      bindElectronExternalNavigationPolicy({
        rendererUrl,
        webContents: window.webContents,
        openExternal: async () => onExternal?.(),
        onOpenError: (error) => {
          throw error
        }
      })
      const subscribeExternal = (listener) => {
        onExternal = listener
        return () => {
          onExternal = undefined
        }
      }
      try {
        await window.loadURL(rendererUrl)
        const reload = await observeNavigation(
          window,
          () => {
            // Vite full-reload and reconnect both use this renderer-initiated reload.
            void window.webContents.executeJavaScript('location.reload()')
          },
          subscribeExternal
        )
        const external = await observeNavigation(
          window,
          () => {
            void window.webContents.executeJavaScript('location.href = "https://example.com/docs"')
          },
          subscribeExternal
        )
        report.push({ mode, reload, external })
      } finally {
        window.destroy()
      }
    }
    process.stdout.write(`${JSON.stringify(report)}\n`)
  } catch (error) {
    process.stderr.write(`${error.stack}\n`)
    process.exitCode = 1
  } finally {
    await new Promise((resolve) => server.close(resolve))
    app.quit()
  }
}

void run()
