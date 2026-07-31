import type { Page } from 'playwright'

import { resolveWorkbenchSafeViewport } from '../../src/presentation/app-shell/workbenchCanvasSafeViewport'

export const createdWorkbenchNodeZoomUpperBound = 1.001

export interface CreatedWorkbenchNodeResult {
  readonly insets: {
    readonly bottom: number
    readonly left: number
    readonly right: number
    readonly top: number
  }
  readonly zoom: number
}

export async function setCanvasZoomToMaximum(page: Page): Promise<number> {
  const zoomIn = page.getByRole('button', { name: '放大画布' })

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const currentZoom = await readCanvasZoom(page)

    if (currentZoom >= 1.599) {
      return currentZoom
    }

    await zoomIn.click()
    await page.waitForFunction((previousZoom) => {
      const viewport = document.querySelector('.react-flow__viewport')

      if (!viewport) return false
      return new DOMMatrixReadOnly(getComputedStyle(viewport).transform).a > previousZoom + 0.001
    }, currentZoom)
    await waitForCanvasZoomToSettle(page)
  }

  throw new Error('Canvas did not reach its maximum zoom.')
}

export async function waitForCreatedWorkbenchNodeResult(
  page: Page,
  selector: string
): Promise<CreatedWorkbenchNodeResult> {
  const deadline = Date.now() + 5_000

  while (Date.now() < deadline) {
    const geometry = await readCreatedNodeGeometry(page, selector)

    if (
      geometry &&
      geometry.zoom <= createdWorkbenchNodeZoomUpperBound &&
      Object.values(geometry.insets).every((inset) => inset >= -1)
    ) {
      return geometry
    }

    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  throw new Error(`Created workbench node did not reach the safe viewport result: ${selector}`)
}

export async function readCanvasNodeGap(
  page: Page,
  firstSelector: string,
  secondSelector: string
): Promise<number> {
  return page.evaluate(
    ({ firstSelector: first, secondSelector: second }) => {
      const firstNode = document.querySelector<HTMLElement>(first)
      const secondNode = document.querySelector<HTMLElement>(second)
      const viewport = document.querySelector<HTMLElement>('.react-flow__viewport')

      if (!firstNode || !secondNode || !viewport) {
        throw new Error('Workbench node pair is unavailable.')
      }

      const firstBounds = firstNode.getBoundingClientRect()
      const secondBounds = secondNode.getBoundingClientRect()
      const zoom = new DOMMatrixReadOnly(getComputedStyle(viewport).transform).a

      return (
        Math.max(
          secondBounds.left - firstBounds.right,
          firstBounds.left - secondBounds.right,
          secondBounds.top - firstBounds.bottom,
          firstBounds.top - secondBounds.bottom
        ) / zoom
      )
    },
    { firstSelector, secondSelector }
  )
}

async function readCanvasZoom(page: Page): Promise<number> {
  return page.locator('.react-flow__viewport').evaluate((viewport) => {
    const zoom = new DOMMatrixReadOnly(getComputedStyle(viewport).transform).a

    if (!Number.isFinite(zoom)) {
      throw new Error(`Unable to read canvas zoom from: ${viewport.style.transform}`)
    }

    return zoom
  })
}

async function waitForCanvasZoomToSettle(page: Page): Promise<void> {
  const deadline = Date.now() + 2_000
  let previousZoom = await readCanvasZoom(page)
  let stableSamples = 0

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 32))
    const currentZoom = await readCanvasZoom(page)

    if (Math.abs(currentZoom - previousZoom) <= 0.0005) {
      stableSamples += 1
      if (stableSamples >= 3) return
    } else {
      stableSamples = 0
    }

    previousZoom = currentZoom
  }

  throw new Error('Canvas zoom animation did not settle.')
}

async function readCreatedNodeGeometry(
  page: Page,
  selector: string
): Promise<CreatedWorkbenchNodeResult | null> {
  const geometry = await page.evaluate((nodeSelector) => {
    const canvas = document.querySelector<HTMLElement>('.react-flow')
    const node = document.querySelector<HTMLElement>(nodeSelector)
    const viewport = document.querySelector<HTMLElement>('.react-flow__viewport')

    if (!canvas || !node || !viewport) {
      return null
    }

    const toRect = (bounds: DOMRect) => ({
      bottom: bounds.bottom,
      left: bounds.left,
      right: bounds.right,
      top: bounds.top
    })
    const nodeBounds = node.getBoundingClientRect()

    return {
      canvasRect: toRect(canvas.getBoundingClientRect()),
      nodeRect: toRect(nodeBounds),
      obstructionRects: Array.from(
        document.querySelectorAll<HTMLElement>('[data-workbench-canvas-obstruction]')
      ).map((element) => toRect(element.getBoundingClientRect())),
      zoom: new DOMMatrixReadOnly(getComputedStyle(viewport).transform).a
    }
  }, selector)

  if (!geometry) return null

  const safeViewport = resolveWorkbenchSafeViewport({
    canvasRect: geometry.canvasRect,
    obstructionRects: geometry.obstructionRects
  })
  const safeBounds = {
    bottom: geometry.canvasRect.top + safeViewport.y + safeViewport.height,
    left: geometry.canvasRect.left + safeViewport.x,
    right: geometry.canvasRect.left + safeViewport.x + safeViewport.width,
    top: geometry.canvasRect.top + safeViewport.y
  }

  return {
    insets: {
      bottom: safeBounds.bottom - geometry.nodeRect.bottom,
      left: geometry.nodeRect.left - safeBounds.left,
      right: safeBounds.right - geometry.nodeRect.right,
      top: geometry.nodeRect.top - safeBounds.top
    },
    zoom: geometry.zoom
  }
}
