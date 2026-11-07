import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { useTerminalPresentationWindow } from '../../../support/terminalPresentationWindow'

import type {} from '../../../fixtures/terminalSurfacePresentation'
import type {} from '../../../fixtures/terminalIndexedGlyphs'
import {
  captureTerminalGlyphs,
  checkEffectiveBoldSlots,
  checkTerminalPunctuation,
  checkTerminalPreedit
} from '../../../support/terminalProjectionChecks'
import { projectionFrameChecks } from '../../../support/terminalProjectionFrameChecks'
import { HeadlessTerminalModelAdapter } from '../../../../src/contexts/run/infrastructure/terminal-model/HeadlessTerminalModelAdapter'
import { CodexAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/codex/CodexAgentProviderContribution'
import { canonicalTerminalPalettes } from '../../../../src/contexts/run/application/dto/TerminalPalette.generated'
import { readProjectedLightGlyphForeground } from '../../../../src/contexts/run/presentation/terminal-surface/terminalTheme'

const windowFixture = useTerminalPresentationWindow()
const { mountIndexedGlyphs } = windowFixture
let page: Page
beforeAll(async () => {
  page = windowFixture.page
  await page.goto(windowFixture.presentationUrl)
  await page.waitForFunction(() => Boolean(window.terminalPresentationFixture))
})

it('reveals only the latest painted viewport on cold, cached and changed-generation workspace mounts', async () => {
  const first = await page.evaluate(() => window.terminalPresentationFixture.mount())
  expect(first.constructions).toBe(1)
  await expectHidden()
  await restoreAndCheck('green', [0, 128, 0, 255])

  const reused = await page.evaluate(() => window.terminalPresentationFixture.mount())
  expect(reused).toMatchObject({ constructions: 1, reusedElement: true })
  expect(reused.viewId).not.toBe(first.viewId)
  await expectHidden()
  await restoreAndCheck('unchanged', [0, 128, 0, 255])

  await page.evaluate(() => window.terminalPresentationFixture.mount({ width: 640 }))
  await expectHidden()
  await restoreAndCheck('blue', [0, 0, 192, 255])

  const replacement = await page.evaluate(() =>
    window.terminalPresentationFixture.mount({ generation: 2 })
  )
  expect(replacement).toMatchObject({ constructions: 2, reusedElement: false })
  await expectHidden()
  await restoreAndCheck('green', [0, 128, 0, 255])

  const output = join(process.cwd(), 'test-results/terminal-surface-presentation')
  await mkdir(output, { recursive: true })
  await page.screenshot({ path: join(output, 'restored-viewport.png') })
  await page.evaluate(() => window.terminalPresentationFixture.dispose())
}, 30_000)

it('preserves history reading position when a cached workspace returns', async () => {
  await page.reload()
  await page.waitForFunction(() => Boolean(window.terminalPresentationFixture))
  await page.evaluate(() => window.terminalPresentationFixture.mount())
  await restoreAndCheck('green', [0, 128, 0, 255])
  await page.evaluate(() => window.terminalPresentationFixture.readHistory())
  await expect
    .poll(
      async () => (await page.evaluate(() => window.terminalPresentationFixture.state())).colors,
      { timeout: 5000 }
    )
    .toEqual(
      Array.from(
        {
          length: (await page.evaluate(() => window.terminalPresentationFixture.state())).dimensions
            .rows
        },
        () => [192, 0, 0, 255]
      )
    )
  const reused = await page.evaluate(() => window.terminalPresentationFixture.mount())
  expect(reused.reusedElement).toBe(true)
  await restoreAndCheck('unchanged', [192, 0, 0, 255])
  await page.evaluate(() => window.terminalPresentationFixture.dispose())
}, 15_000)

it('also reveals a complete viewport when WebGL falls back to the DOM renderer', async () => {
  await page.goto(`${windowFixture.presentationUrl}?renderer=dom`)
  await page.waitForFunction(() => Boolean(window.terminalPresentationFixture))
  await page.evaluate(() => window.terminalPresentationFixture.mount())
  await expectHidden()
  await page.evaluate(() => window.terminalPresentationFixture.restore('green'))
  await page.waitForFunction(
    () => window.terminalPresentationFixture.state().firstFrame !== null,
    undefined,
    { timeout: 5000 }
  )
  const { firstFrame, dimensions } = await page.evaluate(() =>
    window.terminalPresentationFixture.state()
  )
  expect(firstFrame).toMatchObject({ renderer: 'dom', hiddenBeforeReady: true })
  expect(firstFrame!.text).not.toContain('old history')
  expect(firstFrame!.text).toContain('green latest 1')
  expect(firstFrame!.text).toContain(`green latest ${dimensions.rows}`)
  const hot = await page.evaluate(() => window.terminalPresentationFixture.switchHot())
  expect(hot).toMatchObject({ retained: true, sameViewId: true, restoreCalls: 0, blankFrames: 0 })
  expect(
    (await page.evaluate(() => window.terminalPresentationFixture.state())).firstFrame?.text
  ).toContain('green latest 1')
  await page.evaluate(() => window.terminalPresentationFixture.dispose())
}, 15_000)

it('switches retained mounts with no replay or blank frame, including hidden output and query responses', async () => {
  await page.goto(windowFixture.presentationUrl)
  await page.waitForFunction(() => Boolean(window.terminalPresentationFixture))
  await page.evaluate(() => window.terminalPresentationFixture.mount())
  await restoreAndCheck('green', [0, 128, 0, 255])
  const samples: number[] = []
  for (let index = 0; index < 12; index += 1) {
    const result = await page.evaluate(() => window.terminalPresentationFixture.switchHot())
    expect(result).toMatchObject({
      retained: true,
      reusedElement: true,
      sameViewId: true,
      restoreCalls: 0,
      blankFrames: 0
    })
    expect(result.firstReadyMs).not.toBeNull()
    expect(result.firstReadyMs!).toBeLessThan(100)
    for (const pixel of result.firstColors!) expect(pixel).toEqual([0, 128, 0, 255])
    samples.push(result.firstReadyMs!)
  }
  await page.evaluate(() => {
    window.terminalPresentationFixture.hide()
    window.terminalPresentationFixture.writeHidden()
  })
  await page.waitForFunction(
    () => window.terminalPresentationFixture.state().responses.length === 1
  )
  const afterOutput = await page.evaluate(() => window.terminalPresentationFixture.switchHot())
  expect(afterOutput).toMatchObject({
    retained: true,
    sameViewId: true,
    restoreCalls: 0,
    blankFrames: 0
  })
  for (const pixel of afterOutput.firstColors!) expect(pixel).toEqual([0, 0, 192, 255])
  const state = await page.evaluate(() => window.terminalPresentationFixture.state())
  expect(state.responses).toHaveLength(1)
  expect(state.responses[0]?.startsWith('\x1b[')).toBe(true)
  expect(state.responses[0]?.slice(2)).toMatch(/^\d+;\d+R$/)
  expect(state.detachCalls).toBe(0)
  const output = join(process.cwd(), 'test-results/terminal-surface-presentation')
  await mkdir(output, { recursive: true })
  samples.sort((left, right) => left - right)
  await writeFile(
    join(output, 'hot-switch-timings.json'),
    JSON.stringify(
      {
        samples,
        medianMs: samples[Math.floor(samples.length / 2)],
        p95Ms: samples.at(-1),
        blankFrames: 0,
        hiddenOutputSwitchMs: afterOutput.firstReadyMs
      },
      null,
      2
    )
  )
  await page.screenshot({ path: join(output, 'hot-viewport.png') })
  const resized = await page.evaluate(() =>
    window.terminalPresentationFixture.mount({ hot: true, width: 640 })
  )
  expect(resized.retained).toBe(true)
  await page.waitForFunction(() => window.terminalPresentationFixture.state().firstFrame !== null)
  const resizedFrame = await page.evaluate(
    () => window.terminalPresentationFixture.state().firstFrame
  )
  for (const pixel of resizedFrame!.colors) expect(pixel).toEqual([0, 0, 192, 255])
  await page.evaluate(() => window.terminalPresentationFixture.dispose())
}, 30_000)

it.each(['webgl', 'dom'])(
  'only compensates default glyphs in a dark-source %s surface',
  async (renderer) => {
    await page.goto(`${windowFixture.presentationUrl}?renderer=${renderer}`)
    await page.waitForFunction(() => Boolean(window.terminalPresentationFixture))
    const dimensions = await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark'
      window.terminalPresentationFixture.mount()
      return window.terminalPresentationFixture.state().dimensions
    })
    const native = canonicalTerminalPalettes.dark.foreground
    const projected = readProjectedLightGlyphForeground()
    const channels = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
    // The first row uses default foreground. The second specifies the identical RGB.
    const sample = `\x1b[?25l\x1b[0m████\r\n\x1b[38;2;${channels(native).join(';')}m████`
    const restore = (data: string) =>
      page.evaluate((content) => window.terminalPresentationFixture.restoreContent(content), data)
    const expectGlyphs = async (first: string) => {
      const screen = page.locator('#terminal .xterm-screen')
      await expect
        .poll(
          async () => {
            const png = await screen.screenshot()
            return page.evaluate(
              async ({ png, dimensions, expected }) => {
                const image = new Image()
                image.src = `data:image/png;base64,${png}`
                await image.decode()
                const canvas = document.createElement('canvas')
                canvas.width = image.naturalWidth
                canvas.height = image.naturalHeight
                const context = canvas.getContext('2d')!
                context.drawImage(image, 0, 0)
                return Math.max(
                  ...expected.flatMap((rgb, row) => {
                    const x = Math.floor((1.5 * canvas.width) / dimensions.columns)
                    const y = Math.floor(((row + 0.5) * canvas.height) / dimensions.rows)
                    const pixel = context.getImageData(x, y, 1, 1).data
                    return rgb.map((v, i) => Math.abs(v - pixel[i]!))
                  })
                )
              },
              {
                png: png.toString('base64'),
                dimensions,
                expected: [channels(first), channels(native)]
              }
            )
          },
          { timeout: 5000 }
        )
        .toBeLessThanOrEqual(2)
    }
    try {
      await restore(sample)
      await expectGlyphs(native)
      await page.evaluate(() => {
        document.documentElement.dataset.theme = 'light'
      })
      await expectGlyphs(projected)
      await restore(
        `\x1b]10;rgb:${channels(native)
          .map((c) => c.toString(16))
          .join('/')}\x07${sample}`
      )
      await expectGlyphs(native)
      await restore(`\x1b]110;\x07${sample}`)
      await expectGlyphs(projected)
      await page.evaluate(() => {
        document.documentElement.dataset.theme = 'dark'
      })
      await expectGlyphs(native)
    } finally {
      await page.evaluate(() => window.terminalPresentationFixture.dispose())
    }
  },
  30_000
)

