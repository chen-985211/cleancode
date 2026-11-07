import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Page } from 'playwright'
import type {} from '../fixtures/terminalIndexedGlyphs'
import { pollUntilState } from './e2ePolling'

const output = join(process.cwd(), 'test-results', 'terminal-projection-review')

export async function checkEffectiveBoldSlots(page: Page, renderer: string): Promise<void> {
  const paint = (osc: string) =>
    page.evaluate(
      (data) => window.terminalIndexedFixture.write(data),
      osc + '\x1b[H\x1b[1;37m██\x1b[0m \x1b[1;97m██\x1b[0m'
    )
  await page.evaluate(async () => {
    await window.terminalIndexedFixture.restoreContent('\x1b[?25l')
    window.terminalIndexedFixture.theme('dark')
  })
  await paint('')
  const readPair = async () => (await captureTerminalGlyphs(page, renderer)).grid.slice(0, 2)
  const native = (await readPair())[1]!
  const waitForNativePair = () =>
    pollUntilState({
      description: 'bold ANSI 7 and 15 to render with the native bright slot',
      observe: readPair,
      accept: ([a, b]) => a === native && b === native,
      timeoutMs: 5000
    })
  await paint('\x1b]4;7;#123456\x07')
  await waitForNativePair()
  await paint('\x1b]4;15;#234567\x07')
  await pollUntilState({
    description: 'both bold glyphs to render the custom bright slot',
    observe: readPair,
    accept: ([a, b]) => a === b && a !== native,
    timeoutMs: 5000
  })
  await paint('\x1b]104;15\x07')
  await waitForNativePair()
}

export async function checkTerminalPunctuation(
  page: Page,
  source: 'dark' | 'light'
): Promise<void> {
  await page.evaluate(async (theme) => {
    const f = window.terminalIndexedFixture
    await f.restoreContent('\x1b[?25l\x1b[31m，，，，\x1b[0;48;2;68;70;73mMARK\x1b[0m')
    f.theme(theme === 'dark' ? 'light' : 'dark')
  }, source)
  await page.locator('.terminal-indexed-glyph-layer .xterm-rows').waitFor()
  await mkdir(output, { recursive: true })
  await page
    .locator('.terminal-theme-projection')
    .screenshot({ path: join(output, source + '-punctuation.png') })
  const positions = await page.evaluate(() => {
    const screen = document
      .querySelector('.terminal-viewport .xterm-screen')!
      .getBoundingClientRect()
    const grid = (screen.width / window.terminalIndexedFixture.dimensions().columns) * 8
    const [base, ink] = ['.terminal-viewport', '.terminal-indexed-glyph-layer'].map((selector) => {
      const row = document.querySelector(selector + ' .xterm-rows')!
      const mark = Array.from(row.querySelectorAll('span')).find((span) =>
        span.textContent.includes('MARK')
      )!
      return mark.getBoundingClientRect().left - screen.left
    })
    return { base: base!, ink: ink!, grid }
  })
  await writeFile(join(output, source + '-punctuation.json'), JSON.stringify(positions, null, 2))
  expect(Math.abs(positions.base - positions.ink)).toBeLessThan(0.1)
  expect(Math.abs(positions.base - positions.grid)).toBeLessThan(1)
}

