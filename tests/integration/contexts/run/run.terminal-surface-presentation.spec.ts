import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'

import type {} from '../../../fixtures/terminalSurfacePresentation'

let application: ElectronApplication | undefined
let server: ViteDevServer | undefined
let profile: string | undefined
let page: Page

beforeAll(async () => {
  profile = await mkdtemp(join(tmpdir(), 'cleancode-surface-'))
  server = await createServer({
    configFile: false,
    server: { host: '127.0.0.1', port: 0, watch: null, hmr: false }
  })
  await server.listen()
  application = await electron.launch({
    args: [
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
  await page.goto(`${server.resolvedUrls!.local[0]}tests/fixtures/terminalSurfacePresentation.html`)
  await page.waitForFunction(() => Boolean(window.terminalPresentationFixture))
}, 30_000)

afterAll(async () => {
  try {
    await application?.close()
  } finally {
    await server?.close()
    if (profile) await rm(profile, { recursive: true, force: true })
  }
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
  await page.goto(
    `${server!.resolvedUrls!.local[0]}tests/fixtures/terminalSurfacePresentation.html?renderer=dom`
  )
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
  await page.goto(
    `${server!.resolvedUrls!.local[0]}tests/fixtures/terminalSurfacePresentation.html`
  )
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
    await page.goto(
      `${server!.resolvedUrls!.local[0]}tests/fixtures/terminalSurfacePresentation.html?renderer=${renderer}`
    )
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
    await page.goto(
      `${server!.resolvedUrls!.local[0]}tests/fixtures/terminalSurfacePresentation.html`
    )
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
