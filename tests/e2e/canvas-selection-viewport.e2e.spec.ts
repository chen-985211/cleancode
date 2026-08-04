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

describe('canvas selection viewport e2e', () => {
  let workbench: E2eWorkbench
  let electronApp: ElectronApplication
  let page: Page
  let resources: E2eScenarioResources

  beforeEach(async () => {
    resources = {}
    workbench = await createE2eWorkbench('cleancode-canvas-selection-viewport-e2e')
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
    'returns to 35% around the node selected from its title',
    async () => {
      await expectDesktopRuntime(page)
      await page.getByRole('button', { name: '添加项目' }).click()
      await page.getByRole('button', { name: '新建终端积木' }).click()

      const node = page.locator('[data-terminal-block-id]').filter({ hasText: 'Terminal 1' })
      await node.waitFor()
      await clickTrueCanvasPane(page, page.locator('.react-flow__pane'))

      const globalPresentation = await pollCanvasPresentation(
        page,
        node,
        (presentation) =>
          isNear(presentation.zoom, 0.35, 0.000_1) && isCanvasNodeCentered(presentation)
      )
      expect(globalPresentation.zoom).toBeCloseTo(0.35, 3)
      expect(globalPresentation.nodeCenterOffsetX).toBeCloseTo(0, 0)
      expect(globalPresentation.nodeCenterOffsetY).toBeCloseTo(0, 0)

      await node.locator('.terminal-node__header').click()
      const focusedPresentation = await pollCanvasPresentation(
        page,
        node,
        (presentation) =>
          isNear(presentation.zoom, 0.9, 0.000_1) && isCanvasNodeCentered(presentation)
      )

      expect(focusedPresentation.zoom).toBeCloseTo(0.9, 3)
      expect(focusedPresentation.nodeCenterOffsetX).toBeCloseTo(0, 0)
      expect(focusedPresentation.nodeCenterOffsetY).toBeCloseTo(0, 0)
    },
    electronScenarioTimeoutMs
  )
})

interface CanvasPresentation {
  readonly nodeCenterOffsetX: number
  readonly nodeCenterOffsetY: number
  readonly zoom: number
}

async function clickTrueCanvasPane(page: Page, pane: Locator): Promise<void> {
  const point = await pane.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const fractions = [0.08, 0.2, 0.8, 0.92]

    for (const yFraction of fractions) {
      for (const xFraction of fractions) {
        const x = bounds.left + bounds.width * xFraction
        const y = bounds.top + bounds.height * yFraction
        if (document.elementFromPoint(x, y) === element) return { x, y }
      }
    }

    throw new Error('No unobstructed canvas pane point is available.')
  })

  await page.mouse.click(point.x, point.y)
}

function pollCanvasPresentation(
  page: Page,
  node: Locator,
  accept: (presentation: CanvasPresentation) => boolean
): Promise<CanvasPresentation> {
  return pollUntilState({
    accept,
    description: 'canvas selection viewport presentation to settle',
    observe: async () => {
      const nodeElement = await node.elementHandle()

      return page.evaluate((targetNode) => {
        const canvas = document.querySelector<HTMLElement>('.react-flow')
        const viewport = document.querySelector<HTMLElement>('.react-flow__viewport')
        if (!canvas || !viewport || !targetNode) {
          throw new Error('Canvas presentation is unavailable.')
        }

        const canvasBounds = canvas.getBoundingClientRect()
        const nodeBounds = targetNode.getBoundingClientRect()
        const transform = new DOMMatrixReadOnly(getComputedStyle(viewport).transform)

        return {
          nodeCenterOffsetX:
            nodeBounds.left + nodeBounds.width / 2 - (canvasBounds.left + canvasBounds.width / 2),
          nodeCenterOffsetY:
            nodeBounds.top + nodeBounds.height / 2 - (canvasBounds.top + canvasBounds.height / 2),
          zoom: transform.a
        }
      }, nodeElement)
    },
    retryObservationErrors: true,
    timeoutMs: 5_000
  })
}

function isNear(value: number, expected: number, tolerance: number): boolean {
  return Math.abs(value - expected) <= tolerance
}

function isCanvasNodeCentered(presentation: CanvasPresentation): boolean {
  return (
    Math.abs(presentation.nodeCenterOffsetX) < 0.4 && Math.abs(presentation.nodeCenterOffsetY) < 0.4
  )
}