export async function checkTerminalPreedit(
  page: Page,
  renderer: string,
  source: 'dark' | 'light'
): Promise<void> {
  await page.evaluate(async (theme) => {
    const f = window.terminalIndexedFixture
    await f.restoreContent('\x1b[?25l\x1b[2;1H\x1b[38;5;9m████████████████████████\x1b[0m\x1b[2;3H')
    f.theme(theme === 'dark' ? 'light' : 'dark')
    if (theme === 'light') f.zoom(1.25)
  }, source)
  const cdp = await page.context().newCDPSession(page)
  const layer = page.locator('.terminal-indexed-glyph-layer')
  const composition = page.locator('.composition-view.active')
  await mkdir(output, { recursive: true })
  await page.locator('.xterm-helper-textarea').focus()
  const screen = page.locator('.xterm-screen')
  await layer.waitFor({ state: 'visible' })
  const [neighbor, cursor] = await screen.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const { columns, rows } = window.terminalIndexedFixture.dimensions()
    const center = (column: number) => ({
      x: Math.floor(r.left + ((column + 0.5) * r.width) / columns),
      y: Math.floor(r.top + (1.5 * r.height) / rows),
      width: 1,
      height: 1
    })
    return [center(16), center(2)]
  })
  const shot = (clip: typeof neighbor) => page.screenshot({ clip })
  const adjacentInk = await shot(neighbor!)
  const cursorInk = await shot(cursor!)
  await layer.evaluate((el) => (el.style.visibility = 'hidden'))
  expect((await shot(neighbor!)).equals(adjacentInk)).toBe(false)
  await layer.evaluate((el) => el.style.removeProperty('visibility'))
  try {
    for (const text of ['に', '日本語']) {
      await cdp.send('Input.imeSetComposition', {
        text,
        selectionStart: text.length,
        selectionEnd: text.length
      })
      await page.waitForFunction(
        (t) => document.querySelector('.composition-view.active')?.textContent === t,
        text
      )
      await composition.screenshot({ path: join(output, `${source}-${renderer}-preedit.png`) })
      // A locator screenshot rounds outwards and includes neighboring screen pixels.
      // Compare only whole CSS pixels inside the opaque composition rectangle.
      const clip = await composition.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const x = Math.ceil(r.left),
          y = Math.ceil(r.top)
        return { x, y, width: Math.floor(r.right) - x, height: Math.floor(r.bottom) - y }
      })
      const actual = await page.screenshot({ clip })
      await layer.evaluate((el) => (el.style.visibility = 'hidden'))
      const reference = await page.screenshot({ clip })
      await layer.evaluate((el) => el.style.removeProperty('visibility'))
      if (!actual.equals(reference)) {
        await writeFile(join(output, `${source}-${renderer}-actual.png`), actual)
        await writeFile(join(output, `${source}-${renderer}-reference.png`), reference)
        const details = await layer.evaluate((el) => ({
          clip: el.style.clipPath,
          rect: el.getBoundingClientRect().toJSON()
        }))
        expect(actual.equals(reference), JSON.stringify({ text, clip, details })).toBe(true)
      }
      expect((await shot(neighbor!)).equals(adjacentInk)).toBe(true)
    }
    await cdp.send('Input.insertText', { text: '日本語' })
    await composition.waitFor({ state: 'hidden' })
    await page.waitForFunction(() => window.terminalIndexedFixture.input().length > 0)
    expect(await page.evaluate(() => window.terminalIndexedFixture.input())).toEqual(['日本語'])
    expect((await shot(cursor!)).equals(cursorInk)).toBe(true)
    await cdp.send('Input.imeSetComposition', { text: '中文', selectionStart: 2, selectionEnd: 2 })
    await composition.waitFor()
    await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 })
    await composition.waitFor({ state: 'hidden' })
    expect(await page.evaluate(() => window.terminalIndexedFixture.input())).toEqual(['日本語'])
    expect((await shot(cursor!)).equals(cursorInk)).toBe(true)
  } finally {
    await cdp.detach()
  }
}

export async function captureTerminalGlyphs(page: Page, renderer: string) {
  const view = page.locator('[data-terminal-content-ready="true"]')
  await view.waitFor()
  expect(await view.getAttribute('data-terminal-renderer')).toBe(renderer)
  const png = await view.locator('.xterm-screen').screenshot()
  return page.evaluate(async (base64) => {
    const im = new Image()
    im.src = 'data:image/png;base64,' + base64
    await im.decode()
    const canvas = document.createElement('canvas')
    canvas.width = im.naturalWidth
    canvas.height = im.naturalHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(im, 0, 0)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    const { rows, columns } = window.terminalIndexedFixture.dimensions()
    const at = (x: number, y: number) => {
      const i =
        4 *
        (Math.floor((y * canvas.height) / rows) * canvas.width +
          Math.floor((x * canvas.width) / columns))
      return data[i]! * 65536 + data[i + 1]! * 256 + data[i + 2]!
    }
    return {
      grid: Array.from({ length: 256 }, (_, i) => at(3 * (i % 32) + 0.5, Math.floor(i / 32) + 0.5)),
      defaults: [at(0.5, 9.5), at(3.5, 9.5), at(6.5, 9.5)],
      control: [at(0.5, 8.5), at(3.5, 8.5), at(6.5, 8.5), at(9.5, 8.5)]
    }
  }, png.toString('base64'))
}
