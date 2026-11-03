import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  _electron as electron,
  type ElectronApplication,
  type Locator,
  type Page
} from 'playwright'
import { createServer, type ViteDevServer } from 'vite'

import type {} from '../../../fixtures/terminalSurfacePresentation'
import { pollUntilState } from '../../../support/e2ePolling'
import {
  expectTerminalGlyphPixelsPreserved,
  expectTerminalRasterMatchesDisplay,
  expectTerminalRasterOriginAligned,
  terminalRasterPixelTolerance
} from '../../../support/terminalRasterAssertions'

let server: ViteDevServer | undefined
let application: ElectronApplication | undefined
let profile: string | undefined

beforeAll(async () => {
  server = await createServer({
    configFile: false,
    server: { host: '127.0.0.1', port: 0, watch: null, hmr: false }
  })
  await server.listen()
})

afterEach(async () => {
  try {
    await application?.close()
  } finally {
    application = undefined
    if (profile) await rm(profile, { recursive: true, force: true })
  }
})

afterAll(async () => server?.close())

it.each([1, 1.25, 1.5, 2])(
  'restores Windows workspace glyph pixels and physical resolution after hidden context loss at DPR %s',
  async (dpr) => {
    profile = await mkdtemp(join(tmpdir(), 'cleancode-windows-rendering-'))
    application = await electron.launch({
      args: [
        join(process.cwd(), 'tests/fixtures/terminalRasterBrowser.mjs'),
        `--user-data-dir=${profile}`,
        // Match Chromium's screenshot tests: isolate device color profiles
        // while comparing raster/compositor precision on each native GPU.
        '--force-color-profile=srgb',
        `--force-device-scale-factor=${dpr}`
      ],
      env: Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] =>
            entry[0] !== 'ELECTRON_RUN_AS_NODE' && entry[1] !== undefined
        )
      )
    })
    const page = await application.firstWindow()
    await page.addInitScript(() => {
      // Exercise the Windows policy on every host; native Windows CI still
      // supplies its actual Consolas, DPR and graphics backend.
      Object.defineProperty(navigator, 'platform', { get: () => 'Win32' })
      const getContext = HTMLCanvasElement.prototype.getContext
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value(this: HTMLCanvasElement, kind: string, options?: Record<string, unknown>) {
          return Reflect.apply(getContext, this, [
            kind,
            kind === 'webgl2' ? { ...options, preserveDrawingBuffer: true } : options
          ])
        }
      })
    })
    await page.goto(
      `${server!.resolvedUrls!.local[0]}tests/fixtures/terminalSurfacePresentation.html`
    )
    await page.waitForFunction(() => Boolean(window.terminalPresentationFixture))
    const first = await page.evaluate(async () => {
      const fixture = window.terminalPresentationFixture
      const lease = fixture.mount()
      await fixture.restore('green')
      return lease
    })

    const output = join(process.cwd(), 'test-results/terminal-windows-rendering')
    await mkdir(output, { recursive: true })
    for (const zoom of [0.77, 1, 1.1, 1.2, 1.4, 1.6]) {
      await page.evaluate((value) => window.terminalPresentationFixture.setZoom(value), zoom)
      await waitForQuality(page, zoom)
      const before = await readGlyphProjection(page)
      expect(before.devicePixelRatio).toBeCloseTo(dpr, 5)
      expect(before.inkPixels).toBeGreaterThan(0)
      expectTerminalRasterMatchesDisplay(before)
      // Capture the final composited canvas at its aligned physical bounds;
      // cropping the fractional, uncorrected screen adds screenshot resampling.
      const screen = page.locator('#terminal .xterm-screen canvas:visible').first()
      const beforeImage = await readSettledScreenshot(
        page,
        screen,
        join(output, `before-${process.platform}-${dpr}-${zoom}.png`)
      )
      for (let cycle = 0; cycle < 3; cycle += 1) {
        const warm = await page.evaluate(() =>
          window.terminalPresentationFixture.mount({ hot: true })
        )
        expect(warm).toMatchObject({ retained: true, reusedElement: true, viewId: first.viewId })
        await waitForQuality(page, zoom)
        expectProjectionPreserved(before, await readGlyphProjection(page))
        const warmImage = await screen.screenshot({
          path: join(output, `warm-${process.platform}-${dpr}-${zoom}-${cycle}.png`)
        })
        expectTerminalGlyphPixelsPreserved(
          await screenshotDifference(page, beforeImage, warmImage),
          `composited DPR ${dpr}, zoom ${zoom}, cycle ${cycle}`
        )
      }

      if (zoom !== 1 && zoom !== 1.6) continue

      await page.evaluate(() => window.terminalPresentationFixture.hide())
      await page.waitForFunction(() => window.terminalPresentationFixture.state().rasterScale === 1)
      expect(
        await page.evaluate(() => {
          const canvas = Array.from(document.querySelectorAll('[inert] canvas')).find((element) =>
            (element as HTMLCanvasElement).getContext('webgl2')
          ) as HTMLCanvasElement | undefined
          const extension = canvas?.getContext('webgl2')?.getExtension('WEBGL_lose_context')
          extension?.loseContext()
          return Boolean(extension)
        })
      ).toBe(true)
      // xterm waits for its context-restoration deadline before falling back.
      await page.waitForFunction(
        () => window.terminalPresentationFixture.state().renderer === 'dom',
        undefined,
        { timeout: 8000 }
      )
      const returned = await page.evaluate(() =>
        window.terminalPresentationFixture.mount({ hot: true })
      )
      expect(returned).toMatchObject({
        constructions: 1,
        retained: true,
        reusedElement: true,
        viewId: first.viewId
      })
      await waitForQuality(page, zoom)
      const after = await readGlyphProjection(page)
      expectProjectionPreserved(before, after)
      const afterImage = await screen.screenshot({
        path: join(output, `returned-${process.platform}-${dpr}-${zoom}.png`)
      })
      expectTerminalGlyphPixelsPreserved(await screenshotDifference(page, beforeImage, afterImage))
    }
    await page.evaluate(() => window.terminalPresentationFixture.dispose())
  },
  30_000
)

