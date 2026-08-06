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
      await page.getByRole('button', { name: '新建终端积木' }).click()

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

      await beginCanvasMotionSampling(page, node)
      await node.locator('.terminal-node__header').click()
      const focusedPresentation = await pollCanvasPresentation(
        page,
        node,
        (presentation) =>
          isNear(presentation.zoom, focusedZoom, 0.000_1) && isCanvasNodeCentered(presentation)
      )

      expect(focusedPresentation.zoom).toBeCloseTo(focusedZoom, 3)
      expect(focusedPresentation.nodeCenterOffsetX).toBeCloseTo(0, 0)
      expect(focusedPresentation.nodeCenterOffsetY).toBeCloseTo(0, 0)

      expectSmoothAnchoredZoom(await finishCanvasMotionSampling(page), 0.35, focusedZoom)

      await beginCanvasMotionSampling(page, node)
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
      expectSmoothAnchoredZoom(await finishCanvasMotionSampling(page), focusedZoom, 0.35)
    },
    electronScenarioTimeoutMs
  )

  it(
    'smoothly zooms around the real wheel pointer anchor along one continuous curve',
    async () => {
      await expectDesktopRuntime(page)
      await page.getByRole('button', { name: '添加项目' }).click()
      await page.getByRole('button', { name: '新建终端积木' }).click()

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
      await beginPointerZoomSampling(page, anchor)
      await page.mouse.move(anchor.x, anchor.y)
      await page.mouse.wheel(0, -160)

      const finalPresentation = await pollUntilState({
        accept: (presentation) =>
          presentation.zoom > initialPresentation.zoom &&
          presentation.zoomLabel === `${Math.round(presentation.zoom * 100)}%`,
        description: 'canvas wheel zoom to settle and publish its final level',
        observe: async () => ({
          ...(await readPointerZoomPresentation(page, anchor)),
          zoomLabel: await page.getByLabel('画布缩放比例').textContent()
        }),
        timeoutMs: 5_000
      })
      const presentations = await finishPointerZoomSampling(page)

      expect(finalPresentation.zoom).toBeGreaterThan(initialPresentation.zoom)
      expectContinuousPointerZoomCurve(presentations, initialPresentation, finalPresentation)
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

async function beginCanvasMotionSampling(page: Page, node: Locator): Promise<void> {
  const nodeElement = await node.elementHandle()

  await page.evaluate((targetNode) => {
    if (!targetNode) throw new Error('Canvas node is unavailable for motion sampling.')

    const samplingWindow = window as typeof window & {
      canvasMotionSampling?: {
        observer: MutationObserver
        presentations: CanvasPresentation[]
      }
    }
    const canvas = document.querySelector<HTMLElement>('.react-flow')
    const viewport = document.querySelector<HTMLElement>('.react-flow__viewport')
    if (!canvas || !viewport) throw new Error('Canvas presentation is unavailable.')

    const presentations: CanvasPresentation[] = []

    const sample = () => {
      const canvasBounds = canvas.getBoundingClientRect()
      const nodeBounds = targetNode.getBoundingClientRect()
      const transform = new DOMMatrixReadOnly(getComputedStyle(viewport).transform)
      presentations.push({
        nodeCenterOffsetX:
          nodeBounds.left + nodeBounds.width / 2 - (canvasBounds.left + canvasBounds.width / 2),
        nodeCenterOffsetY:
          nodeBounds.top + nodeBounds.height / 2 - (canvasBounds.top + canvasBounds.height / 2),
        zoom: transform.a
      })
    }

    const observer = new MutationObserver(sample)
    observer.observe(viewport, { attributeFilter: ['style'], attributes: true })
    samplingWindow.canvasMotionSampling = { observer, presentations }
    sample()
  }, nodeElement)
}

function finishCanvasMotionSampling(page: Page): Promise<CanvasPresentation[]> {
  return page.evaluate(() => {
    const samplingWindow = window as typeof window & {
      canvasMotionSampling?: {
        observer: MutationObserver
        presentations: CanvasPresentation[]
      }
    }
    const sampling = samplingWindow.canvasMotionSampling
    if (!sampling) throw new Error('Canvas motion sampling was not started.')

    sampling.observer.disconnect()
    delete samplingWindow.canvasMotionSampling
    return sampling.presentations
  })
}

function expectSmoothAnchoredZoom(
  presentations: CanvasPresentation[],
  startZoom: number,
  targetZoom: number
): void {
  const direction = Math.sign(targetZoom - startZoom)
  const movingPresentations = presentations.filter(
    (presentation) => Math.abs(presentation.zoom - startZoom) > 0.000_1
  )

  expect(movingPresentations.length).toBeGreaterThan(2)
  presentations.forEach((presentation) => {
    expect(Math.abs(presentation.nodeCenterOffsetX)).toBeLessThan(0.75)
    expect(Math.abs(presentation.nodeCenterOffsetY)).toBeLessThan(0.75)
  })
  presentations.slice(1).forEach((presentation, index) => {
    const previous = presentations[index]
    expect((presentation.zoom - previous.zoom) * direction).toBeGreaterThanOrEqual(-0.000_1)
  })
}

interface PointerZoomPresentation {
  readonly anchorWorldX: number
  readonly anchorWorldY: number
  readonly zoom: number
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

async function beginPointerZoomSampling(
  page: Page,
  anchor: { readonly x: number; readonly y: number }
): Promise<void> {
  await page.evaluate((screenAnchor) => {
    const samplingWindow = window as typeof window & {
      pointerZoomSampling?: {
        observer: MutationObserver
        presentations: PointerZoomPresentation[]
      }
    }
    const canvas = document.querySelector<HTMLElement>('.react-flow')
    const viewport = document.querySelector<HTMLElement>('.react-flow__viewport')
    if (!canvas || !viewport) throw new Error('Canvas zoom presentation is unavailable.')

    const presentations: PointerZoomPresentation[] = []
    const sample = () => {
      const bounds = canvas.getBoundingClientRect()
      const transform = new DOMMatrixReadOnly(getComputedStyle(viewport).transform)
      const localX = screenAnchor.x - bounds.left
      const localY = screenAnchor.y - bounds.top
      presentations.push({
        anchorWorldX: (localX - transform.e) / transform.a,
        anchorWorldY: (localY - transform.f) / transform.a,
        zoom: transform.a
      })
    }
    const observer = new MutationObserver(sample)
    observer.observe(viewport, { attributeFilter: ['style'], attributes: true })
    samplingWindow.pointerZoomSampling = { observer, presentations }
    sample()
  }, anchor)
}

function finishPointerZoomSampling(page: Page): Promise<PointerZoomPresentation[]> {
  return page.evaluate(() => {
    const samplingWindow = window as typeof window & {
      pointerZoomSampling?: {
        observer: MutationObserver
        presentations: PointerZoomPresentation[]
      }
    }
    const sampling = samplingWindow.pointerZoomSampling
    if (!sampling) throw new Error('Canvas pointer zoom sampling was not started.')

    sampling.observer.disconnect()
    delete samplingWindow.pointerZoomSampling
    return sampling.presentations
  })
}

function expectContinuousPointerZoomCurve(
  presentations: PointerZoomPresentation[],
  initialPresentation: PointerZoomPresentation,
  finalPresentation: PointerZoomPresentation
): void {
  const movingPresentations = presentations.filter(
    (presentation) => Math.abs(presentation.zoom - initialPresentation.zoom) > 0.000_1
  )

  expect(movingPresentations.length).toBeGreaterThan(0)
  expect(movingPresentations.length).toBeGreaterThan(2)
  expect(movingPresentations[0].zoom).toBeLessThan(finalPresentation.zoom - 0.000_1)
  presentations.forEach((presentation) => {
    const anchorDrift = Math.hypot(
      (presentation.anchorWorldX - initialPresentation.anchorWorldX) * presentation.zoom,
      (presentation.anchorWorldY - initialPresentation.anchorWorldY) * presentation.zoom
    )
    expect(anchorDrift).toBeLessThan(0.75)
  })
  presentations.slice(1).forEach((presentation, index) => {
    expect(presentation.zoom).toBeGreaterThanOrEqual(presentations[index].zoom - 0.000_1)
  })
}
