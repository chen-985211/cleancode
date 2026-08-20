import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

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

  it('keeps the dock artwork within balanced margins with an optically compensated mark', () => {
    const svg = readFileSync(join(process.cwd(), 'public', 'app-icon.svg'), 'utf8')
    const basePlate = svg.match(
      /<rect\s+x="([\d.]+)"\s+y="([\d.]+)"\s+width="([\d.]+)"\s+height="([\d.]+)"/
    )
    const markTransform = svg.match(
      /<path[\s\S]*?transform="translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)/
    )

    expect(basePlate).not.toBeNull()
    expect(markTransform).not.toBeNull()

    const [, x, y, width, height] = basePlate!
    const [, markX, markY, markScale] = markTransform!

    expect(Number(width) / 1024).toBeLessThanOrEqual(0.81)
    expect(Number(x) + Number(width) / 2).toBe(512)
    expect(Number(y) + Number(height) / 2).toBe(512)
    expect(Number(markX)).toBeGreaterThanOrEqual(516)
    expect(Number(markX)).toBeLessThanOrEqual(524)
    expect(Number(markY)).toBe(512)
    expect(Number(markScale)).toBeLessThanOrEqual(0.8)
  })

  it('uses a larger, centered Windows plate while preserving the mark proportions', () => {
    const svg = readFileSync(join(process.cwd(), 'public', 'app-icon-windows.svg'), 'utf8')
    const basePlate = svg.match(
      /<rect\s+x="([\d.]+)"\s+y="([\d.]+)"\s+width="([\d.]+)"\s+height="([\d.]+)"/
    )
    const markTransform = svg.match(
      /<path[\s\S]*?transform="translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)/
    )

    expect(basePlate).not.toBeNull()
    expect(markTransform).not.toBeNull()

    const [, x, y, width, height] = basePlate!
    const [, markX, markY, markScale] = markTransform!

    expect([Number(x), Number(y), Number(width), Number(height)]).toEqual([48, 48, 928, 928])
    expect(Number(x) + Number(width) / 2).toBe(512)
    expect(Number(y) + Number(height) / 2).toBe(512)
    expect(Number(markX)).toBeCloseTo(521.01, 2)
    expect(Number(markY)).toBe(512)
    expect(Number(markScale)).toBeCloseTo(0.900971, 6)
  })
})
