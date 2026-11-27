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
      await openCanvasProject(page)

      const pane = page.locator('.react-flow__pane')
      await pane.waitFor({ state: 'visible' })

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
      await waitForSettledMenuPresentation(menu, 'initial canvas menu to settle open')
      await menu.evaluate((element) => {
        element.setAttribute('data-e2e-presence-token', 'retained-surface')
      })

      await page.keyboard.press('Escape')
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
      await openCanvasProject(page)

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
      await page.clock.install({ time: new Date('2025-01-01T00:00:00Z') })
      await openCanvasProject(page)
      await page.clock.pauseAt(new Date('2025-01-01T01:00:00Z'))

      const pane = page.locator('.react-flow__pane')
      await pane.waitFor({ state: 'visible' })
      const point = await findVisibleBlankCanvasPoint(pane)
      const menu = page.locator('[role="menu"][aria-label="画布操作"]')

      await page.mouse.click(point.x, point.y, { button: 'right' })
      await page.locator('[role="menu"][aria-label="画布操作"][data-interactive="true"]').waitFor({
        state: 'attached'
      })
      // Advance six animation frames in each direction, even when the CI renderer is busy.
      const intermediateTimeMs = 96
      await page.clock.runFor(intermediateTimeMs)
      const openingPresentation = await menu.evaluate(readMenuPresentation)
      await page.clock.runFor(1_000)
      const openPresentation = await menu.evaluate(readMenuPresentation)
      const firstAction = menu.getByRole('menuitem').first()

      expectCompactPresentation(openingPresentation, openPresentation)
      expectPointsWithinAxisTolerance(openingPresentation.anchor, point)
      expectPointsWithinAxisTolerance(openPresentation.anchor, point)
      expect(openPresentation.scale).toBe(1)
      expect(openPresentation.opacity).toBe(1)
      expect(await firstAction.isEnabled()).toBe(true)
      await firstAction.click({ trial: true })

      await page.mouse.click(point.x, point.y, { button: 'right' })
      await page.clock.runFor(intermediateTimeMs)
      const closingPresentation = await menu.evaluate(readMenuPresentation)
      expectCompactPresentation(closingPresentation, openPresentation)
      expect(closingPresentation.interactive).toBe(false)
      expect(closingPresentation.ariaHidden).toBe('true')
      expect(closingPresentation.inert).toBe(true)
      expectPointsWithinAxisTolerance(closingPresentation.anchor, point)
      expectPointsWithinAxisTolerance(closingPresentation.anchor, openingPresentation.anchor)

      await page.clock.resume()
      await menu.waitFor({ state: 'detached' })
    },
    electronScenarioTimeoutMs
  )
})

interface RenderedMenuPresentation {
  readonly anchor: { readonly x: number; readonly y: number }
  readonly interactive: boolean
  readonly ariaHidden: string | null
  readonly inert: boolean
  readonly opacity: number
  readonly rect: { readonly height: number; readonly width: number }
  readonly scale: number
  readonly transform: string
}

async function openCanvasProject(page: Page): Promise<void> {
  await page.reload({ waitUntil: 'domcontentloaded' })
  expect(
    await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  ).toBe(false)
  await expectDesktopRuntime(page)
  await page.getByRole('button', { name: '添加项目' }).click()
  await pollUntilState({
    description: 'canvas actions to become available',
    observe: () => page.getByRole('button', { name: '新建 Agent' }).isEnabled(),
    accept: Boolean,
    timeoutMs: 10_000
  })
}

async function waitForSettledMenuPresentation(
  menu: Locator,
  description: string
): Promise<RenderedMenuPresentation> {
  return pollUntilState({
    description,
    observe: () => menu.evaluate(readMenuPresentation),
    accept: (current) => current.opacity === 1 && current.scale === 1,
    intervalMs: 20,
    timeoutMs: 2_000
  })
}

function readMenuPresentation(element: Element): RenderedMenuPresentation {
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
    interactive: element.getAttribute('data-interactive') === 'true',
    ariaHidden: element.getAttribute('aria-hidden'),
    inert: element.hasAttribute('inert'),
    opacity: Number.parseFloat(styles.opacity),
    rect: {
      height: rect.height,
      width: rect.width
    },
    scale: (scaleX + scaleY) / 2,
    transform
  }
}

function expectCompactPresentation(
  current: RenderedMenuPresentation,
  open: RenderedMenuPresentation
): void {
  expect(current.transform).not.toBe('none')
  expect(current.opacity).toBeGreaterThan(0)
  expect(current.scale).toBeGreaterThan(0)
  expect(current.scale).toBeLessThan(0.98)
  expect(current.rect.width).toBeGreaterThan(0)
  expect(current.rect.width).toBeLessThan(open.rect.width)
  expect(current.rect.height).toBeGreaterThan(0)
  expect(current.rect.height).toBeLessThan(open.rect.height)
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
