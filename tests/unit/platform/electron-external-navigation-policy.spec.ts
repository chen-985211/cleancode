import { bindElectronExternalNavigationPolicy } from '../../../src/platform/electron-main/electronExternalNavigationPolicy'

describe('Electron external navigation policy', () => {
  const rendererUrl = 'http://localhost:5173/'
  const navigationCases = [
    [rendererUrl, rendererUrl, 'internal'],
    [rendererUrl, 'http://LOCALHOST:5173', 'internal'],
    [rendererUrl, `${rendererUrl}#canvas`, 'internal'],
    [
      'https://localhost:5173/index.html?mode=dev#old',
      'https://localhost:5173/index.html?mode=dev#new',
      'internal'
    ],
    [
      'file:///Applications/CleanCode%20Dev/renderer/index.html',
      'file:///Applications/CleanCode%20Dev/renderer/index.html#canvas',
      'internal'
    ],
    [
      'file:///C:/CleanCode/renderer/index.html',
      'file:///C:/CleanCode/renderer/index.html',
      'internal'
    ],
    [rendererUrl, 'http://localhost:5174/', 'external'],
    [rendererUrl, 'http://127.0.0.1:5173/', 'external'],
    [rendererUrl, 'https://localhost:5173/', 'external'],
    [rendererUrl, 'http://localhost:5173/report.html', 'external'],
    [rendererUrl, 'http://localhost:5173/?other=true', 'external'],
    [rendererUrl, 'http://localhost:5173.evil.example/', 'blocked'],
    [rendererUrl, 'http://localhost.evil.example:5173/', 'external'],
    [rendererUrl, 'http://user@localhost:5173/', 'external'],
    [rendererUrl, 'https://example.com/docs', 'external'],
    [
      'file:///Applications/CleanCode/renderer/index.html',
      'file:///Applications/CleanCode/renderer/report.html',
      'blocked'
    ],
    [rendererUrl, 'file:///tmp/report.html', 'blocked'],
    [rendererUrl, 'javascript:alert(1)', 'blocked'],
    [rendererUrl, 'data:text/plain,no', 'blocked'],
    [rendererUrl, 'about:blank', 'blocked'],
    [rendererUrl, 'not a URL', 'blocked'],
    ['not a URL', rendererUrl, 'external'],
    ['about:blank', 'about:blank', 'blocked']
  ] as const

  it.each(navigationCases)(
    'classifies navigation from renderer %s to %s as %s',
    (rendererUrl, target, outcome) => {
      const webContents = new FakeExternalNavigationWebContents()
      const openExternal = vi.fn(async () => undefined)
      bindElectronExternalNavigationPolicy({
        rendererUrl,
        webContents,
        openExternal,
        onOpenError: vi.fn()
      })

      const event = webContents.navigate(target)

      expect(event.preventDefault).toHaveBeenCalledTimes(outcome === 'internal' ? 0 : 1)
      expect(openExternal.mock.calls).toEqual(
        outcome === 'external' ? [[new URL(target).href]] : []
      )
    }
  )

  it.each(navigationCases)(
    'keeps popup target %s → %s (%s) out of Electron child windows',
    (rendererUrl, target, outcome) => {
      const webContents = new FakeExternalNavigationWebContents()
      const openExternal = vi.fn(async () => undefined)
      bindElectronExternalNavigationPolicy({
        rendererUrl,
        webContents,
        openExternal,
        onOpenError: vi.fn()
      })

      expect(webContents.openWindow(target)).toEqual({ action: 'deny' })
      expect(openExternal.mock.calls).toEqual(
        outcome === 'external' ? [[new URL(target).href]] : []
      )
    }
  )

  it.each([
    ['window open', 'https://example.com/docs?source=cleancode'],
    ['top-level navigation', 'http://localhost:4173/status']
  ])(
    'opens an allowed %s target externally and keeps it out of the app window',
    async (kind, url) => {
      const webContents = new FakeExternalNavigationWebContents()
      const openExternal = vi.fn(async () => undefined)
      bindElectronExternalNavigationPolicy({
        rendererUrl,
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
        rendererUrl,
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
      rendererUrl,
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
