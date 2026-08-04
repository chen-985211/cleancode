import type { Page } from 'playwright'

import { readE2eBlockGraph } from './e2eBlockGraph'
import { pollUntilState } from './e2ePolling'
import type { E2eWorkbench } from './e2eWorkbench'

export async function readRequiredBoundingBox(locator: ReturnType<Page['locator']>) {
  const box = await locator.boundingBox()

  expect(box).not.toBeNull()

  return box!
}

export async function resizeTerminalBlockFromBottomRight(
  page: Page,
  deltaX: number,
  deltaY: number
): Promise<void> {
  const resizeDrag = await startTerminalBlockResizeFromBottomRight(page)

  await page.mouse.move(resizeDrag.startX + deltaX, resizeDrag.startY + deltaY, { steps: 18 })
  await page.mouse.up()
}

export async function startTerminalBlockResizeFromBottomRight(page: Page): Promise<{
  readonly startX: number
  readonly startY: number
}> {
  await page.waitForFunction(
    () => document.querySelectorAll('.terminal-node__resize-handle').length > 0
  )

  return startTerminalResizeFromBottomRight(page)
}

export async function readTerminalBlockPosition(workbench: E2eWorkbench) {
  const graph = await readE2eBlockGraph(workbench)

  return graph.blocks[0]!.position
}

export async function readTerminalBlockSize(workbench: E2eWorkbench) {
  const graph = await readE2eBlockGraph(workbench)

  return graph.blocks[0]!.size
}

export async function waitForTerminalBlockPositionChange(
  workbench: E2eWorkbench,
  beforePosition: { readonly x: number; readonly y: number }
) {
  return pollUntilState({
    description: 'terminal block position to change',
    observe: () => readTerminalBlockPosition(workbench),
    accept: (position) => position.x !== beforePosition.x || position.y !== beforePosition.y,
    timeoutMs: 5_000
  })
}

export async function waitForTerminalBlockSizeChange(
  workbench: E2eWorkbench,
  beforeSize: { readonly width: number; readonly height: number }
) {
  return pollUntilState({
    description: 'terminal block size to change',
    observe: () => readTerminalBlockSize(workbench),
    accept: (size) => size.width !== beforeSize.width || size.height !== beforeSize.height,
    timeoutMs: 5_000
  })
}

async function startTerminalResizeFromBottomRight(
  page: Page
): Promise<{ readonly startX: number; readonly startY: number }> {
  const handles = page.locator('.terminal-node__resize-handle')
  const boxes = await Promise.all(
    Array.from({ length: await handles.count() }, (_, index) => handles.nth(index).boundingBox())
  )
  const orderedBoxes = boxes
    .filter((box): box is NonNullable<typeof box> => Boolean(box))
    .sort((left, right) => left.x + left.y - (right.x + right.y))
  const box = orderedBoxes.at(-1)

  expect(box).toBeDefined()
  const startX = box!.x + box!.width / 2
  const startY = box!.y + box!.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()

  return { startX, startY }
}
