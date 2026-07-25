import type { Locator, Page } from 'playwright'

export type CanvasZoomDirection = 'in' | 'out'

export async function setCanvasZoomFromDefault(
  page: Page,
  direction: CanvasZoomDirection
): Promise<number> {
  const buttonName = direction === 'in' ? '放大画布' : '缩小画布'
  const initialZoom = await readCanvasZoom(page)
  const expectedZoom = direction === 'in' ? initialZoom * 1.2 : initialZoom / 1.2

  await page.getByRole('button', { name: buttonName }).click()
  await page.waitForFunction((expected) => {
    const viewport = document.querySelector('.react-flow__viewport')

    if (!viewport) return false
    return (
      Math.abs(new DOMMatrixReadOnly(getComputedStyle(viewport).transform).a - expected) <= 0.001
    )
  }, expectedZoom)
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
  )

  return readCanvasZoom(page)
}

export async function readCanvasViewportTransform(page: Page): Promise<string> {
  return page
    .locator('.react-flow__viewport')
    .evaluate((viewport) => getComputedStyle(viewport).transform)
}

export async function selectExactXtermText(
  page: Page,
  terminal: Locator,
  targetText: string
): Promise<void> {
  await ensureTerminalDomRenderer(terminal)
  await terminal.locator('.xterm-helper-textarea').focus()
  await terminal.locator('.xterm-rows > div').filter({ hasText: targetText }).last().waitFor()
  await waitForCanvasViewportToSettle(page)
  const selection = await terminal.evaluate((element, target) => {
    const rows = Array.from(element.querySelectorAll('.xterm-rows > div'))
    const row = rows.findLast((candidate) => candidate.textContent?.includes(target))

    if (!row) {
      throw new Error(`Unable to measure xterm selection target: ${target}`)
    }

    const rowText = row.textContent ?? ''
    const startColumn = rowText.indexOf(target)
    const rowBounds = row.getBoundingClientRect()
    const range = document.createRange()
    const textNodes = Array.from(row.childNodes).flatMap((child) =>
      child.nodeType === Node.TEXT_NODE
        ? [child]
        : Array.from(child.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE)
    )
    let currentOffset = 0
    let startNode: Node | null = null
    let startOffset = 0
    let endNode: Node | null = null
    let endOffset = 0

    for (const textNode of textNodes) {
      const length = textNode.textContent?.length ?? 0

      if (!startNode && startColumn >= currentOffset && startColumn < currentOffset + length) {
        startNode = textNode
        startOffset = startColumn - currentOffset
      }
      if (
        startColumn + target.length > currentOffset &&
        startColumn + target.length <= currentOffset + length
      ) {
        endNode = textNode
        endOffset = startColumn + target.length - currentOffset
        break
      }
      currentOffset += length
    }

    if (!startNode || !endNode) {
      throw new Error(`Unable to locate xterm text nodes for: ${target}`)
    }

    range.setStart(startNode, startOffset)
    range.setEnd(endNode, endOffset)
    const targetBounds = range.getBoundingClientRect()
    const cellWidth = targetBounds.width / target.length

    if (startColumn < 0 || !Number.isFinite(cellWidth) || cellWidth <= 0 || rowBounds.height <= 0) {
      throw new Error(`Invalid xterm selection geometry for: ${target}`)
    }

    return {
      endX: targetBounds.right - 0.25 * cellWidth,
      startX: targetBounds.left + 0.25 * cellWidth,
      y: rowBounds.top + rowBounds.height / 2
    }
  }, targetText)

  await page.mouse.move(selection.startX, selection.y)
  await page.mouse.down()
  await page.mouse.move(selection.endX, selection.y, { steps: 12 })
  await page.mouse.up()
}

