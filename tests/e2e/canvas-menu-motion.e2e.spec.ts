// @vitest-environment node

import type { ElectronApplication, Locator, Page } from 'playwright'

import {
  createE2eWorkbench,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  launchApp,
  teardownE2eScenario,
  type E2eScenarioResources,
  type E2eWorkbench
} from '../support/e2eWorkbench'
import { pollUntilState } from '../support/e2ePolling'

describe('canvas menu motion e2e', () => {
  let workbench: E2eWorkbench
  let electronApp: ElectronApplication
  let page: Page
  let resources: E2eScenarioResources

  beforeEach(async () => {
    resources = {}
    workbench = await createE2eWorkbench('cleancode-canvas-menu-motion-e2e')
    resources.workbench = workbench
    electronApp = await launchApp(workbench)
    resources.electronApp = electronApp
    page = await electronApp.firstWindow()
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

  it(
    'retargets a closing canvas menu from its live presentation without duplicating it',
    async () => {
      await expectDesktopRuntime(page)
      await page.getByRole('button', { name: '添加项目' }).click()
      await pollUntilState({
        description: 'canvas actions to become available',
        observe: () => page.getByRole('button', { name: '新建 Agent' }).isEnabled(),
        accept: Boolean,
        timeoutMs: 10_000
      })

      const focusReturnTarget = page.getByRole('button', { name: '新建 Agent' })
      const pane = page.locator('.react-flow__pane')
      await pane.waitFor({ state: 'visible' })
      await focusReturnTarget.focus()

      const point = await pane.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        const xRatios = [0.54, 0.7, 0.38, 0.86, 0.22]
        const yRatios = [0.18, 0.32, 0.48, 0.64, 0.8]
        for (const yRatio of yRatios) {
          for (const xRatio of xRatios) {
            const point = {
              x: bounds.left + bounds.width * xRatio,
              y: bounds.top + bounds.height * yRatio
            }
            if (document.elementFromPoint(point.x, point.y) === element) return point
          }
        }
        throw new Error('No visible blank React Flow pane point is available.')
      })
      await page.mouse.click(point.x, point.y, { button: 'right' })

      const menu = page.locator('[role="menu"][aria-label="画布操作"]')
      await menu.waitFor({ state: 'attached' })
      await page
        .locator('[role="menu"][aria-label="画布操作"][data-interactive="true"]')
        .waitFor({ state: 'attached' })
      await menu.evaluate((element) => {
        element.setAttribute('data-e2e-presence-token', 'retained-surface')
      })

      await page.keyboard.press('Escape')
      const focusResult = await page.evaluate(() => {
        const activeElement = document.activeElement
        return {
          ariaLabel: activeElement?.getAttribute('aria-label'),
          className: activeElement?.getAttribute('class'),
          insideMenu: Boolean(activeElement?.closest('[role="menu"]')),
          tagName: activeElement?.tagName
        }
      })
      expect(focusResult.insideMenu).toBe(false)
      expect(
        focusResult.ariaLabel === '新建 Agent' ||
          focusResult.className?.split(' ').includes('react-flow__pane') ||
          focusResult.className?.split(' ').includes('canvas-surface')
      ).toBe(true)

      const closePhase = await menu.getAttribute('data-motion-state')
      await page.mouse.click(point.x, point.y, { button: 'right' })

      expect(closePhase).toBe('closing')
      await menu.waitFor({ state: 'attached' })
      expect(await menu.getAttribute('data-e2e-presence-token')).toBe('retained-surface')
      expect(await page.locator('[role="menu"][data-interactive="true"]').count()).toBe(1)
      await menu.waitFor({ state: 'attached' })
      await menu.evaluate(async (element) => {
        await new Promise<void>((resolve, reject) => {
          const deadline = performance.now() + 2_000
          const observe = (): void => {
            if ((element as HTMLElement).dataset.motionState === 'open') {
              resolve()
              return
            }
            if (performance.now() >= deadline) {
              reject(new Error('Retargeted canvas menu did not settle open.'))
              return
            }
            requestAnimationFrame(observe)
          }
          observe()
        })
      })

      const backdropProgress = await page
        .getByTestId('canvas-menu-backdrop')
        .evaluate((element) =>
          Number((element as HTMLElement).style.getPropertyValue('--canvas-menu-backdrop-progress'))
        )
      expect(backdropProgress).toBe(1)

      await page.keyboard.press('Escape')
      await menu.waitFor({ state: 'detached' })
      expect(await page.locator('[role="menu"][data-interactive="true"]').count()).toBe(0)
    },
    electronScenarioTimeoutMs
  )

  it(
    'toggles on repeated secondary click and consumes primary dismissal before canvas pan',
    async () => {
      await expectDesktopRuntime(page)
      await page.getByRole('button', { name: '添加项目' }).click()
      await pollUntilState({
        description: 'canvas actions to become available',
        observe: () => page.getByRole('button', { name: '新建 Agent' }).isEnabled(),
        accept: Boolean,
        timeoutMs: 10_000
      })

      const pane = page.locator('.react-flow__pane')
      const viewport = page.locator('.react-flow__viewport')
      await pane.waitFor({ state: 'visible' })
      const point = await findVisibleBlankCanvasPoint(pane)
      const menu = page.locator('[role="menu"][aria-label="画布操作"]')
      const interactiveMenu = page.locator(
        '[role="menu"][aria-label="画布操作"][data-interactive="true"]'
      )

      await page.mouse.click(point.x, point.y, { button: 'right' })
      await page.mouse.click(point.x, point.y, { button: 'right' })
      await menu.waitFor({ state: 'detached' })

      await page.mouse.click(point.x, point.y, { button: 'right' })
      await interactiveMenu.waitFor({ state: 'attached' })
      const viewportBeforeDismiss = await viewport.getAttribute('style')

      await page.mouse.move(point.x, point.y)
      await page.mouse.down({ button: 'left' })
      await page.mouse.move(point.x + 48, point.y + 32, { steps: 4 })
      await page.mouse.up({ button: 'left' })
      await menu.waitFor({ state: 'detached' })

      expect(await viewport.getAttribute('style')).toBe(viewportBeforeDismiss)
    },
    electronScenarioTimeoutMs
  )
})

async function findVisibleBlankCanvasPoint(
  pane: Locator
): Promise<{ readonly x: number; readonly y: number }> {
  return pane.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const xRatios = [0.54, 0.7, 0.38, 0.86, 0.22]
    const yRatios = [0.18, 0.32, 0.48, 0.64, 0.8]
    for (const yRatio of yRatios) {
      for (const xRatio of xRatios) {
        const point = {
          x: bounds.left + bounds.width * xRatio,
          y: bounds.top + bounds.height * yRatio
        }
        if (document.elementFromPoint(point.x, point.y) === element) return point
      }
    }
    throw new Error('No visible blank React Flow pane point is available.')
  })
}
