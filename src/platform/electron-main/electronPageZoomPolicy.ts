interface PageZoomWebContents {
  once(event: 'did-finish-load', listener: () => void): unknown
  setZoomLevel(level: number): void
}

const electronPageZoomLevel = 0

export function bindElectronPageZoomStartup(webContents: PageZoomWebContents): void {
  const restorePageZoom = (): void => {
    webContents.setZoomLevel(electronPageZoomLevel)
  }

  restorePageZoom()
  webContents.once('did-finish-load', restorePageZoom)
}