async function waitForCanvasViewportToSettle(page: Page): Promise<void> {
  await page.locator('.react-flow__viewport').evaluate(
    (viewport) =>
      new Promise<void>((resolve, reject) => {
        let quietTimeout = 0
        let deadlineTimeout = 0
        const observer = new MutationObserver(scheduleQuietWindow)

        function cleanup(): void {
          observer.disconnect()
          window.clearTimeout(quietTimeout)
          window.clearTimeout(deadlineTimeout)
        }

        function scheduleQuietWindow(): void {
          window.clearTimeout(quietTimeout)
          quietTimeout = window.setTimeout(() => {
            cleanup()
            resolve()
          }, 150)
        }

        observer.observe(viewport, {
          attributeFilter: ['style'],
          attributes: true
        })
        deadlineTimeout = window.setTimeout(() => {
          cleanup()
          reject(new Error('Canvas viewport did not settle before xterm text selection.'))
        }, 3_000)
        scheduleQuietWindow()
      })
  )
}

export async function readXtermAsciiCellCenter(
  terminal: Locator,
  input: { readonly column: number; readonly rowMarker: string }
): Promise<{ readonly row: number; readonly x: number; readonly y: number }> {
  await ensureTerminalDomRenderer(terminal)
  await terminal.locator('.xterm-rows > div').filter({ hasText: input.rowMarker }).first().waitFor()
  return terminal.evaluate((element, target) => {
    const rows = Array.from(element.querySelectorAll('.xterm-rows > div'))
    const row = rows.find((candidate) => candidate.textContent?.includes(target.rowMarker))

    if (!row) throw new Error(`Unable to find xterm row: ${target.rowMarker}`)
    const rowText = row.textContent ?? ''
    const characterOffset = target.column - 1
    const textNodes = Array.from(row.querySelectorAll('span'))
      .flatMap((span) => Array.from(span.childNodes))
      .filter((node) => node.nodeType === Node.TEXT_NODE)
    let remainingOffset = characterOffset
    let textNode: Node | null = null

    for (const candidate of textNodes) {
      const length = candidate.textContent?.length ?? 0

      if (remainingOffset < length) {
        textNode = candidate
        break
      }
      remainingOffset -= length
    }

    if (
      !textNode ||
      characterOffset < 0 ||
      remainingOffset < 0 ||
      remainingOffset >= (textNode.textContent?.length ?? 0)
    ) {
      throw new Error(`Unable to find xterm column ${target.column} in: ${rowText}`)
    }

    const range = document.createRange()
    range.setStart(textNode, remainingOffset)
    range.setEnd(textNode, remainingOffset + 1)
    const bounds = range.getBoundingClientRect()
    const rowBounds = row.getBoundingClientRect()

    return {
      row: rows.indexOf(row) + 1,
      x: bounds.left + bounds.width / 2,
      y: rowBounds.top + rowBounds.height / 2
    }
  }, input)
}

export async function ensureTerminalDomRenderer(terminal: Locator): Promise<void> {
  await terminal.evaluate(async (element) => {
    const terminalElement = element as HTMLElement
    const readRenderer = (): string | undefined => terminalElement.dataset.terminalRenderer
    if (readRenderer() !== 'webgl') return

    for (const canvas of terminalElement.querySelectorAll('canvas')) {
      canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    }
    if (readRenderer() === 'dom') return

    await new Promise<void>((resolve, reject) => {
      const observer = new MutationObserver(() => {
        if (readRenderer() !== 'dom') return
        observer.disconnect()
        clearTimeout(timeout)
        resolve()
      })
      const timeout = setTimeout(() => {
        observer.disconnect()
        reject(new Error('Terminal did not fall back to the DOM renderer.'))
      }, 5_000)
      observer.observe(terminalElement, {
        attributeFilter: ['data-terminal-renderer'],
        attributes: true
      })
    })
  })
  await terminal.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
  )
}

export async function readXtermSelection(terminal: Locator): Promise<string> {
  return terminal.locator('.xterm').evaluate((element) => {
    const clipboardData = new DataTransfer()

    element.dispatchEvent(
      new ClipboardEvent('copy', { bubbles: true, clipboardData, cancelable: true })
    )
    return clipboardData.getData('text/plain')
  })
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