async function readSettledScreenshot(page: Page, canvas: Locator, path: string): Promise<Buffer> {
  let capture: Buffer
  // Wait for the native window compositor to agree with the painted palette.
  // A baseline from its first presentation can still have different colors.
  await pollUntilState({
    description: 'native window compositor displays the painted terminal palette',
    observe: async () => {
      capture = await canvas.screenshot({ path })
      return page.evaluate(async (base64) => {
        const image = new Image()
        image.src = `data:image/png;base64,${base64}`
        await image.decode()
        const sample = document.createElement('canvas')
        sample.width = sample.height = 1
        const context = sample.getContext('2d')!
        context.drawImage(
          image,
          Math.floor(image.naturalWidth / 2),
          Math.floor(image.naturalHeight / 2),
          1,
          1,
          0,
          0,
          1,
          1
        )
        return Array.from(context.getImageData(0, 0, 1, 1).data)
      }, capture.toString('base64'))
    },
    accept: (pixel) =>
      pixel.every(
        (channel, index) =>
          Math.abs(channel - [0, 128, 0, 255][index]!) <= terminalRasterPixelTolerance
      ),
    intervalMs: 50,
    timeoutMs: 5000
  })
  return capture!
}

async function waitForQuality(page: Page, scale: number): Promise<void> {
  await page
    .waitForFunction(
      (value) => {
        const state = window.terminalPresentationFixture.state()
        return (
          state.renderer === 'webgl' &&
          Math.abs((state.rasterScale ?? 0) - value) < 0.00001 &&
          state.ready === 'true'
        )
      },
      scale,
      { timeout: 5000 }
    )
    .catch(async (error) => {
      const state = await page.evaluate(() => ({
        ...window.terminalPresentationFixture.state(),
        screenWidth: document.querySelector<HTMLElement>('#terminal .xterm-screen')?.style.width,
        screenBounds: document
          .querySelector('#terminal .xterm-screen')
          ?.getBoundingClientRect()
          .toJSON(),
        platform: navigator.platform
      }))
      throw new Error(`Raster did not settle at ${scale}: ${JSON.stringify(state)}`, {
        cause: error
      })
    })
}

async function readGlyphProjection(page: Page) {
  return page.evaluate(() => {
    const canvas = Array.from(
      document.querySelectorAll<HTMLCanvasElement>('#terminal canvas')
    ).find((element) => element.getContext('webgl2'))!
    const gl = canvas.getContext('webgl2')!
    const width = Math.min(canvas.width, Math.ceil(180 * devicePixelRatio))
    const height = Math.min(canvas.height, Math.ceil(32 * devicePixelRatio))
    const pixels = new Uint8Array(width * height * 4)
    gl.readPixels(0, canvas.height - height, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    let inkPixels = 0
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] !== 0 || pixels[index + 1] !== 128 || pixels[index + 2] !== 0)
        inkPixels += 1
    }
    const rect = canvas.getBoundingClientRect()
    return {
      devicePixelRatio,
      backingWidth: canvas.width,
      backingHeight: canvas.height,
      displayWidth: rect.width,
      displayHeight: rect.height,
      displayLeft: rect.left,
      displayTop: rect.top,
      pixels: Array.from(pixels),
      inkPixels
    }
  })
}

function expectProjectionPreserved(
  before: Awaited<ReturnType<typeof readGlyphProjection>>,
  after: Awaited<ReturnType<typeof readGlyphProjection>>
): void {
  expectTerminalRasterMatchesDisplay(after)
  expectTerminalRasterOriginAligned(after)
  expect(after.inkPixels).toBeGreaterThan(0)
  expect(after.pixels).toHaveLength(before.pixels.length)
  let maximumDifference = 0
  for (let index = 0; index < before.pixels.length; index += 1) {
    maximumDifference = Math.max(
      maximumDifference,
      Math.abs(before.pixels[index]! - after.pixels[index]!)
    )
  }
  expectTerminalGlyphPixelsPreserved(maximumDifference)
}

async function screenshotDifference(page: Page, before: Buffer, after: Buffer): Promise<number> {
  return page.evaluate(
    async (images) => {
      const pixels = await Promise.all(
        images.map(async (base64) => {
          const image = new Image()
          image.src = `data:image/png;base64,${base64}`
          await image.decode()
          const canvas = document.createElement('canvas')
          canvas.width = image.naturalWidth
          canvas.height = image.naturalHeight
          const context = canvas.getContext('2d')!
          context.drawImage(image, 0, 0)
          // The aligned canvas may extend a fraction of a pixel beyond its
          // unmodified viewport. Exclude only that clipped outer pixel border.
          return context.getImageData(1, 1, canvas.width - 2, canvas.height - 2).data
        })
      )
      if (pixels[0]!.length !== pixels[1]!.length) return 255
      let difference = 0
      for (let index = 0; index < pixels[0]!.length; index += 1) {
        difference = Math.max(difference, Math.abs(pixels[0]![index]! - pixels[1]![index]!))
      }
      return difference
    },
    [before.toString('base64'), after.toString('base64')]
  )
}
