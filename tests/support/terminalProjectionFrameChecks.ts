import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { canonicalTerminalPalettes } from '../../src/contexts/run/application/dto/TerminalPalette.generated'
import { pollUntilState } from './e2ePolling'
import { captureTerminalGlyphs } from './terminalProjectionChecks'

const restore = (page: Page, line: string) =>
  page.evaluate((data) => window.terminalIndexedFixture.restoreContent('\x1b[?25l' + data), line)
const theme = (page: Page, value: 'light' | 'dark') =>
  page.evaluate((target) => window.terminalIndexedFixture.theme(target), value)
const ink = (page: Page, renderer: string) =>
  captureTerminalGlyphs(page, renderer).then(({ grid }) => grid.slice(0, 4))
async function evidence(page: Page, name: string) {
  const dir = join(process.cwd(), 'test-results', 'terminal-projection-frames')
  await mkdir(dir, { recursive: true })
  await page.locator('.terminal-theme-projection').screenshot({ path: join(dir, name + '.png') })
}

export const projectionFrameChecks = {
  async synchronized(page: Page, renderer: string) {
    await restore(page, '██ \x1b[31m██\x1b[0m')
    const margin = () =>
      page
        .locator('.terminal-theme-projection')
        .evaluate((el) => getComputedStyle(el).backgroundColor)
    const nativeMargin = await margin()
    const native = await ink(page, renderer)
    await theme(page, 'light')
    const projected = await pollUntilState({
      description: 'first complete projected frame',
      timeoutMs: 5000,
      observe: () => ink(page, renderer),
      accept: (frame) => frame[0] !== native[0] && frame[0] !== frame[2]
    })
    const projectedMargin = await margin()
    for (const [target, before, after] of [
      ['dark', projected, native],
      ['light', native, projected]
    ] as const) {
      await page.evaluate(async (target) => {
        const f = window.terminalIndexedFixture
        await f.write('\x1b[?2026h')
        // Let each preference reach the observer before requesting the final theme.
        for (const next of [target, target === 'dark' ? 'light' : 'dark', target] as const) {
          f.theme(next)
          await Promise.resolve()
        }
      }, target)
      expect(await ink(page, renderer)).toEqual(before)
      expect(await margin()).toBe(target === 'dark' ? projectedMargin : nativeMargin)
      await evidence(page, renderer + '-buffered-' + target)
      await page.evaluate(() => window.terminalIndexedFixture.write('\x1b[?2026l'))
      await pollUntilState({
        description: 'theme frame after DEC 2026 ends',
        timeoutMs: 5000,
        observe: () => ink(page, renderer),
        accept: (frame) => frame.every((pixel, i) => pixel === after[i])
      })
    }
  },
  async saturated(page: Page, renderer: string) {
    const matte = '\x1b[48;2;18;52;86m'
    await restore(page, matte + '   ██ \x1b[38;2;65;102;136m██\x1b[0m \x1b[38;2;65;102;136m██')
    await page.evaluate(() => {
      const f = window.terminalIndexedFixture
      f.setColorPairs([{ role: 'background', dark: 0x123456, light: 0x0000ff }])
      f.theme('light')
    })
    const frame = await pollUntilState({
      description: 'saturated blue matte and foreground on a mapped cell',
      timeoutMs: 5000,
      observe: () => ink(page, renderer),
      accept: ([bg, fg, explicit, control]) =>
        bg === 0x0000ff &&
        fg === Number.parseInt(canonicalTerminalPalettes.light.foreground.slice(1), 16) &&
        explicit === control
    })
    expect(frame[2]).not.toBe(frame[0])
    await evidence(page, renderer + '-saturated')
    // A viewport containing only spaces still needs an opaque, unfiltered matte.
    await restore(page, matte + '   ')
    await pollUntilState({
      description: 'blank mapped cells to retain the target background',
      timeoutMs: 5000,
      observe: () => ink(page, renderer),
      accept: ([bg, adjacent]) => bg === 0x0000ff && adjacent !== bg
    })
  },
  async bitmap(page: Page, renderer: string) {
    await restore(page, '██')
    const raster = () => page.evaluate(() => window.terminalIndexedFixture.raster())
    const base = await raster()
    expect(base.cost).toBeGreaterThan(0)
    await theme(page, 'light')
    const child = page
      .locator('.terminal-indexed-glyph-layer')
      .locator(renderer === 'dom' ? '.xterm-rows' : 'canvas')
    await child.waitFor()
    const projected = await raster()
    expect(projected.cost).toBe(base.cost * (renderer === 'dom' ? 1 : 2))
    if (renderer === 'webgl') expect(projected.changes).toBeGreaterThan(base.changes)
    await page.evaluate(() => window.terminalIndexedFixture.write('\x1b[2J\x1b[H'))
    if (renderer === 'webgl') await child.waitFor({ state: 'detached' })
    expect((await raster()).cost).toBe(base.cost)
    if (renderer !== 'webgl') return
    expect((await raster()).changes).toBeGreaterThan(projected.changes)
    await page.evaluate(() => window.terminalIndexedFixture.write('██'))
    await child.waitFor()
    await theme(page, 'dark')
    await child.waitFor({ state: 'detached' })
    expect((await raster()).cost).toBe(base.cost)
    await theme(page, 'light')
    await child.waitFor()
    await page.locator('.xterm-screen canvas').evaluateAll((canvases) => {
      for (const canvas of canvases) {
        const gl = (canvas as HTMLCanvasElement).getContext('webgl2')
        gl?.getExtension('WEBGL_lose_context')?.loseContext()
      }
    })
    await page.locator('[data-terminal-renderer="dom"]').waitFor()
    expect((await raster()).cost).toBe(base.cost)
  }
}
