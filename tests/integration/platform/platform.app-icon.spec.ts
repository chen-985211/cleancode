import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, type ElectronApplication } from 'playwright'

import { resolveAppIconPath } from '../../../src/platform/electron-main/appIconPath'

describe('platform app icon', () => {
  it('resolves the public PNG for non-Windows development', () => {
    const expectedPath = join('/workspace', 'public', 'app-icon.png')

    expect(
      resolveAppIconPath({
        fileExists: (path) => path === expectedPath,
        isDevelopment: true,
        mainDirectory: join('/workspace', 'out', 'main'),
        platform: 'darwin',
        projectDirectory: '/workspace'
      })
    ).toBe(expectedPath)
  })

  it('resolves the renderer build asset for non-Windows production', () => {
    const expectedPath = join('/workspace', 'out', 'renderer', 'app-icon.png')

    expect(
      resolveAppIconPath({
        fileExists: (path) => path === expectedPath,
        isDevelopment: false,
        mainDirectory: join('/workspace', 'out', 'main'),
        platform: 'linux',
        projectDirectory: '/workspace'
      })
    ).toBe(expectedPath)
  })

  it('defaults to the host platform when the runtime caller does not override it', () => {
    const fileName = process.platform === 'win32' ? 'app-icon-windows.png' : 'app-icon.png'
    const expectedPath = join('/workspace', 'public', fileName)

    expect(
      resolveAppIconPath({
        fileExists: (path) => path === expectedPath,
        isDevelopment: true,
        mainDirectory: join('/workspace', 'out', 'main'),
        projectDirectory: '/workspace'
      })
    ).toBe(expectedPath)
  })

  it.each([
    {
      expectedPath: join('/workspace', 'public', 'app-icon-windows.png'),
      isDevelopment: true
    },
    {
      expectedPath: join('/workspace', 'out', 'renderer', 'app-icon-windows.png'),
      isDevelopment: false
    }
  ])('resolves the Windows-specific asset when isDevelopment=$isDevelopment', (testCase) => {
    expect(
      resolveAppIconPath({
        fileExists: (path) => path === testCase.expectedPath,
        isDevelopment: testCase.isDevelopment,
        mainDirectory: join('/workspace', 'out', 'main'),
        platform: 'win32',
        projectDirectory: '/workspace'
      })
    ).toBe(testCase.expectedPath)
  })

  it('falls back to the generic asset when the Windows-specific asset is unavailable', () => {
    const expectedPath = join('/workspace', 'public', 'app-icon.png')

    expect(
      resolveAppIconPath({
        fileExists: (path) => path === expectedPath,
        isDevelopment: true,
        mainDirectory: join('/workspace', 'out', 'main'),
        platform: 'win32',
        projectDirectory: '/workspace'
      })
    ).toBe(expectedPath)
  })

  it('does not configure an icon when every platform candidate is unavailable', () => {
    expect(
      resolveAppIconPath({
        fileExists: () => false,
        isDevelopment: false,
        mainDirectory: join('/workspace', 'out', 'main'),
        platform: 'win32',
        projectDirectory: '/workspace'
      })
    ).toBeUndefined()
  })

  it('ships generic and Windows assets with platform-specific packaging', () => {
    const projectDirectory = process.cwd()
    const electronBuilderConfig = readFileSync(
      join(projectDirectory, 'electron-builder.yml'),
      'utf8'
    )
    const indexHtml = readFileSync(join(projectDirectory, 'index.html'), 'utf8')

    expect(existsSync(join(projectDirectory, 'public', 'app-icon.svg'))).toBe(true)
    expect(existsSync(join(projectDirectory, 'public', 'app-icon.png'))).toBe(true)
    expect(existsSync(join(projectDirectory, 'public', 'app-icon-windows.svg'))).toBe(true)
    expect(existsSync(join(projectDirectory, 'public', 'app-icon-windows.png'))).toBe(true)
    expect(indexHtml).toContain('<link rel="icon" type="image/svg+xml" href="/app-icon.svg" />')
    expect(electronBuilderConfig).toMatch(/win:\n\s+icon: public\/app-icon-windows\.png/)
  })

  it.each([
    { asset: 'app-icon', plateWidth: 830 },
    { asset: 'app-icon-windows', plateWidth: 928 }
  ])(
    'renders the graphite plate, edge highlight and lime cursor at the intended size in $asset SVG and PNG',
    async ({ asset, plateWidth }) => {
      const profile = await mkdtemp(join(tmpdir(), 'cleancode-app-icon-'))
      let application: ElectronApplication | undefined
      try {
        application = await electron.launch({
          args: [
            join(process.cwd(), 'tests', 'fixtures', 'terminalRasterBrowser.mjs'),
            `--user-data-dir=${profile}`,
            '--force-color-profile=srgb'
          ]
        })
        const page = await application.firstWindow()
        for (const [extension, mime] of [
          ['svg', 'image/svg+xml'],
          ['png', 'image/png']
        ] as const) {
          const fileName = `${asset}.${extension}`
          const data = readFileSync(join(process.cwd(), 'public', fileName)).toString('base64')
          const artwork = await page.evaluate(
            async ({ src, plateWidth }) => {
              const image = new Image()
              image.src = src
              await image.decode()
              const width = image.naturalWidth
              const height = image.naturalHeight
              const native = new OffscreenCanvas(width, height).getContext('2d')!
              native.drawImage(image, 0, 0)
              const margins = (line: ImageData) => {
                const alpha = line.data.filter((_, index) => index % 4 === 3)
                return [
                  alpha.findIndex((value) => value >= 245),
                  alpha.length - 1 - alpha.findLastIndex((value) => value >= 245)
                ]
              }
              // Align each plate to the same 107 px footprint to compare the artwork.
              const context = new OffscreenCanvas(132, 132).getContext('2d')!
              context.imageSmoothingQuality = 'high'
              const size = (107 * width) / plateWidth
              const offset = (132 - size) / 2
              context.drawImage(image, offset, offset, size, size)
              const rgba = context.getImageData(0, 0, 132, 132).data
              let platePixels = 0
              let limePixels = 0
              for (let i = 0; i < rgba.length; i += 4) {
                if (rgba[i + 3]! >= 245) platePixels++
                if (rgba[i + 1]! - rgba[i]! > 20 && rgba[i + 1]! - rgba[i + 2]! > 55) limePixels++
              }
              const pixel = (x: number, y: number) => {
                const index = (y * 132 + x) * 4
                return Array.from(rgba.subarray(index, index + 4)) as [
                  number,
                  number,
                  number,
                  number
                ]
              }
              const fourSides = (x: number, y: number) => [
                pixel(x, y)[1],
                pixel(131 - y, x)[1],
                pixel(131 - x, 131 - y)[1],
                pixel(y, 131 - x)[1]
              ]
              return {
                size: [image.naturalWidth, image.naturalHeight],
                margins: [
                  ...margins(native.getImageData(0, height / 2, width, 1)),
                  ...margins(native.getImageData(width / 2, 0, 1, height))
                ],
                outerAlpha: [
                  pixel(8, 66)[3],
                  pixel(123, 66)[3],
                  pixel(66, 8)[3],
                  pixel(66, 123)[3]
                ],
                innerAlpha: [
                  pixel(16, 66)[3],
                  pixel(115, 66)[3],
                  pixel(66, 16)[3],
                  pixel(66, 115)[3]
                ],
                center: pixel(66, 66)[1],
                innerFace: pixel(66, 39)[1],
                outerFace: fourSides(66, 18),
                rim: [
                  ...fourSides(21, 21),
                  ...fourSides(46, 13),
                  ...fourSides(66, 13),
                  ...fourSides(85, 13)
                ],
                ink: pixel(60, 80),
                cursor: pixel(99, 89),
                cursorBand: [85, 87, 92, 94].map((y) => pixel(99, y)[1] > 150),
                cursorPercent: (limePixels / platePixels) * 100
              }
            },
            { src: `data:${mime};base64,${data}`, plateWidth }
          )
          expect(artwork.size, fileName).toEqual([1024, 1024])
          expect(artwork.margins, fileName).toEqual(Array(4).fill((1024 - plateWidth) / 2))
          expect(Math.max(...artwork.outerAlpha), fileName).toBeLessThan(32)
          expect(artwork.innerAlpha, fileName).toEqual([255, 255, 255, 255])
          expect(artwork.innerFace - artwork.center, fileName).toBeGreaterThan(3)
          expect(artwork.center, fileName).toBeLessThan(35)
          expect(Math.min(...artwork.outerFace) - artwork.innerFace, fileName).toBeGreaterThan(6)
          expect(
            Math.max(...artwork.outerFace) - Math.min(...artwork.outerFace),
            fileName
          ).toBeLessThan(5)
          expect(
            Math.min(...artwork.rim) - Math.max(...artwork.outerFace),
            fileName
          ).toBeGreaterThan(20)
          expect(artwork.ink[0], fileName).toBeGreaterThan(225)
          expect(artwork.ink[2], fileName).toBeLessThan(artwork.ink[0])
          expect(artwork.cursor, fileName).toEqual([195, 239, 117, 255])
          expect(artwork.cursorBand, fileName).toEqual([false, true, true, false])
          expect(artwork.cursorPercent, fileName).toBeGreaterThan(1)
          expect(artwork.cursorPercent, fileName).toBeLessThan(1.25)
        }
      } finally {
        try {
          await application?.close()
        } finally {
          await rm(profile, { recursive: true, force: true })
        }
      }
    },
    30_000
  )
})
