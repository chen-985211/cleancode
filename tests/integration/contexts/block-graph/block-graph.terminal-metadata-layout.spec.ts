import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  _electron as electron,
  type ElectronApplication,
  type Locator,
  type Page
} from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import type {} from '../../../fixtures/presentation/terminalMetadataLayout'
import { pollUntilState } from '../../../support/e2ePolling'

let application: ElectronApplication | undefined
let server: ViteDevServer | undefined
let profile: string | undefined
let page: Page
let electronVersion: string
const rendererErrors: string[] = []
const output = join(process.cwd(), 'test-results', 'terminal-metadata-layout')

beforeAll(async () => {
  profile = await mkdtemp(join(tmpdir(), 'cleancode-terminal-metadata-'))
  await mkdir(output, { recursive: true })
  server = await createServer({
    configFile: false,
    server: { host: '127.0.0.1', port: 0, watch: null, hmr: false }
  })
  await server.listen()
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined &&
        !['ELECTRON_RUN_AS_NODE', 'CLEANCODE_RASTER_WINDOW_MODE'].includes(entry[0])
    )
  )
  application = await electron.launch({
    args: [
      join(process.cwd(), 'tests/fixtures/terminalRasterBrowser.mjs'),
      `--user-data-dir=${profile}`
    ],
    env: environment
  })
  page = await application.firstWindow()
  page.setDefaultTimeout(5_000)
  page.on('pageerror', (error) => rendererErrors.push(error.message))
  electronVersion = await application.evaluate(() => process.versions.electron)
  const windowState = await application.evaluate(async ({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows()[0]!
    if (!window.isVisible()) {
      await new Promise<void>((resolve) => window.once('show', resolve))
    }
    return {
      visible: window.isVisible(),
      focused: window.isFocused(),
      outside:
        window.getBounds().x >=
        Math.max(...screen.getAllDisplays().map(({ bounds }) => bounds.x + bounds.width))
    }
  })
  expect(windowState).toEqual({ visible: true, focused: false, outside: true })
}, 30_000)

beforeEach(() => {
  rendererErrors.length = 0
})

afterEach(async ({ task }) => {
  const name = task.name.replace(/[^a-z0-9-]/gi, '-')
  try {
    if (task.result?.state === 'fail' && page) {
      await page.screenshot({ path: join(output, `${name}-failure.png`), timeout: 5_000 })
    }
  } finally {
    await writeFile(
      join(output, `${name}.json`),
      JSON.stringify(
        {
          electronVersion,
          scenario: task.name,
          result: task.result?.state,
          rendererErrors,
          scope:
            'Isolated production TerminalNode and ReactFlow; not a PTY or workspace lifecycle test.'
        },
        null,
        2
      )
    )
  }
})

afterAll(async () => {
  try {
    await application?.close()
  } finally {
    await server?.close()
    if (profile) await rm(profile, { recursive: true, force: true })
  }
})

