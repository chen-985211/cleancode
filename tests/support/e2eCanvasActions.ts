import type { Page } from 'playwright'

import { pollUntilState } from './e2ePolling'

export async function selectBlankCanvasAction(
  page: Page,
  action: '新建终端积木' | '组合终端'
): Promise<void> {
  await pollUntilState({
    description: 'blank-canvas actions to become available',
    observe: () => page.getByRole('button', { name: '新建 Agent' }).isEnabled(),
    accept: Boolean,
    timeoutMs: 10_000
  })
  const pane = page.locator('.react-flow__pane')
  await pane.waitFor({ state: 'visible' })
  let blankPoint = await findVisibleBlankCanvasPoint(page)
  if (blankPoint && (await page.locator('.react-flow__node').count()) > 0) {
    const bounds = await pane.boundingBox()
    if (!bounds) throw new Error('React Flow pane is not visible')
    const previousTransform = await page.locator('.react-flow__viewport').getAttribute('style')
    const panDistance = Math.min(680, bounds.height * 0.56)
    const targetY =
      blankPoint.y < bounds.y + bounds.height / 2
        ? Math.min(bounds.y + bounds.height - 80, blankPoint.y + panDistance)
        : Math.max(bounds.y + 80, blankPoint.y - panDistance)

    await page.mouse.move(blankPoint.x, blankPoint.y)
    await page.mouse.down()
    await page.mouse.move(blankPoint.x, targetY, { steps: 12 })
    await page.mouse.up()
    await pollUntilState({
      description: 'canvas pan before blank-canvas creation',
      observe: () => page.locator('.react-flow__viewport').getAttribute('style'),
      accept: (transform) => transform !== previousTransform,
      timeoutMs: 5_000
    })
    blankPoint = await findVisibleBlankCanvasPoint(page)
  }
  if (!blankPoint) throw new Error('No visible blank React Flow pane point is available')

  await page.mouse.click(blankPoint.x, blankPoint.y, { button: 'right' })
  await page
    .getByRole('menu', { name: '画布操作' })
    .getByRole('menuitem', { name: action, exact: true })
    .click()
}

export async function panCanvasLeft(page: Page): Promise<void> {
  const pane = await page.locator('.react-flow__pane').boundingBox()
  if (!pane) throw new Error('The canvas pane is unavailable.')
  for (let pan = 0; pan < 3; pan += 1) {
    const point = await findVisibleBlankCanvasPoint(page)
    if (!point) throw new Error('No blank canvas point is available for panning.')
    const viewport = page.locator('.react-flow__viewport')
    const previousTransform = await viewport.getAttribute('style')
    await page.mouse.move(point.x, point.y)
    await page.mouse.down()
    try {
      await page.mouse.move(pane.x + 12, point.y, { steps: 4 })
    } finally {
      await page.mouse.up()
    }
    await pollUntilState({
      description: 'canvas pan to move the Agent out of view',
      observe: () => viewport.getAttribute('style'),
      accept: (transform) => transform !== previousTransform,
      timeoutMs: 5_000
    })
  }
}

async function findVisibleBlankCanvasPoint(
  page: Page
): Promise<{ readonly x: number; readonly y: number } | null> {
  return page.locator('.react-flow__pane').evaluate((element) => {
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

    return null
  })
}
