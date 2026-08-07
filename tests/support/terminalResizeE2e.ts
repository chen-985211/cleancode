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
  let lastStartError: unknown

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const handle = page.locator('.terminal-node__resize-handle.bottom.right').first()
    await handle.hover()
    const box = await readRequiredBoundingBox(handle)
    const startX = box.x + box.width / 2
    const startY = box.y + box.height / 2
    const terminal = page.locator('[data-terminal-block-id]').first()
    const beforeBox = await readRequiredBoundingBox(terminal)

    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 8, startY + 8, { steps: 4 })

    try {
      await pollUntilState({
        description: 'terminal resize drag to start',
        observe: () => readRequiredBoundingBox(terminal),
        accept: (candidateBox) =>
          candidateBox.width - beforeBox.width > 4 || candidateBox.height - beforeBox.height > 4,
        timeoutMs: 1_000
      })
      return { startX, startY }
    } catch (error) {
      lastStartError = error
      await page.mouse.up()
    }
  }

  throw new Error('Could not start terminal resize drag after three attempts.', {
    cause: lastStartError
  })
}