it.each([
  { theme: 'light', reducedMotion: false },
  { theme: 'dark', reducedMotion: false },
  { theme: 'light', reducedMotion: true },
  { theme: 'dark', reducedMotion: true }
])(
  'keeps the bottom-edge editor usable in $theme with reduced motion $reducedMotion',
  async ({ theme, reducedMotion }) => {
    await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' })
    await page.goto(
      `${server!.resolvedUrls!.local[0]}tests/fixtures/presentation/terminalMetadataLayout.html?theme=${theme}`
    )
    expect(await page.locator('[data-workbench-canvas-obstruction]').count()).toBeGreaterThan(0)
    const terminal = page.locator('[data-terminal-block-id="terminal-1"]')
    await terminal.waitFor()
    const viewportBefore = await page.locator('.react-flow__viewport').getAttribute('style')
    const motion = await terminal.evaluateHandle((node) => {
      const bounds = node.getBoundingClientRect()
      let entered = false
      let exited = false
      let fieldsMoved = false
      let terminalSizeStable = true
      let frame = 0
      const sample = () => {
        const current = node.getBoundingClientRect()
        terminalSizeStable &&=
          Math.abs(current.width - bounds.width) < 1 && Math.abs(current.height - bounds.height) < 1
        const surface = node.querySelector('.terminal-metadata-surface')
        if (surface) {
          const opacity = Number(getComputedStyle(surface).opacity)
          entered ||= opacity > 0 && opacity < 1
          exited ||= surface.getAttribute('data-surface-motion-state') === 'closing'
        }
        for (const fields of node.querySelectorAll('[data-terminal-fields-motion]')) {
          const opacity = Number(getComputedStyle(fields).opacity)
          fieldsMoved ||= opacity > 0 && opacity < 1 && fields.getBoundingClientRect().height > 0
        }
        frame = requestAnimationFrame(sample)
      }
      frame = requestAnimationFrame(sample)
      return {
        stop: () => {
          cancelAnimationFrame(frame)
          return { entered, exited, fieldsMoved, terminalSizeStable }
        }
      }
    })
    try {
      const editButton = terminal.getByRole('button', { name: 'Terminal 1 编辑终端信息' })
      await editButton.click()
      await terminal.getByRole('textbox', { name: '启动命令' }).fill('unsaved command')
      await expectExpandedMetadataForm(terminal)
      await page.screenshot({
        path: join(output, `${theme}-${reducedMotion}-terminal-edit-short-command.png`)
      })
      await terminal.getByRole('button', { name: 'Terminal 1 取消编辑' }).click()
      expect(await editButton.getAttribute('aria-expanded')).toBe('false')
      expect(await terminal.getByRole('form').count()).toBe(0)
      await editButton.click()
      expect(await terminal.getByRole('textbox', { name: '启动命令' }).inputValue()).toBe('')
      await terminal.getByRole('textbox', { name: '启动命令' }).fill('node service-fixture.mjs')
      async function chooseConfiguration(label: string, value: string): Promise<void> {
        await terminal.getByRole('button', { name: label, exact: true }).click()
        await page
          .getByRole('menu', { name: label, exact: true })
          .locator(`[data-choice-value="${value}"]`)
          .click()
      }
      await expectExpandedMetadataForm(terminal)
      await page.screenshot({
        path: join(output, `${theme}-${reducedMotion}-terminal-edit-task.png`)
      })
      await terminal.getByRole('radio', { name: '服务', exact: true }).check()
      await terminal.getByLabel('服务就绪方式').waitFor()
      await chooseConfiguration('服务就绪方式', 'tcp')
      await chooseConfiguration('端口策略', 'fixed')
      await terminal.getByRole('textbox', { name: '服务端口' }).waitFor()
      await chooseConfiguration('访问协议', 'http')
      await terminal.getByRole('textbox', { name: '服务端口' }).fill('5173')
      await chooseConfiguration('端口注入方式', 'environment')
      const environmentVariable = terminal.getByRole('textbox', { name: '环境变量名称' })
      await environmentVariable.waitFor()
      await environmentVariable.fill('PORT')
      await expectExpandedMetadataForm(terminal)
      await pollUntilState({
        description: 'all terminal configuration menus to finish closing',
        observe: () => page.locator('.choice-select-menu').count(),
        accept: (count) => count === 0,
        timeoutMs: 5_000
      })
      await page.screenshot({
        path: join(output, `${theme}-${reducedMotion}-terminal-edit-service.png`)
      })
      await terminal.getByRole('button', { name: '保存终端信息', exact: true }).click()
      await terminal.locator('.terminal-metadata-surface').waitFor({ state: 'detached' })
      expect(await motion.evaluate((recorder) => recorder.stop())).toEqual({
        entered: !reducedMotion,
        exited: !reducedMotion,
        fieldsMoved: !reducedMotion,
        terminalSizeStable: true
      })
      expect(await page.locator('.react-flow__viewport').getAttribute('style')).toBe(viewportBefore)
    } finally {
      await motion.evaluate((recorder) => recorder.stop())
      await motion.dispose()
    }

    await page.getByRole('button', { name: 'Terminal 1 编辑终端信息' }).click()
    await expectExpandedMetadataForm(terminal)
    expect(await terminal.getByRole('textbox', { name: '启动命令' }).inputValue()).toBe(
      'node service-fixture.mjs'
    )
    expect(await terminal.getByRole('textbox', { name: '服务端口' }).inputValue()).toBe('5173')
    await page.keyboard.press('Escape')
    await terminal.getByRole('form').waitFor({ state: 'detached' })
    expect(rendererErrors).toEqual([])
  },
  30_000
)

async function expectExpandedMetadataForm(terminal: Locator): Promise<void> {
  await pollUntilState({
    description: 'terminal metadata surface and field motion to settle',
    observe: () =>
      terminal.evaluate(
        (node) =>
          node
            .querySelector('.terminal-metadata-surface')
            ?.getAttribute('data-surface-motion-state') === 'open' &&
          [...node.querySelectorAll('[data-terminal-fields-motion]')].every(
            (fields) => fields.getAttribute('data-terminal-fields-motion') === 'open'
          )
      ),
    accept: Boolean,
    timeoutMs: 5_000
  })
  const layout = await terminal.evaluate((node) => {
    const form = node.querySelector('.terminal-metadata-form')
    const body = node.querySelector('.terminal-metadata-form__body')
    if (!(form instanceof HTMLElement) || !(body instanceof HTMLElement)) return null
    const bounds = form.getBoundingClientRect()
    const canvas = node.closest('.react-flow')!.getBoundingClientRect()
    const trigger = node.querySelector('.terminal-node__action--edit')!.getBoundingClientRect()
    const intersects = (other: DOMRect) =>
      bounds.left < other.right &&
      bounds.right > other.left &&
      bounds.top < other.bottom &&
      bounds.bottom > other.top
    const parameters = form.querySelectorAll('.terminal-execution-config__grid > label')
    const firstParameter = parameters[0]?.getBoundingClientRect()
    const secondParameter = parameters[1]?.getBoundingClientRect()
    return {
      hasInternalScroll: body.scrollHeight > body.clientHeight,
      insideCanvas:
        bounds.left >= canvas.left &&
        bounds.top >= canvas.top &&
        bounds.right <= canvas.right &&
        bounds.bottom <= canvas.bottom,
      toggleUncovered: !intersects(trigger),
      avoidsCanvasChrome: [
        ...document.querySelectorAll('[data-workbench-canvas-obstruction]')
      ].every((element) => !intersects(element.getBoundingClientRect())),
      parametersShareRow: Boolean(
        firstParameter &&
        secondParameter &&
        Math.abs(firstParameter.top - secondParameter.top) < 1 &&
        firstParameter.right < secondParameter.left
      ),
      actionsInsideForm: [
        '.terminal-metadata-form__header',
        '.terminal-metadata-form__footer'
      ].every((selector) => {
        const element = form.querySelector(selector)
        if (!element) return false
        const rect = element.getBoundingClientRect()
        return rect.top >= bounds.top && rect.bottom <= bounds.bottom
      })
    }
  })
  expect(layout).toEqual({
    hasInternalScroll: false,
    insideCanvas: true,
    toggleUncovered: true,
    avoidsCanvasChrome: true,
    parametersShareRow: true,
    actionsInsideForm: true
  })
}