async function expectHidden() {
  expect(await page.evaluate(() => window.terminalPresentationFixture.state())).toMatchObject({
    ready: 'false',
    opacity: '0'
  })
}

it.each([
  ['focused', 'webgl'],
  ['visible', 'webgl'],
  ['focused', 'dom'],
  ['visible', 'dom']
] as const)(
  'reveals a complete viewport under continuously backlogged %s output with the %s renderer',
  async (priority, renderer) => {
    await page.goto(`${windowFixture.presentationUrl}?renderer=${renderer}`)
    try {
      await page.evaluate((value) => {
        window.terminalPresentationFixture.startContinuousOutput(value)
        window.terminalPresentationFixture.mount()
      }, priority)
      await page.evaluate(() => window.terminalPresentationFixture.restore('green'))
      await page.waitForFunction(
        () => window.terminalPresentationFixture.state().firstFrame !== null,
        undefined,
        { timeout: 5000 }
      )
      const state = await page.evaluate(() => window.terminalPresentationFixture.state())
      expect(state.isContinuousOutputPending).toBe(true)
      expect(state.continuousOutputBatches).toBeGreaterThan(0)
      expect(state).toMatchObject({ ready: 'true', opacity: '1' })
      expect(state.firstFrame).toMatchObject({ renderer, hiddenBeforeReady: true })
      if (renderer === 'webgl') {
        expect(state.firstFrame!.colors).toHaveLength(state.dimensions.rows)
        for (const color of state.firstFrame!.colors) expect(color).toEqual([0, 128, 0, 255])
      } else {
        expect(state.firstFrame!.text).toContain('green latest 1')
        expect(state.firstFrame!.text).toContain(`green latest ${state.dimensions.rows}`)
        expect(state.firstFrame!.text).not.toContain('old history')
      }
    } finally {
      await page.evaluate(() => window.terminalPresentationFixture.dispose())
    }
  },
  15_000
)

