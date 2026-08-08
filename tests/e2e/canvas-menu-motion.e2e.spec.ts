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

const maximumMenuAnchorAxisDriftPixels = 8.5

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
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.reload({ waitUntil: 'domcontentloaded' })
    expect(
      await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    ).toBe(false)
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
      expect(await menu.getAttribute('data-interactive')).toBe('false')
      expect(await menu.getAttribute('aria-hidden')).toBe('true')
      expect(await menu.getAttribute('inert')).not.toBeNull()
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

      await page.mouse.click(point.x, point.y, { button: 'right' })

      await menu.waitFor({ state: 'attached' })
      expect(await menu.getAttribute('data-e2e-presence-token')).toBe('retained-surface')
      expect(await page.locator('[role="menu"][data-interactive="true"]').count()).toBe(1)
      await waitForSettledMenuPresentation(menu, 'retargeted canvas menu to settle open')
      await menu.getByRole('menuitem').first().click({ trial: true })

      const dismissLayerPresentation = await page
        .getByTestId('canvas-menu-dismiss-layer')
        .evaluate((element) => {
          const styles = getComputedStyle(element)
          return {
            backgroundColor: styles.backgroundColor,
            opacity: styles.opacity,
            pointerEvents: styles.pointerEvents
          }
        })
      expect(dismissLayerPresentation).toEqual({
        backgroundColor: 'rgba(0, 0, 0, 0)',
        opacity: '1',
        pointerEvents: 'auto'
      })

      await page.keyboard.press('Escape')
      expect(await menu.getAttribute('data-interactive')).toBe('false')
      expect(await menu.getAttribute('aria-hidden')).toBe('true')
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

  it(
    'renders from its pointer anchor, becomes actionable, and retracts along the same path',
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
      await pane.waitFor({ state: 'visible' })
      const point = await findVisibleBlankCanvasPoint(pane)
      const menu = page.locator('[role="menu"][aria-label="画布操作"]')

      await page.mouse.click(point.x, point.y, { button: 'right' })
      await menu.waitFor({ state: 'attached' })
      const openingPresentation = await waitForCompactMenuPresentation(
        menu,
        'canvas menu to render a compact opening presentation'
      )
      const openPresentation = await waitForSettledMenuPresentation(
        menu,
        'canvas menu to settle open'
      )
      const firstAction = menu.getByRole('menuitem').first()
      await firstAction.waitFor({ state: 'visible' })

      expect(openingPresentation.transform).not.toBe('none')
      expect(openingPresentation.scale).toBeLessThan(0.98)
      expect(openingPresentation.rect.width).toBeLessThan(openPresentation.rect.width)
      expect(openingPresentation.rect.height).toBeLessThan(openPresentation.rect.height)
      expectPointsWithinAxisTolerance(openingPresentation.anchor, point)
      expectPointsWithinAxisTolerance(openPresentation.anchor, point)
      expect(openPresentation.scale).toBe(1)
      expect(openPresentation.opacity).toBe(1)
      expect(await firstAction.isEnabled()).toBe(true)
      await firstAction.click({ trial: true })

      await page.mouse.click(point.x, point.y, { button: 'right' })
      expect(await menu.getAttribute('data-interactive')).toBe('false')
      expect(await menu.getAttribute('aria-hidden')).toBe('true')
      expect(await menu.getAttribute('inert')).not.toBeNull()

      const closingPresentation = await waitForCompactMenuPresentation(
        menu,
        'canvas menu to render a compact closing presentation'
      )
      expect(closingPresentation.transform).not.toBe('none')
      expect(closingPresentation.scale).toBeLessThan(0.98)
      expect(closingPresentation.rect.width).toBeLessThan(openPresentation.rect.width)
      expect(closingPresentation.rect.height).toBeLessThan(openPresentation.rect.height)
      expectPointsWithinAxisTolerance(closingPresentation.anchor, point)
      expectPointsWithinAxisTolerance(closingPresentation.anchor, openingPresentation.anchor)

      await menu.waitFor({ state: 'detached' })
      expect(await page.locator('[role="menu"][aria-label="画布操作"]').count()).toBe(0)
    },
    electronScenarioTimeoutMs
  )
})

interface RenderedMenuPresentation {
  readonly anchor: { readonly x: number; readonly y: number }
  readonly opacity: number
  readonly rect: { readonly height: number; readonly width: number }
  readonly scale: number
  readonly transform: string
}

async function waitForCompactMenuPresentation(
  menu: Locator,
  description: string
): Promise<RenderedMenuPresentation> {
  return pollUntilState({
    description,
    observe: () => readRenderedMenuPresentation(menu),
    accept: (presentation) =>
      presentation.opacity > 0 &&
      presentation.scale > 0 &&
      presentation.scale < 0.98 &&
      presentation.rect.width > 0 &&
      presentation.rect.height > 0,
    intervalMs: 10,
    timeoutMs: 2_000
  })
}

async function waitForSettledMenuPresentation(
  menu: Locator,
  description: string
): Promise<RenderedMenuPresentation> {
  return pollUntilState({
    description,
    observe: () => readRenderedMenuPresentation(menu),
    accept: (presentation) => presentation.opacity === 1 && presentation.scale === 1,
    intervalMs: 20,
    timeoutMs: 2_000
  })
}

async function readRenderedMenuPresentation(menu: Locator): Promise<RenderedMenuPresentation> {
  return menu.evaluate((element) => {
    const styles = getComputedStyle(element)
    const transform = styles.transform
    const matrix = transform === 'none' ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(transform)
    const rect = element.getBoundingClientRect()
    const [originX = 0, originY = 0] = styles.transformOrigin
      .split(/\s+/)
      .map((value) => Number.parseFloat(value))
    const scaleX = Math.hypot(matrix.a, matrix.b)
    const scaleY = Math.hypot(matrix.c, matrix.d)

    return {
      anchor: {
        x: rect.left + scaleX * originX,
        y: rect.top + scaleY * originY
      },
      opacity: Number.parseFloat(styles.opacity),
      rect: {
        height: rect.height,
        width: rect.width
      },
      scale: (scaleX + scaleY) / 2,
      transform
    }
  })
}

function expectPointsWithinAxisTolerance(
  first: { readonly x: number; readonly y: number },
  second: { readonly x: number; readonly y: number }
): void {
  expect(Math.abs(first.x - second.x)).toBeLessThanOrEqual(maximumMenuAnchorAxisDriftPixels)
  expect(Math.abs(first.y - second.y)).toBeLessThanOrEqual(maximumMenuAnchorAxisDriftPixels)
}

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
