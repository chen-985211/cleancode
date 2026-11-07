import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { CodexAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/codex/CodexAgentProviderContribution'
import { useTerminalPresentationWindow } from '../../../support/terminalPresentationWindow'
import { captureTerminalGlyphs } from '../../../support/terminalProjectionChecks'

const electron = useTerminalPresentationWindow()
const output = join(process.cwd(), 'test-results', 'terminal-projection-transitions')
const write = (data: string) =>
  electron.page.evaluate((chunk) => window.terminalIndexedFixture.write(chunk), data)
const ink = async (renderer: string) =>
  (await captureTerminalGlyphs(electron.page, renderer)).grid.slice(0, 3)

async function projectedFrame(renderer: string) {
  await electron.mountIndexedGlyphs(renderer, 'dark')
  await electron.page.evaluate(async () => {
    const f = window.terminalIndexedFixture
    await f.restoreContent('\x1b[?25l██ \x1b[31m██\x1b[0m')
    f.theme('light')
  })
  const frame = [0x172033, 0xcc0000, 0xf2f4f5]
  await expect.poll(() => ink(renderer)).toEqual(frame)
  return frame
}

beforeAll(() => mkdir(output, { recursive: true }))

it.each(['dom', 'webgl'])(
  'restores a complete %s workspace frame before synchronized output ends',
  async (renderer) => {
    const before = await projectedFrame(renderer)
    await write('\x1b[?2026h')
    const costs = await electron.page.evaluate(async () => {
      const f = window.terminalIndexedFixture
      const visible = f.raster().cost
      f.switchWorkspaceAway()
      const retained = f.raster().cost
      f.theme('dark')
      await f.write('\x1b[H\x1b[32m██\x1b[0m')
      f.switchWorkspaceBack()
      return { visible, retained }
    })
    expect(costs.retained).toBe(costs.visible)
    expect(await ink(renderer)).toEqual(before)
    await electron.page
      .locator('.xterm-screen')
      .screenshot({ path: join(output, renderer + '-workspace.png') })
    await write('\x1b[?2026l')
    await expect.poll(() => ink(renderer)).toEqual([0x4e9a06, 0xcc0000, 0x202326])
  }
)

it.each(['dom', 'webgl'])(
  'preserves the painted %s frame on synchronous alternate-buffer entry and exit',
  async (renderer) => {
    const normal = await projectedFrame(renderer)
    await write('\x1b[?2026h\x1b[?1049h\x1b[H\x1b[32m██\x1b[0m')
    expect(await ink(renderer)).toEqual(normal)
    await electron.page
      .locator('.xterm-screen')
      .screenshot({ path: join(output, renderer + '-enter-alternate.png') })
    await write('\x1b[?2026l')
    const alternate = [0x4e9a06, normal[2], normal[2]]
    await expect.poll(() => ink(renderer)).toEqual(alternate)
    await write('\x1b[?2026h\x1b[?1049l')
    expect(await ink(renderer)).toEqual(alternate)
    await write('\x1b[?2026l')
    await expect.poll(() => ink(renderer)).toEqual(normal)
  }
)

it.each(['dark', 'light'] as const)(
  'shows and clears WebGL hover underlines on projected %s Codex messages',
  async (source) => {
    await electron.mountIndexedGlyphs('webgl', source)
    const pairs = new CodexAgentProviderContribution().descriptor.terminalColorPairs
    const page = electron.page
    await page.evaluate(
      async ({ source, pairs }) => {
        const f = window.terminalIndexedFixture
        const bg = source === 'dark' ? '67;70;72' : '237;239;240'
        f.setColorPairs(pairs)
        await f.restoreContent(
          '\x1b[?25l\x1b[48;2;' + bg + 'mhttps://example.com\r\n./src/file.ts\x1b[0m'
        )
        f.theme(source === 'dark' ? 'light' : 'dark')
        if (source === 'light') f.zoom(1.25)
      },
      { source, pairs }
    )
    const ready = page.locator(
      '[data-terminal-projected="true"] [data-terminal-content-ready="true"][data-terminal-renderer="webgl"]'
    )
    await ready.waitFor()
    const grid = await ready.locator('.xterm-screen').evaluate((screen) => {
      const bounds = screen.getBoundingClientRect()
      const { columns, rows } = window.terminalIndexedFixture.dimensions()
      return { x: bounds.left, y: bounds.top, w: bounds.width / columns, h: bounds.height / rows }
    })
    for (const [row, length] of [
      [0, 'https://example.com'.length],
      [1, './src/file.ts'.length]
    ] as const) {
      const y = Math.floor(grid.y + (row + 1) * grid.h - 3)
      const clip = {
        x: Math.ceil(grid.x + grid.w),
        y,
        width: Math.floor((length - 2) * grid.w),
        height: 3
      }
      await page.mouse.move(grid.x + 40 * grid.w, grid.y + 4 * grid.h)
      const baseline = await page.screenshot({ clip })
      await page.mouse.move(grid.x + 3 * grid.w, grid.y + (row + 0.5) * grid.h)
      await page.locator('.xterm-cursor-pointer').waitFor()
      const hovered = await page.screenshot({ clip })
      expect(hovered.equals(baseline), 'underline pixels on the visible composited screen').toBe(
        false
      )
      await ready
        .locator('.xterm-screen')
        .screenshot({ path: join(output, source + '-hover-' + row + '.png') })
      await page.mouse.move(grid.x + 40 * grid.w, grid.y + 4 * grid.h)
      await page.locator('.xterm-cursor-pointer').waitFor({ state: 'detached' })
      expect((await page.screenshot({ clip })).equals(baseline)).toBe(true)
    }
  },
  15000
)

describe.each(['dark', 'light'] as const)('DOM interaction while leaving a %s frame', (display) => {
  it.each(['focus', 'blur', 'hover', 'leave'] as const)(
    'holds the painted frame through %s until synchronized output ends',
    async (interaction) => {
      await electron.mountIndexedGlyphs('dom', 'dark')
      const page = electron.page
      const next = display === 'dark' ? 'light' : 'dark'
      await page.evaluate(async (theme) => {
        const f = window.terminalIndexedFixture
        // Wrap the URL so the final redraw must underline the correct cells on both rows.
        const column = f.dimensions().columns - 7
        await f.restoreContent(`\x1b[?25l██ \x1b[31m██\x1b[0m\x1b[${column}Ghttps://example.com`)
        f.theme(theme)
      }, display)
      const screen = page.locator('.xterm-screen')
      const textarea = page.locator('.xterm-helper-textarea')
      const link = page.locator('.xterm-cursor-pointer')
      const underlinedText = () =>
        screen.locator('.xterm-rows span').evaluateAll((spans) =>
          spans
            .filter((s) => (s as HTMLElement).style.textDecorationLine === 'underline')
            .map((s) => s.textContent)
            .join('')
        )
      const point = await screen.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const { columns, rows } = window.terminalIndexedFixture.dimensions()
        return { x: r.x + (2.5 * r.width) / columns, y: r.y + (1.5 * r.height) / rows }
      })
      const hover = async (active: boolean) => {
        await page.mouse.move(active ? point.x : 1, active ? point.y : 1)
        await link.waitFor({ state: active ? 'attached' : 'detached' })
      }
      await hover(false)
      if (interaction === 'blur') await textarea.focus()
      if (interaction === 'focus') await textarea.blur()
      await page
        .locator(
          `[data-terminal-projected="${display === 'light'}"] [data-terminal-content-ready="true"]`
        )
        .waitFor()
      if (interaction === 'leave') {
        const idle = await screen.screenshot()
        await hover(true)
        await expect.poll(underlinedText).toBe('https://example.com')
        expect(
          (await screen.screenshot()).equals(idle),
          'visible underline before the freeze'
        ).toBe(false)
      }
      const before = await screen.screenshot()
      await write('\x1b[?2026h')
      await page.evaluate<void, typeof display>(
        (theme) => window.terminalIndexedFixture.theme(theme),
        next
      )
      if (interaction === 'blur') await textarea.blur()
      if (interaction === 'focus') await textarea.focus()
      if (interaction === 'hover' || interaction === 'leave') await hover(interaction === 'hover')
      const during = await screen.screenshot({
        path: join(output, `dom-${display}-synchronized-${interaction}.png`)
      })
      expect(during.equals(before), 'same visible pixels before the flush').toBe(true)
      await write('\x1b[?2026l')
      await expect
        .poll(async () => (await ink('dom'))[0])
        .toBe(next === 'light' ? 0x172033 : 0xd6dee8)
      if (interaction === 'focus' || interaction === 'blur') {
        expect(await screen.locator('.xterm-rows.xterm-focus').count()).toBe(
          interaction === 'focus' ? 1 : 0
        )
      }
      if (interaction === 'hover' || interaction === 'leave') {
        await expect.poll(underlinedText).toBe(interaction === 'hover' ? 'https://example.com' : '')
      }
      if (interaction === 'hover') {
        const hovered = await screen.screenshot()
        await hover(false)
        await expect.poll(underlinedText).toBe('')
        expect(
          (await screen.screenshot()).equals(hovered),
          'visible underline after the flush'
        ).toBe(false)
      }
    }
  )
})