it.each(['focused', 'visible'] as const)(
  'answers a retained terminal query while %s output stays continuously backlogged',
  async (priority) => {
    await page.goto(windowFixture.presentationUrl)
    try {
      await page.evaluate(() => window.terminalPresentationFixture.mount())
      await restoreAndCheck('green', [0, 128, 0, 255])
      await page.evaluate((value) => {
        window.terminalPresentationFixture.hide()
        window.terminalPresentationFixture.startContinuousOutput(value)
        window.terminalPresentationFixture.writeHidden()
      }, priority)
      await page.waitForFunction(
        () => window.terminalPresentationFixture.state().responses.length > 0,
        undefined,
        { timeout: 5000 }
      )
      const hidden = await page.evaluate(() => window.terminalPresentationFixture.state())
      expect(hidden.retainedPriority).toBe('hidden')
      expect(hidden.isContinuousOutputPending).toBe(true)
      expect(hidden.continuousOutputBatches).toBeGreaterThan(0)
      expect(hidden.responses).toHaveLength(1)
      expect(hidden.responses[0]?.startsWith('\x1b[')).toBe(true)
      expect(hidden.responses[0]?.slice(2)).toMatch(/^\d+;\d+R$/)
      expect(hidden.detachCalls).toBe(0)
      const restored = await page.evaluate(() => window.terminalPresentationFixture.switchHot())
      expect(restored).toMatchObject({ retained: true, sameViewId: true, restoreCalls: 0 })
      for (const color of restored.firstColors!) expect(color).toEqual([0, 0, 192, 255])
      const output = join(process.cwd(), 'test-results/terminal-workload-starvation')
      await mkdir(output, { recursive: true })
      await page.screenshot({ path: join(output, `${priority}-retained-query.png`) })
    } finally {
      await page.evaluate(() => window.terminalPresentationFixture.dispose())
    }
  },
  15_000
)

