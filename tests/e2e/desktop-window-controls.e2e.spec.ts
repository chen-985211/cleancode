// @vitest-environment node
import { execFile } from 'node:child_process'
import { open } from 'node:fs/promises'
import { release } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { ElectronApplication, Locator, Page } from 'playwright'
import { supportsSnapLayouts } from '../../src/platform/ipc/desktopWindowControls'
import { setElectronContentSize } from '../support/e2eWindow'
import { pollUntilState } from '../support/e2ePolling'
import {
  assertElectronRunsInBackground,
  createE2eWorkbench,
  launchApp,
  selectBlankCanvasAction,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  teardownE2eScenario,
  type E2eScenarioResources
} from '../support/e2eWorkbench'

const visibleMode = process.env.CLEANCODE_E2E_VISIBLE === '1'
const supportsNativeSnap = supportsSnapLayouts(process.platform, release())

describe('desktop window controls and snap layout', () => {
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
    await page.waitForLoadState('domcontentloaded')
  }, electronLaunchTimeoutMs)
  afterEach(async ({ task }) => {
    await teardownE2eScenario({
      resources,
      taskFailed: task.result?.state === 'fail',
      taskName: task.name
    })
  })

  it.skipIf(process.platform === 'darwin')(
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

  it(
    'keeps bound workspace shortcuts reachable at the desktop minimum size',
    async () => {
      await page.getByRole('button', { name: '添加项目' }).click()
      await selectBlankCanvasAction(page, '新建终端')
      const add = page.getByRole('button', { name: '添加画布对象' })
      await add.click()
      await page
        .getByRole('dialog', { name: '选择要绑定的画布对象' })
        .getByRole('button')
        .filter({ hasText: 'Terminal 1' })
        .click()
      const slot = page.locator('[data-quick-execution-slot="1"] button')
      await slot.waitFor()

      await resizeToDesktopMinimum(app, page)
      for (const control of [
        page.locator('.workspace-external-open-control button').first(),
        slot,
        add
      ]) {
        await expectControlInsideWindow(control)
      }

      // Restore a full Dock with long unavailable labels, as after a bound terminal is removed.
      await page.evaluate(async () => {
        const api = window.cleancode!
        const [entry] = await api.listWorkbenches()
        const scope = {
          projectDirectory: entry!.project.directory,
          workspaceId: entry!.graph.workspaceId
        }
        const graph = await api.createTerminalBlock({
          ...scope,
          name: 'Temporary',
          description: '',
          position: { x: 0, y: 0 }
        })
        const blockId = graph.blocks.find((block) => block.name === 'Temporary')!.id
        for (const number of [2, 3, 4, 5] as const) {
          await api.bindQuickExecutionSlot({
            ...scope,
            number,
            target: { type: 'terminal', terminalBlockId: blockId }
          })
        }
        await api.deleteBlock({ ...scope, blockId })
      })
      await page.reload()
      const slots = page.locator('[data-quick-execution-slots="dock"]')
      await slots.locator('[data-quick-execution-slot="5"] button').waitFor()
      await page.locator('[data-quick-execution-bar][data-surface-motion-state="open"]').waitFor()
      const controls = await slots.getByRole('button').all()
      expect(controls).toHaveLength(5)
      for (const control of controls) await expectControlInsideWindow(control)
      await page.screenshot({
        path: 'test-results/window-controls/' + process.platform + '-minimum-workspace.png'
      })
      const manage = page.getByRole('button', { name: '整理快捷位', exact: true, expanded: false })
      await manage.click()
      await page
        .getByRole('dialog', { name: '选择要绑定的画布对象' })
        .getByRole('button', { name: '整理快捷位', exact: true })
        .click()
      await page
        .getByRole('dialog', { name: '整理快捷位', exact: true })
        .getByRole('button', { name: '完成整理', exact: true })
        .click()
      await manage.waitFor()
    },
    electronScenarioTimeoutMs
  )

  it(
    'keeps settings navigable at the desktop minimum size',
    async () => {
      await resizeToDesktopMinimum(app, page)
      await page.getByRole('button', { name: '设置', exact: true }).click()
      const settings = page.locator('.application-settings-surface')
      const navigation = settings.getByRole('navigation')
      const content = settings.locator('.application-settings-content')
      await navigation.waitFor()
      expect(
        await content.evaluate((el) => {
          const rect = el.getBoundingClientRect()
          return rect.height > 80 && rect.bottom <= innerHeight + 1
        })
      ).toBe(true)
      await navigation.getByRole('button').last().click()
      await content
        .locator('[data-application-settings-pane-direction="none"] .about-settings-pane')
        .waitFor()
      await content.getByRole('heading', { name: 'CleanCode' }).scrollIntoViewIfNeeded()
      await page.screenshot({
        path: 'test-results/window-controls/' + process.platform + '-minimum-settings.png'
      })
    },
    electronScenarioTimeoutMs
  )

  it.skipIf(!supportsNativeSnap)(
    'identifies only the green button as the native maximize button and cancels an outside release',
    async () => {
      const controls = page.getByRole('group', { name: '窗口控制' })
      const green = controls.locator('.desktop-caption-maximize')
      await green.waitFor()
      const probe = await createSnapProbe(app)
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
      if (!visibleMode) await assertElectronRunsInBackground(app)
      if (!process.env.CLEANCODE_E2E_EXECUTABLE_PATH) {
        // A running development instance must leave the build output writable on Windows.
        const output = await open(join(process.cwd(), 'out/main/windows-snap-layout.node'), 'r+')
        await output.close()
      }
    },
    electronScenarioTimeoutMs
  )

  it.skipIf(!supportsNativeSnap || !visibleMode)(
    'maximizes and restores a visible window with the native caption button',
    async () => {
      const controls = page.getByRole('group', { name: '窗口控制' })
      const green = controls.locator('.desktop-caption-maximize')
      await green.waitFor()
      const probe = await createSnapProbe(app)
      expect((await probe(green, 'Click')).hit).toBe(9)
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

async function resizeToDesktopMinimum(app: ElectronApplication, page: Page): Promise<void> {
  const minimum = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.getMinimumSize()
  )
  expect(minimum).toEqual([960, 640])
  await setElectronContentSize(app, { width: 960, height: 640 })
  await page.waitForFunction(() => innerWidth <= 976 && innerHeight <= 656)
}

async function expectControlInsideWindow(control: Locator): Promise<void> {
  expect(
    await control.evaluate((el) => {
      const rect = el.getBoundingClientRect()
      return (
        rect.left >= 0 &&
        rect.right <= innerWidth &&
        el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
      )
    })
  ).toBe(true)
}

async function createSnapProbe(app: ElectronApplication) {
  const handle = await app.evaluate(({ BrowserWindow, screen }, offscreen) => {
    const target = BrowserWindow.getAllWindows()[0]!
    if (offscreen) {
      // WM_NCHITTEST carries signed 16-bit screen coordinates. Keep the
      // background window offscreen but within that range for the Win32 probe.
      const right = Math.max(
        ...screen.getAllDisplays().map(({ bounds }) => bounds.x + bounds.width)
      )
      target.setPosition(right + 100, 100, false)
    }
    return target.getNativeWindowHandle().readBigUInt64LE().toString()
  }, !visibleMode)
  return async (
    button: Locator,
    action: 'Probe' | 'Hover' | 'Leave' | 'Cancel' | 'Click' = 'Probe'
  ) => {
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
}
