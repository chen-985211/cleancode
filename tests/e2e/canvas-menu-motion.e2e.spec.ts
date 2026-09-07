// @vitest-environment node

import type { ElectronApplication, JSHandle, Locator, Page } from 'playwright'

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
  let menuMotion: JSHandle<ReturnType<typeof observeRenderedMenuMotion>> | undefined

  beforeEach(async () => {
    menuMotion = undefined
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
    menuMotion = await page.evaluateHandle(observeRenderedMenuMotion)
  }, electronLaunchTimeoutMs)

  afterEach(async ({ task }) => {
    try {
      if (menuMotion && !page.isClosed()) await menuMotion.evaluate((observer) => observer.stop())
    } finally {
      try {
        await menuMotion?.dispose()
      } finally {
        await teardownE2eScenario({
          resources,
          taskFailed: task.result?.state === 'fail',
          taskName: task.name
        })
      }
    }
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
      await waitForSettledMenuPresentation(menuMotion!, 'initial canvas menu to settle open')
      await menu.evaluate((element) => {
        element.setAttribute('data-e2e-presence-token', 'retained-surface')
      })

      await page.keyboard.press('Escape')
      await page.mouse.click(point.x, point.y, { button: 'right' })

      await menu.waitFor({ state: 'attached' })
      expect(await menu.getAttribute('data-e2e-presence-token')).toBe('retained-surface')
      expect(await page.locator('[role="menu"][data-interactive="true"]').count()).toBe(1)
      await waitForSettledMenuPresentation(menuMotion!, 'retargeted canvas menu to settle open')
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
      const openPresentation = await waitForSettledMenuPresentation(
        menuMotion!,
        'canvas menu to settle open'
      )
      // Deliberately consume the sample after settling: runner latency must not lose a frame.
      const openingPresentation = await waitForCompactMenuPresentation(
        menuMotion!,
        'canvas menu to render a compact opening presentation'
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

      await menuMotion!.evaluate((observer) => observer.reset())
      await page.mouse.click(point.x, point.y, { button: 'right' })
      // Closing samples must also survive a delayed consumer and removal of the surface.
      await menu.waitFor({ state: 'detached' })
      const closingPresentation = await waitForCompactMenuPresentation(
        menuMotion!,
        'canvas menu to render a compact closing presentation'
      )
      expect(closingPresentation.interactive).toBe(false)
      expect(closingPresentation.ariaHidden).toBe('true')
      expect(closingPresentation.inert).toBe(true)
      expect(closingPresentation.transform).not.toBe('none')
      expect(closingPresentation.scale).toBeLessThan(0.98)
      expect(closingPresentation.rect.width).toBeLessThan(openPresentation.rect.width)
      expect(closingPresentation.rect.height).toBeLessThan(openPresentation.rect.height)
      expectPointsWithinAxisTolerance(closingPresentation.anchor, point)
      expectPointsWithinAxisTolerance(closingPresentation.anchor, openingPresentation.anchor)

      expect(await page.locator('[role="menu"][aria-label="画布操作"]').count()).toBe(0)
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

async function waitForCompactMenuPresentation(
  observer: JSHandle<ReturnType<typeof observeRenderedMenuMotion>>,
  description: string
): Promise<RenderedMenuPresentation> {
  const observation = await pollUntilState({
    description,
    observe: () => observer.evaluate((recording) => recording.read()),
    accept: (recording) => recording.compact !== null,
    intervalMs: 10,
    timeoutMs: 2_000
  })
  return observation.compact!
}

async function waitForSettledMenuPresentation(
  observer: JSHandle<ReturnType<typeof observeRenderedMenuMotion>>,
  description: string
): Promise<RenderedMenuPresentation> {
  const observation = await pollUntilState({
    description,
    observe: () => observer.evaluate((recording) => recording.read()),
    accept: ({ current }) => current?.opacity === 1 && current.scale === 1,
    intervalMs: 20,
    timeoutMs: 2_000
  })
  return observation.current!
}

function observeRenderedMenuMotion() {
  let compact: RenderedMenuPresentation | null = null
  let last: RenderedMenuPresentation | null = null
  let frameId = 0
  const readCurrent = (): RenderedMenuPresentation | null => {
    const element = document.querySelector('[role="menu"][aria-label="画布操作"]')
    if (!element) return null
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
  const sample = (): void => {
    const current = readCurrent()
    if (!current) return
    last = current
    if (
      !compact &&
      current.opacity > 0 &&
      current.scale > 0 &&
      current.scale < 0.98 &&
      current.rect.width > 0 &&
      current.rect.height > 0
    ) {
      compact = current
    }
  }
  const sampleFrame = (): void => {
    sample()
    frameId = requestAnimationFrame(sampleFrame)
  }
  // Arm inside the renderer before input, independently of Playwright's round trips.
  const mutations = new MutationObserver(sample)
  mutations.observe(document.body, {
    attributes: true,
    attributeFilter: ['style', 'data-interactive', 'aria-hidden', 'inert'],
    childList: true,
    subtree: true
  })
  frameId = requestAnimationFrame(sampleFrame)
  return {
    read: () => ({ compact, current: readCurrent(), last }),
    reset: () => {
      compact = null
      last = null
    },
    stop: () => {
      cancelAnimationFrame(frameId)
      mutations.disconnect()
    }
  }
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