async function restoreAndCheck(color: 'green' | 'blue' | 'unchanged', expected: number[]) {
  await page.evaluate((value) => window.terminalPresentationFixture.restore(value), color)
  await page.waitForFunction(
    () => window.terminalPresentationFixture.state().firstFrame !== null,
    undefined,
    { timeout: 5000 }
  )
  const { firstFrame, dimensions } = await page.evaluate(() =>
    window.terminalPresentationFixture.state()
  )
  expect(firstFrame).toMatchObject({ renderer: 'webgl', hiddenBeforeReady: true })
  expect(firstFrame!.colors).toHaveLength(dimensions.rows)
  for (const pixel of firstFrame!.colors) expect(pixel).toEqual(expected)
}

const captureIndexedGlyphs = (renderer: string) => captureTerminalGlyphs(page, renderer)

it.each([
  ['webgl', 'light', 'dark'],
  ['dom', 'light', 'dark'],
  ['webgl', 'dark', 'light'],
  ['dom', 'dark', 'light']
] as const)(
  'matches native %s rendering for all 256 foregrounds switching from %s to %s',
  async (renderer, source, target) => {
    const mount = (theme: string) => mountIndexedGlyphs(renderer, theme)
    const capture = () => captureIndexedGlyphs(renderer)
    const sample = async (background = false, custom = false, rgb?: number[]) => {
      await page.evaluate(
        ({ background, custom, rgb }) =>
          window.terminalIndexedFixture.draw(background, custom, rgb),
        { background, custom, rgb }
      )
      return capture()
    }
    await mount(target)
    const native = await sample()
    await mount(source)
    const original = await sample()
    await page.evaluate((theme) => window.terminalIndexedFixture.theme(theme), target)
    await expect.poll(async () => (await capture()).grid).toEqual(native.grid)
    const result = await capture()
    expect(result.defaults.slice(0, 2)).toEqual(native.defaults.slice(0, 2))
    // A transparent DOM layer can round dim (half-opacity) text one sRGB level differently.
    for (const shift of [0, 8, 16]) {
      const observed = (result.defaults[2]! >> shift) & 255
      const expected = (native.defaults[2]! >> shift) & 255
      expect(Math.abs(observed - expected)).toBeLessThanOrEqual(renderer === 'dom' ? 1 : 0)
    }
    const backgrounds = await sample(true)
    expect((await sample(true, false, original.grid)).grid).toEqual(backgrounds.grid)
    expect((await sample(false, false, original.grid)).grid).toEqual(backgrounds.grid)
    expect(backgrounds.grid[0]).toBe(result.control[0])
    expect(backgrounds.grid[1]).toBe(result.control[2])
    // OSC 10 overrides even a default-matching RGB. OSC 110 restores ordinary text.
    const sourceForeground = canonicalTerminalPalettes[source].foreground
      .slice(1)
      .match(/../gu)!
      .join('/')
    await page.evaluate(
      (rgb) => window.terminalIndexedFixture.write('\x1b]10;rgb:' + rgb + '\x07'),
      sourceForeground
    )
    await expect.poll(async () => (await capture()).defaults[0]).toBe(result.control[3])
    await page.evaluate(() => window.terminalIndexedFixture.write('\x1b]110;\x07'))
    await expect.poll(async () => (await capture()).defaults).toEqual(result.defaults)
    const explicit = await sample(false, true)
    expect(explicit.grid[9]).toBe((await sample(true, true)).grid[9])
    expect(explicit.grid.filter((_, i) => i !== 9)).toEqual(native.grid.filter((_, i) => i !== 9))
    expect(explicit.control).toEqual(result.control)
    // Reset the live OSC override without replaying the buffer.
    await page.evaluate(() => window.terminalIndexedFixture.write('\x1b]104;9\x07'))
    await sample()
    await page.evaluate(() => window.terminalIndexedFixture.write('\x1b]4;9;rgb:44/66/88\x07'))
    await expect.poll(async () => (await capture()).grid[9]).toBe(explicit.grid[9])
    await page.evaluate(() => window.terminalIndexedFixture.write('\x1b]104;9\x07'))
    await expect.poll(async () => (await capture()).grid).toEqual(native.grid)
    // Even assigning the original slot's RGB must opt out.
    await page.evaluate(() => window.terminalIndexedFixture.write('\x1b]4;9;rgb:ef/29/29\x07'))
    await expect.poll(async () => (await capture()).grid[9]).toBe(backgrounds.grid[9])
    await page.evaluate(() =>
      window.terminalIndexedFixture.write('\x1b]104;9\x07\x1b[H\x1b[38;5;9m██\x1b[0m')
    )
    await expect.poll(async () => (await capture()).grid[0]).toBe(native.grid[9])
    await page.evaluate(() => window.terminalIndexedFixture.zoom(1.3))
    const expected = native.grid.slice()
    expected[0] = native.grid[9]!
    await expect.poll(async () => (await capture()).grid).toEqual(expected)
    await page.evaluate(() =>
      window.terminalIndexedFixture.write('\x1b[999;1H' + '\r\n\x1b[38;5;4m██\x1b[0m'.repeat(50))
    )
    await expect.poll(async () => (await capture()).grid[0]).toBe(native.grid[4])
    await page.evaluate(() => window.terminalIndexedFixture.readHistory())
    await expect.poll(async () => (await capture()).grid).toEqual(expected)
    await page.evaluate(() => window.terminalIndexedFixture.zoom(1))
    await page.evaluate((theme) => window.terminalIndexedFixture.theme(theme), source)
    expect(await sample()).toEqual(original)
  },
  30000
)

