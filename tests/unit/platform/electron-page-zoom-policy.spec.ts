import { bindElectronPageZoomStartup } from '../../../src/platform/electron-main/electronPageZoomPolicy'

describe('Electron page zoom policy', () => {
  it('starts at 100% without overriding later user zoom changes', () => {
    const webContents = new FakePageZoomWebContents(9)

    bindElectronPageZoomStartup(webContents)

    expect(webContents.zoomLevel).toBe(0)
    expect(webContents.setZoomLevel).toHaveBeenLastCalledWith(0)
    expect(webContents.setZoomLevel).toHaveBeenCalledTimes(1)

    webContents.emitDidFinishLoad()
    expect(webContents.zoomLevel).toBe(0)
    expect(webContents.setZoomLevel).toHaveBeenCalledTimes(1)

    webContents.zoomLevel = 2
    webContents.emitDidFinishLoad()
    expect(webContents.zoomLevel).toBe(2)
  })
})

class FakePageZoomWebContents {
  readonly setZoomLevel = vi.fn((level: number) => {
    this.zoomLevel = level
  })
  private didFinishLoadListener: (() => void) | null = null

  constructor(public zoomLevel: number) {}

  getZoomLevel(): number {
    return this.zoomLevel
  }

  emitDidFinishLoad(): void {
    const listener = this.didFinishLoadListener
    this.didFinishLoadListener = null
    listener?.()
  }

  once(_event: 'did-finish-load', listener: () => void): this {
    this.didFinishLoadListener = listener
    return this
  }
}
