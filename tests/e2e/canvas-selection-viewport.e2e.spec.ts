// @vitest-environment node

import type { ElectronApplication, Locator, Page } from 'playwright'

import {
  createE2eWorkbench,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  launchApp,
  selectBlankCanvasAction,
  teardownE2eScenario,
  type E2eScenarioResources,
  type E2eWorkbench
} from '../support/e2eWorkbench'
import { waitForCanvasViewportZoomCommit } from '../support/e2eCanvasViewport'
import { pollUntilState } from '../support/e2ePolling'
import { resolveWorkbenchNodeFocusZoom } from '../../src/presentation/app-shell/workbenchNodeFocusViewport'

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
      await selectBlankCanvasAction(page, '新建终端积木')

      const node = page.locator('[data-terminal-block-id]').filter({ hasText: 'Terminal 1' })
      await node.waitFor()
      await clickTrueCanvasPane(page, page.locator('.react-flow__pane'))

      await pollCanvasPresentation(
        page,
        node,
        (presentation) =>
          isNear(presentation.zoom, 0.35, 0.000_1) && isCanvasNodeCentered(presentation)
      )
      const focusedZoom = await resolveExpectedFocusedZoom(page, node)

      await node.locator('.terminal-node__header').click()
      await waitForCanvasViewportZoomCommit(page, {
        direction: 'increase',
        previousZoom: 0.35,
        projectDirectory: workbench.projectDirectory
      })
      const focusedPresentation = await pollCanvasPresentation(
        page,
        node,
        (presentation) =>
          isNear(presentation.zoom, focusedZoom, 0.000_1) && isCanvasNodeCentered(presentation)
      )

      expect(focusedPresentation.zoom).toBeCloseTo(focusedZoom, 3)
      expect(focusedPresentation.nodeCenterOffsetX).toBeCloseTo(0, 0)
      expect(focusedPresentation.nodeCenterOffsetY).toBeCloseTo(0, 0)

      const pane = page.locator('.react-flow__pane')
      await clickTrueCanvasPane(page, pane)
      await clickTrueCanvasPane(page, pane)
      await clickTrueCanvasPane(page, pane)
      await clickTrueCanvasPane(page, pane)
      await waitForCanvasViewportZoomCommit(page, {
        direction: 'decrease',
        previousZoom: focusedPresentation.zoom,
        projectDirectory: workbench.projectDirectory
      })
      const globalPresentation = await pollCanvasPresentation(
        page,
        node,
        (presentation) =>
          isNear(presentation.zoom, 0.35, 0.000_1) && isCanvasNodeCentered(presentation)
      )

      expect(globalPresentation.zoom).toBeCloseTo(0.35, 3)
      expect(globalPresentation.nodeCenterOffsetX).toBeCloseTo(0, 0)
      expect(globalPresentation.nodeCenterOffsetY).toBeCloseTo(0, 0)
      const settledPresentation = await readCanvasPresentation(page, node)
      await clickTrueCanvasPane(page, pane)
      await clickTrueCanvasPane(page, pane)
      await clickTrueCanvasPane(page, pane)
      expect(await readCanvasPresentation(page, node)).toEqual(settledPresentation)
    },
    electronScenarioTimeoutMs
  )

  it(
    'commits wheel zoom around the real pointer anchor',
    async () => {
      await expectDesktopRuntime(page)
      await page.getByRole('button', { name: '添加项目' }).click()
      await selectBlankCanvasAction(page, '新建终端积木')

      const node = page.locator('[data-terminal-block-id]').filter({ hasText: 'Terminal 1' })
      await node.waitFor()
      const pane = page.locator('.react-flow__pane')
      await clickTrueCanvasPane(page, pane)
      await pollCanvasPresentation(
        page,
        node,
        (presentation) =>
          isNear(presentation.zoom, 0.35, 0.000_1) && isCanvasNodeCentered(presentation)
      )

      const anchor = await resolveTrueCanvasPanePoint(pane)
      const initialPresentation = await readPointerZoomPresentation(page, anchor)
      await page.mouse.move(anchor.x, anchor.y)
      await page.mouse.wheel(0, -160)

      const completion = await waitForCanvasViewportZoomCommit(page, {
        direction: 'increase',
        previousZoom: initialPresentation.zoom,
        projectDirectory: workbench.projectDirectory
      })
      const finalPresentation = await waitForPointerZoomPresentation(
        page,
        anchor,
        completion.currentViewport.zoom
      )

      expect(finalPresentation.zoom).toBeGreaterThan(initialPresentation.zoom)
      expect(finalPresentation.zoom).toBeCloseTo(completion.persistedViewport.zoom, 3)
      expect(finalPresentation.zoomLabel).toBe(`${Math.round(finalPresentation.zoom * 100)}%`)
      expect(
        Math.hypot(
          (finalPresentation.anchorWorldX - initialPresentation.anchorWorldX) *
            finalPresentation.zoom,
          (finalPresentation.anchorWorldY - initialPresentation.anchorWorldY) *
            finalPresentation.zoom
        )
      ).toBeLessThan(0.75)
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
  const point = await resolveTrueCanvasPanePoint(pane)

  await page.mouse.click(point.x, point.y)
}

function readCanvasPresentation(page: Page, node: Locator): Promise<CanvasPresentation> {
  return pollCanvasPresentation(page, node, () => true)
}

function resolveTrueCanvasPanePoint(
  pane: Locator
): Promise<{ readonly x: number; readonly y: number }> {
  return pane.evaluate((element) => {
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

async function resolveExpectedFocusedZoom(page: Page, node: Locator): Promise<number> {
  const nodeElement = await node.elementHandle()
  const geometry = await page.evaluate((targetNode) => {
    const canvas = document.querySelector<HTMLElement>('.react-flow')
    const viewport = document.querySelector<HTMLElement>('.react-flow__viewport')
    if (!canvas || !viewport || !targetNode) {
      throw new Error('Canvas focus geometry is unavailable.')
    }

    const zoom = new DOMMatrixReadOnly(getComputedStyle(viewport).transform).a
    const canvasBounds = canvas.getBoundingClientRect()
    const nodeBounds = targetNode.getBoundingClientRect()

    return {
      canvasSize: { height: canvasBounds.height, width: canvasBounds.width },
      currentZoom: zoom,
      nodeSize: { height: nodeBounds.height / zoom, width: nodeBounds.width / zoom }
    }
  }, nodeElement)

  return resolveWorkbenchNodeFocusZoom(geometry)
}

interface PointerZoomPresentation {
  readonly anchorWorldX: number
  readonly anchorWorldY: number
  readonly zoom: number
}

interface PointerZoomFinalPresentation extends PointerZoomPresentation {
  readonly zoomLabel: string | null
}

function readPointerZoomPresentation(
  page: Page,
  anchor: { readonly x: number; readonly y: number }
): Promise<PointerZoomPresentation> {
  return page.evaluate((screenAnchor) => {
    const canvas = document.querySelector<HTMLElement>('.react-flow')
    const viewport = document.querySelector<HTMLElement>('.react-flow__viewport')
    if (!canvas || !viewport) throw new Error('Canvas zoom presentation is unavailable.')

    const bounds = canvas.getBoundingClientRect()
    const transform = new DOMMatrixReadOnly(getComputedStyle(viewport).transform)
    const localX = screenAnchor.x - bounds.left
    const localY = screenAnchor.y - bounds.top

    return {
      anchorWorldX: (localX - transform.e) / transform.a,
      anchorWorldY: (localY - transform.f) / transform.a,
      zoom: transform.a
    }
  }, anchor)
}

function waitForPointerZoomPresentation(
  page: Page,
  anchor: { readonly x: number; readonly y: number },
  committedZoom: number
): Promise<PointerZoomFinalPresentation> {
  return pollUntilState({
    accept: (presentation) =>
      Math.abs(presentation.zoom - committedZoom) <= 0.000_5 &&
      presentation.zoomLabel === `${Math.round(presentation.zoom * 100)}%`,
    description: 'canvas wheel zoom to publish its committed presentation',
    observe: () =>
      page.evaluate((screenAnchor) => {
        const canvas = document.querySelector<HTMLElement>('.react-flow')
        const viewport = document.querySelector<HTMLElement>('.react-flow__viewport')
        const zoomLabel = document.querySelector<HTMLElement>('[aria-label="画布缩放比例"]')
        if (!canvas || !viewport || !zoomLabel) {
          throw new Error('Canvas zoom presentation is unavailable.')
        }

        const bounds = canvas.getBoundingClientRect()
        const transform = new DOMMatrixReadOnly(getComputedStyle(viewport).transform)
        const localX = screenAnchor.x - bounds.left
        const localY = screenAnchor.y - bounds.top
        return {
          anchorWorldX: (localX - transform.e) / transform.a,
          anchorWorldY: (localY - transform.f) / transform.a,
          zoom: transform.a,
          zoomLabel: zoomLabel.textContent
        }
      }, anchor),
    retryObservationErrors: true,
    timeoutMs: 5_000
  })
}