// Real Codex SGR operands, sampled as solid glyphs in the same three-cell grid as the ANSI oracle.
const agentColors = {
  dark: {
    composer: '58;61;64',
    history: '67;70;72',
    ink: [
      '246;226;183',
      '171;223;167',
      '141;147;154',
      '214;222;232',
      '196;167;103',
      '99;168;248',
      '243;139;168'
    ]
  },
  light: {
    composer: '232;234;235',
    history: '237;239;240',
    ink: [
      '150;101;33',
      '59;126;44',
      '106;112;124',
      '55;63;80',
      '139;98;20',
      '28;100;200',
      '210;15;57'
    ]
  }
} as const

function agentSampleLine(theme: keyof typeof agentColors): string {
  const { composer, history, ink } = agentColors[theme]
  return (
    [
      `\x1b[48;2;${composer}m  `,
      `\x1b[2;48;2;${composer}m██`,
      ...ink.map((rgb) => `\x1b[38;2;${rgb}m██`),
      `\x1b[48;2;${history}m  `,
      // These same RGB values in the opposite roles should still use the general filter.
      `\x1b[38;2;${composer}m██`,
      `\x1b[48;2;${ink[0]}m  `
    ].join('\x1b[0m ') + '\x1b[0m'
  )
}

it.each([
  ['webgl', 'dark', 'light'],
  ['dom', 'dark', 'light'],
  ['webgl', 'light', 'dark'],
  ['dom', 'light', 'dark']
] as const)(
  'paints existing and new Agent truecolor with %s from %s to %s',
  async (renderer, source, target) => {
    const pairs = new CodexAgentProviderContribution().descriptor.terminalColorPairs
    const mount = async (theme: keyof typeof agentColors) => {
      await mountIndexedGlyphs(renderer, theme)
      await page.evaluate(
        async ({ pairs, line }) => {
          const f = window.terminalIndexedFixture
          f.setColorPairs(pairs)
          await f.draw()
          // Keep a blank row before the first projected glyph to exercise overlay alignment.
          await f.write('\x1b[2J\x1b[2;1H' + line)
        },
        { pairs, line: agentSampleLine(theme) }
      )
    }
    const sample = async (row = 1) =>
      (await captureIndexedGlyphs(renderer)).grid.slice(row * 32, row * 32 + 12)
    await mount(target)
    const native = await sample()
    expect(new Set(native.slice(0, -2)).size).toBe(10)
    await mount(source)
    const original = await sample()
    await page.evaluate((theme) => window.terminalIndexedFixture.theme(theme), target)
    await expect
      .poll(async () => {
        const pixels = await sample()
        return native.slice(0, -2).flatMap((expected, i) => {
          // A half-opacity DOM glyph or a filtered RGB background may round by one byte.
          const tolerance = i === 9 || (i === 1 && renderer === 'dom') ? 1 : 0
          const observed = pixels[i]!
          const differs = [0, 8, 16].some(
            (shift) =>
              Math.abs(((observed >>> shift) & 255) - ((expected >>> shift) & 255)) > tolerance
          )
          return differs ? [{ cell: i, expected, observed }] : []
        })
      })
      .toEqual([])
    const projected = await sample()
    await page.evaluate(
      (line) => window.terminalIndexedFixture.write('\x1b[3;1H' + line),
      agentSampleLine(source)
    )
    await expect.poll(() => sample(2)).toEqual(projected)
    await page.evaluate(() => window.terminalIndexedFixture.setColorPairs([]))
    await expect.poll(async () => (await sample()).slice(0, -2)).not.toEqual(projected.slice(0, -2))
    expect((await sample()).slice(-2)).toEqual(projected.slice(-2))
    await page.evaluate((p) => window.terminalIndexedFixture.setColorPairs(p), pairs)
    await expect.poll(() => sample()).toEqual(projected)
    await page.evaluate((theme) => window.terminalIndexedFixture.theme(theme), source)
    await expect.poll(() => sample()).toEqual(original)
  },
  30000
)

