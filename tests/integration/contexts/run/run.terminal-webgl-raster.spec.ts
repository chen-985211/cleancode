import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { _electron as electron, type ElectronApplication } from 'playwright'

import { renderTerminalRasterFixture } from '../../../support/terminalRasterBrowser'

const require = createRequire(import.meta.url)
const xtermDirectory = dirname(require.resolve('@xterm/xterm'))
const webglDirectory = dirname(require.resolve('@xterm/addon-webgl'))

describe.each([1, 1.25, 1.5, 2])(
  'terminal raster at device pixel ratio %s',
  (deviceScaleFactor) => {
    let application: ElectronApplication | undefined
    let profile: string

    beforeEach(async () => {
      profile = await mkdtemp(join(tmpdir(), 'cleancode-raster-'))
      application = await electron.launch({
        args: [
          join(process.cwd(), 'tests', 'fixtures', 'terminalRasterBrowser.mjs'),
          `--user-data-dir=${profile}`,
          `--force-device-scale-factor=${deviceScaleFactor}`
        ]
      })
    }, 30_000)

    afterEach(async () => {
      try {
        await application?.close()
      } finally {
        await rm(profile, { force: true, recursive: true })
        application = undefined
      }
    })

    it.each(['esm', 'cjs'] as const)(
      '%s entry preserves grid and glyph alignment with matched or retained bitmap resolution',
      async (entry) => {
        const page = await application!.firstWindow()
        const xtermSource = await readFile(join(xtermDirectory, 'xterm.mjs'), 'utf8')
        const addonSource = await readFile(
          join(webglDirectory, entry === 'esm' ? 'addon-webgl.mjs' : 'addon-webgl.js'),
          'utf8'
        )
        const xtermStyles = await readFile(join(xtermDirectory, '..', 'css', 'xterm.css'), 'utf8')
        await page.addStyleTag({ content: xtermStyles })

        const cases = [
          { zoom: 1.6, rasterScale: 1.6, columns: 60, theme: 'light' },
          { zoom: 1.6, rasterScale: 1.6, columns: 79, theme: 'dark' },
          { zoom: 0.35, rasterScale: 1, columns: 60, theme: 'light' },
          { zoom: 0.77, rasterScale: 1, columns: 60, theme: 'light' },
          { zoom: 1, rasterScale: 1, columns: 60, theme: 'dark' },
          { zoom: 1.25, rasterScale: 1.25, columns: 79, theme: 'dark' },
          { zoom: 1.1, rasterScale: 1.25, columns: 60, theme: 'light' },
          { zoom: 1.4, rasterScale: 1.5, columns: 79, theme: 'dark' },
          { zoom: 0.77, rasterScale: 1.6, columns: 60, theme: 'light' },
          { zoom: 1.4, rasterScale: 1.6, columns: 79, theme: 'dark' }
        ] as const
        for (const { zoom, rasterScale, columns, theme } of cases) {
          const projection = await renderTerminalRasterFixture(page, {
            addonSource,
            entry,
            columns,
            theme,
            xtermSource,
            zoom,
            rasterScale
          })
          const capture = process.env.CLEANCODE_CAPTURE_RASTER
          if (capture) {
            const output = join(process.cwd(), 'test-results', 'terminal-raster', capture)
            await mkdir(output, { recursive: true })
            await page.screenshot({
              path: join(
                output,
                `${entry}-dpr-${deviceScaleFactor}-zoom-${zoom}-raster-${rasterScale}-${theme}.png`
              )
            })
          }

          expect(projection.devicePixelRatio).toBeCloseTo(deviceScaleFactor, 5)
          expect(projection.columns).toBe(columns)
          expect(projection.rows).toBe(10)
          expect(projection.preservesScreenGeometry).toBe(true)
          expect(projection.backingWidth).toBe(
            Math.round(projection.screenWidth * deviceScaleFactor * rasterScale)
          )
          expect(projection.backingHeight).toBe(
            Math.round(projection.screenHeight * deviceScaleFactor * rasterScale)
          )
          if (zoom === rasterScale) {
            expect(projection.backingWidth).toBe(
              Math.round(projection.displayWidth * deviceScaleFactor)
            )
            expect(projection.backingHeight).toBe(
              Math.round(projection.displayHeight * deviceScaleFactor)
            )
          } else {
            expect(projection.backingWidth).toBeGreaterThan(
              projection.displayWidth * deviceScaleFactor
            )
            expect(projection.backingHeight).toBeGreaterThan(
              projection.displayHeight * deviceScaleFactor
            )
          }
          expect(projection.displayLeft * deviceScaleFactor).toBeCloseTo(
            Math.round(projection.displayLeft * deviceScaleFactor),
            2
          )
          expect(projection.displayTop * deviceScaleFactor).toBeCloseTo(
            Math.round(projection.displayTop * deviceScaleFactor),
            2
          )
          expect(projection.glyphVariants, JSON.stringify({ zoom, ...projection })).toBe(1)
          expect(projection.hasInk).toBe(true)
          expect(projection.pannedLeft * deviceScaleFactor).toBeCloseTo(
            Math.round(projection.pannedLeft * deviceScaleFactor),
            2
          )
          expect(projection.pannedTop * deviceScaleFactor).toBeCloseTo(
            Math.round(projection.pannedTop * deviceScaleFactor),
            2
          )
          expect(projection.alignmentIsIdempotent).toBe(true)
          expect(projection.alignmentPreservesBacking).toBe(true)
        }
      },
      30_000
    )
  }
)
