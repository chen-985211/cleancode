import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import type {} from '../fixtures/terminalIndexedGlyphs'

export function useTerminalPresentationWindow() {
  let application: ElectronApplication | undefined
  let server: ViteDevServer | undefined
  let profile: string | undefined
  let page: Page

  beforeAll(async () => {
    profile = await mkdtemp(join(tmpdir(), 'cleancode-surface-'))
    server = await createServer({
      configFile: false,
      cacheDir: join(profile, 'vite-cache'),
      server: { host: '127.0.0.1', port: 0, watch: null, hmr: false }
    })
    await server.listen()
    application = await electron.launch({
      args: [
        '--force-color-profile=srgb',
        join(process.cwd(), 'tests/fixtures/terminalRasterBrowser.mjs'),
        `--user-data-dir=${profile}`
      ]
    })
    page = await application.firstWindow()
    // Preserve the real WebGL bitmap solely for the first-visible-frame pixel oracle.
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value(this: HTMLCanvasElement, kind: string, options?: Record<string, unknown>) {
          if (kind === 'webgl2' && location.search.includes('dom')) return null
          return Reflect.apply(getContext, this, [
            kind,
            kind === 'webgl2' ? { ...options, preserveDrawingBuffer: true } : options
          ])
        }
      })
    })
  }, 30_000)

  afterAll(async () => {
    try {
      await application?.close()
    } finally {
      await server?.close()
      if (profile) await rm(profile, { recursive: true, force: true })
    }
  })

  async function mountIndexedGlyphs(renderer: string, source: string, host = 'agent') {
    const params = new URLSearchParams({ renderer, source, host })
    await page.goto(
      `${server!.resolvedUrls!.local[0]}tests/fixtures/terminalIndexedGlyphs.html?${params}`
    )
    await page.waitForFunction(() => Boolean(window.terminalIndexedFixture))
  }

  return {
    get page() {
      return page
    },
    mountIndexedGlyphs,
    get presentationUrl() {
      return server!.resolvedUrls!.local[0] + 'tests/fixtures/terminalSurfacePresentation.html'
    }
  }
}
