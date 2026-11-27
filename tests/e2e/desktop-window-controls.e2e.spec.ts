// @vitest-environment node
import { execFile } from 'node:child_process'
import { release } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { ElectronApplication, Locator, Page } from 'playwright'
import { supportsSnapLayouts } from '../../src/platform/ipc/desktopWindowControls'
import { pollUntilState } from '../support/e2ePolling'
import {
  createE2eWorkbench,
  launchApp,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  teardownE2eScenario,
  type E2eScenarioResources
} from '../support/e2eWorkbench'

describe.skipIf(process.platform === 'darwin')('custom desktop window controls', () => {
  let app: ElectronApplication
  let page: Page
  let resources: E2eScenarioResources
  beforeEach(async () => {
    resources = {}
    const workbench = await createE2eWorkbench('cleancode-caption-e2e')
    resources.workbench = workbench
    app = await launchApp(workbench)
    resources.electronApp = app
    page = await app.firstWindow()
    resources.page = page
    await page.getByRole('button', { name: '最大化窗口' }).waitFor()
  }, electronLaunchTimeoutMs)
  afterEach(async ({ task }) => {
    await teardownE2eScenario({
      resources,
      taskFailed: task.result?.state === 'fail',
      taskName: task.name
    })
  })

  it(
    'shows the glyphs on hover and keeps window controls above settings',
    async () => {
      const controls = page.getByRole('group', { name: '窗口控制' })
      const close = controls.getByRole('button', { name: '关闭窗口' })
      const icon = close.locator('svg')
      await page.mouse.move(240, 140)
      expect(await icon.evaluate((el) => getComputedStyle(el).opacity)).toBe('0')
      await close.hover()
      expect(await icon.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
      await page
        .locator('.app-shell__titlebar-navigation')
        .screenshot({ path: 'test-results/window-controls/' + process.platform + '-hover.png' })
      await page.getByRole('button', { name: '设置', exact: true }).click()
      await page.locator('.application-settings-back').waitFor()
      expect(
        await close.evaluate((el) => {
          const rect = el.getBoundingClientRect()
          return el.contains(
            document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
          )
        })
      ).toBe(true)
    },
    electronScenarioTimeoutMs
  )

  it.skipIf(!supportsSnapLayouts(process.platform, release()))(
    'identifies only the green button as the native maximize button and handles release inside or outside',
    async () => {
      const controls = page.getByRole('group', { name: '窗口控制' })
      const green = controls.locator('.desktop-caption-maximize')
      const handle = await app.evaluate(({ BrowserWindow, screen }) => {
        const target = BrowserWindow.getAllWindows()[0]!
        // WM_NCHITTEST carries signed 16-bit screen coordinates. Keep the
        // background window offscreen but within that range for the Win32 probe.
        const right = Math.max(
          ...screen.getAllDisplays().map(({ bounds }) => bounds.x + bounds.width)
        )
        target.setPosition(right + 100, 100, false)
        return target.getNativeWindowHandle().readBigUInt64LE().toString()
      })
      const probe = async (button: Locator, action = 'Probe') => {
        const [x, y] = await button.evaluate((el) => {
          const bounds = el.getBoundingClientRect()
          return [
            Math.round((bounds.x + bounds.width / 2) * devicePixelRatio),
            Math.round((bounds.y + bounds.height / 2) * devicePixelRatio)
          ]
        })
        const { stdout } = await promisify(execFile)(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            join(process.cwd(), 'tests/fixtures/platform/windowsSnapHitTest.ps1'),
            handle,
            String(x),
            String(y),
            action
          ],
          { windowsHide: true }
        )
        return JSON.parse(stdout) as { hit: number; children: number[] }
      }
      await page.evaluate(() => {
        window.cleancode?.desktopWindowControls?.snap?.onPointerChange((state) => {
          document.body.dataset.snapPointerEvents =
            (document.body.dataset.snapPointerEvents ?? '') + state + ' '
        })
      })
      const result = await probe(green, 'Hover')
      expect(result.hit).toBe(9) // HTMAXBUTTON
      expect(result.children.every((hit) => hit === -1)).toBe(true) // HTTRANSPARENT to the parent
      await page.waitForFunction(() => document.body.dataset.snapPointerEvents?.includes('hover '))
      await probe(green, 'Leave')
      await page.waitForFunction(() => document.body.dataset.snapPointerEvents?.includes('idle '))
      expect((await probe(controls.getByRole('button', { name: '最小化窗口' }))).hit).not.toBe(9)
      await probe(green, 'Cancel')
      await page.waitForFunction(() =>
        document.body.dataset.snapPointerEvents?.includes('pressed ')
      )
      expect(
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isMaximized())
      ).toBe(false)
      await probe(green, 'Click')
      await controls.getByRole('button', { name: '还原窗口' }).waitFor()
      await green.press('Enter')
      await pollUntilState({
        description: 'native window restored by keyboard',
        observe: () =>
          app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isMaximized()),
        accept: (maximized) => !maximized,
        timeoutMs: 5_000
      })
    },
    electronScenarioTimeoutMs
  )
})
