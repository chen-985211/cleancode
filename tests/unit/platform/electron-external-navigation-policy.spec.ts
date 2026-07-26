import { bindElectronExternalNavigationPolicy } from '../../../src/platform/electron-main/electronExternalNavigationPolicy'

describe('Electron external navigation policy', () => {
  it.each([
    ['window open', 'https://example.com/docs?source=cleancode'],
    ['top-level navigation', 'http://localhost:4173/status']
  ])(
    'opens an allowed %s target externally and keeps it out of the app window',
    async (kind, url) => {
      const webContents = new FakeExternalNavigationWebContents()
      const openExternal = vi.fn(async () => undefined)
      bindElectronExternalNavigationPolicy({
        onOpenError: vi.fn(),
        openExternal,
        webContents
      })

      if (kind === 'window open') {
        expect(webContents.openWindow(url)).toEqual({ action: 'deny' })
      } else {
        const event = webContents.navigate(url)
        expect(event.preventDefault).toHaveBeenCalledTimes(1)
      }

      expect(openExternal).toHaveBeenCalledWith(url)
    }
  )

  it.each(['about:blank', 'file:///tmp/report.html', 'javascript:alert(1)', 'data:text/plain,no'])(
    'denies the %s protocol without invoking an external application',
    (url) => {
      const webContents = new FakeExternalNavigationWebContents()
      const openExternal = vi.fn(async () => undefined)
      bindElectronExternalNavigationPolicy({
        onOpenError: vi.fn(),
        openExternal,
        webContents
      })

      expect(webContents.openWindow(url)).toEqual({ action: 'deny' })
      expect(openExternal).not.toHaveBeenCalled()
    }
  )

  it('reports an external-open failure without allowing an Electron child window', async () => {
    const failure = new Error('default browser unavailable')
    const webContents = new FakeExternalNavigationWebContents()
    const onOpenError = vi.fn()
    bindElectronExternalNavigationPolicy({
      onOpenError,
      openExternal: vi.fn(async () => {
        throw failure
      }),
      webContents
    })

    expect(webContents.openWindow('https://example.com/')).toEqual({ action: 'deny' })
    await vi.waitFor(() => expect(onOpenError).toHaveBeenCalledWith(failure))
  })
})

interface NavigationEvent {
  readonly preventDefault: ReturnType<typeof vi.fn<() => void>>
}

class FakeExternalNavigationWebContents {
  private openWindowHandler:
    ((details: { readonly url: string }) => { readonly action: 'deny' }) | null = null
  private willNavigateListener: ((event: NavigationEvent, url: string) => void) | null = null

  navigate(url: string): NavigationEvent {
    const event = { preventDefault: vi.fn<() => void>() }
    this.willNavigateListener?.(event, url)
    return event
  }

  on(event: 'will-navigate', listener: (event: NavigationEvent, url: string) => void): this {
    expect(event).toBe('will-navigate')
    this.willNavigateListener = listener
    return this
  }

  openWindow(url: string): { readonly action: 'deny' } | undefined {
    return this.openWindowHandler?.({ url })
  }

  setWindowOpenHandler(
    handler: (details: { readonly url: string }) => { readonly action: 'deny' }
  ): void {
    this.openWindowHandler = handler
  }
}
