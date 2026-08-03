import type { Page } from 'playwright'

import { resolveWorkbenchSafeViewport } from '../../src/presentation/app-shell/workbenchCanvasSafeViewport'
import { pollUntilState } from './e2ePolling'

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
    await waitForCanvasZoomToPersist(page, currentZoom)
  }

  throw new Error('Canvas did not reach its maximum zoom.')
}

export async function waitForCreatedWorkbenchNodeResult(
  page: Page,
  selector: string
): Promise<CreatedWorkbenchNodeResult> {
  const geometry = await pollUntilState({
    description: `created workbench node to reach the safe viewport result: ${selector}`,
    observe: () => readCreatedNodeGeometry(page, selector),
    accept: (observation) =>
      observation !== null &&
      observation.zoom <= createdWorkbenchNodeZoomUpperBound &&
      Object.values(observation.insets).every((inset) => inset >= -1),
    timeoutMs: 5_000
  })

  if (!geometry) throw new Error(`The completed node geometry was unavailable: ${selector}`)
  return geometry
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

async function waitForCanvasZoomToPersist(page: Page, previousZoom: number): Promise<void> {
  await pollUntilState({
    description: 'canvas zoom animation to persist its completed viewport',
    observe: () =>
      page.evaluate(async () => {
        const viewport = document.querySelector('.react-flow__viewport')
        const api = window.cleancode
        if (!viewport || !api) return null

        const workbenches = await api.listWorkbenches()
        const currentWorkbench =
          workbenches.find((workbench) => workbench.isCurrentProject) ?? workbenches[0]

        return {
          currentZoom: new DOMMatrixReadOnly(getComputedStyle(viewport).transform).a,
          persistedZoom: currentWorkbench?.graph.viewport.zoom ?? null
        }
      }),
    accept: (observation) =>
      observation !== null &&
      observation.persistedZoom !== null &&
      observation.currentZoom > previousZoom + 0.001 &&
      Math.abs(observation.currentZoom - observation.persistedZoom) <= 0.0005,
    intervalMs: 50,
    timeoutMs: 5_000
  })
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
