import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { resolveAppIconPath } from '../../../src/platform/electron-main/appIconPath'

describe('platform app icon', () => {
  it('resolves the public PNG while the Electron renderer dev server is active', () => {
    const expectedPath = join('/workspace', 'public', 'app-icon.png')

    expect(
      resolveAppIconPath({
        fileExists: (path) => path === expectedPath,
        isDevelopment: true,
        mainDirectory: join('/workspace', 'out', 'main'),
        projectDirectory: '/workspace'
      })
    ).toBe(expectedPath)
  })

  it('resolves the renderer build asset outside development', () => {
    const expectedPath = join('/workspace', 'out', 'renderer', 'app-icon.png')

    expect(
      resolveAppIconPath({
        fileExists: (path) => path === expectedPath,
        isDevelopment: false,
        mainDirectory: join('/workspace', 'out', 'main'),
        projectDirectory: '/workspace'
      })
    ).toBe(expectedPath)
  })

  it('does not configure an unavailable icon', () => {
    expect(
      resolveAppIconPath({
        fileExists: () => false,
        isDevelopment: false,
        mainDirectory: join('/workspace', 'out', 'main'),
        projectDirectory: '/workspace'
      })
    ).toBeUndefined()
  })

  it('ships one SVG source, one PNG runtime asset, and a matching favicon reference', () => {
    const projectDirectory = process.cwd()
    const indexHtml = readFileSync(join(projectDirectory, 'index.html'), 'utf8')

    expect(existsSync(join(projectDirectory, 'public', 'app-icon.svg'))).toBe(true)
    expect(existsSync(join(projectDirectory, 'public', 'app-icon.png'))).toBe(true)
    expect(indexHtml).toContain('<link rel="icon" type="image/svg+xml" href="/app-icon.svg" />')
  })
})