it.each(['webgl', 'dom'])('uses the effective bold ANSI slot in %s', async (renderer) => {
  await mountIndexedGlyphs(renderer, 'light')
  await checkEffectiveBoldSlots(page, renderer)
})

it('renders OSC assignments identically after a cold view attach and provider checkpoint', async () => {
  const adapter = new HeadlessTerminalModelAdapter()
  const project = {
    projectId: 'p',
    workspaceId: 'w',
    blockId: 'b',
    runId: 'r',
    sessionId: 's',
    generation: 1,
    projectDirectory: '/project',
    workspaceDirectory: '/project',
    gitBranch: null
  }
  const callbacks = { onQueryResponse: () => {}, onFlowControlChange: () => {} }
  try {
    adapter.create({
      identity: project,
      columns: 100,
      rows: 16,
      workingDirectory: '/project',
      terminalSourceTheme: 'light',
      ...callbacks
    })
    const text = '\x1b[?25l██ \x1b[37m██\x1b[0m'
    const paint = '\x1b]4;7;rgb:4b/55/63\x07\x1b]10;#172033\x07' + text
    adapter.acceptOutput(project, paint)
    const render = async (content: string) => {
      await mountIndexedGlyphs('dom', 'light')
      await page.evaluate(async (data) => {
        await window.terminalIndexedFixture.restoreContent(data)
        window.terminalIndexedFixture.theme('dark')
      }, content)
      return (await captureIndexedGlyphs('dom')).grid.slice(0, 2)
    }
    const unset = await render(text)
    const live = await render(paint)
    expect(live[0]).not.toBe(unset[0])
    expect(live[1]).not.toBe(unset[1])
    const view = { identity: project, viewId: 'view', onOutput: () => {} }
    expect(await render((await adapter.attachView(view)).content)).toEqual(live)
    const checkpoint = await adapter.captureCheckpoint(project)
    expect(await render(checkpoint.normalContent)).toEqual(live)
    await adapter.restoreCheckpoint({ checkpoint, ...callbacks, terminalSourceTheme: 'light' })
    expect(await render((await adapter.attachView(view)).content)).toEqual(live)
    adapter.acceptOutput(project, '\x1b]104;7\x07\x1b]110;\x07')
    const reset = (await adapter.attachView(view)).content
    await page.evaluate((data) => window.terminalIndexedFixture.restoreContent(data), reset)
    expect((await captureIndexedGlyphs('dom')).grid.slice(0, 2)).toEqual(unset)
  } finally {
    adapter.disposeAll()
  }
})

it.each(['light', 'dark'] as const)(
  'aligns repeated fullwidth punctuation in the ordinary %s terminal',
  async (source) => {
    await mountIndexedGlyphs('dom', source, 'terminal')
    await checkTerminalPunctuation(page, source)
  }
)
it.each([
  ['dom', 'dark', 'terminal'],
  ['webgl', 'dark', 'terminal'],
  ['dom', 'light', 'agent'],
  ['webgl', 'light', 'agent']
] as const)(
  'keeps IME preedit above existing %s ink on a %s %s',
  async (renderer, source, host) => {
    await mountIndexedGlyphs(renderer, source, host)
    await checkTerminalPreedit(page, renderer, source)
  }
)

describe.each(['webgl', 'dom'])('%s projection frames', (renderer) => {
  beforeEach(() => mountIndexedGlyphs(renderer, 'dark'))
  it('holds complete frames during synchronized theme changes', () =>
    projectionFrameChecks.synchronized(page, renderer))
  it('paints saturated Provider backgrounds', () => projectionFrameChecks.saturated(page, renderer))
  it(
    'budgets the allocated projection bitmap',
    () => projectionFrameChecks.bitmap(page, renderer),
    15000
  )
})
