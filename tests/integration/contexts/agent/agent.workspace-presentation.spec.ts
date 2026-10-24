import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import type {} from '../../../fixtures/agentWorkspacePresentation'

let application: ElectronApplication | undefined
let server: ViteDevServer | undefined
let profile: string | undefined
let page: Page

beforeAll(async () => {
  profile = await mkdtemp(join(tmpdir(), 'cleancode-agent-workspace-'))
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
}, 30_000)

afterAll(async () => {
  try {
    await application?.close()
  } finally {
    await server?.close()
    if (profile) await rm(profile, { recursive: true, force: true })
  }
})

it.each(['webgl', 'dom'])(
  'keeps all six Agent consoles painted through repeated workspace returns with %s',
  async (renderer) => {
    await page.goto(
      `${server!.resolvedUrls!.local[0]}tests/fixtures/agentWorkspacePresentation.html?${renderer}`
    )
    await waitForReady()
    await page.evaluate(() => window.agentWorkspacePresentation.remember())
    await page.evaluate(() => window.agentWorkspacePresentation.select('second'))
    await waitForReady()
    await page.evaluate(() => window.agentWorkspacePresentation.remember())
    const baseline = await page.evaluate(() => window.agentWorkspacePresentation.state().counts)
    const results = []
    for (const workspace of ['first', 'second', 'first', 'second', 'first', 'second'] as const) {
      const result = await page.evaluate(
        (target) => window.agentWorkspacePresentation.switchTo(target),
        workspace
      )
      results.push(result)
      expect(result.counts).toEqual(baseline)
      expect(result.firstFrameMs).toBeGreaterThanOrEqual(0)
      expect(result.firstFrameMs).toBeLessThan(1000)
      for (const frame of result.frames) {
        expect(frame).toHaveLength(6)
        for (const terminal of frame) {
          expect(terminal).toMatchObject({ ready: true, reused: true })
          expect(terminal.key.startsWith(workspace)).toBe(true)
          if (renderer === 'webgl') {
            expect(terminal.colors.length).toBeGreaterThan(0)
            for (const color of terminal.colors)
              expect(color).toEqual(workspace === 'first' ? [0, 128, 0, 255] : [0, 0, 192, 255])
          } else expect(terminal.text).toContain(`${terminal.key} latest 1`)
        }
      }
    }
    const output = join(process.cwd(), 'test-results/agent-workspace-presentation')
    await mkdir(output, { recursive: true })
    await writeFile(
      join(output, `${renderer}.json`),
      JSON.stringify({ baseline, results }, null, 2)
    )
    await page.screenshot({ path: join(output, `${renderer}.png`) })
    await page.evaluate(() => window.agentWorkspacePresentation.dispose())
  },
  30_000
)

async function waitForReady() {
  await page.waitForFunction(() => {
    const frames = window.agentWorkspacePresentation?.state().frames
    return frames?.length === 6 && frames.every((frame) => frame.ready)
  })
}
