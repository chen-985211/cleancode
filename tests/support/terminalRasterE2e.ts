import type { Locator, Page } from 'playwright'

export interface XtermRasterProjection {
  readonly backingDensity: number
  readonly backingWidth: number
  readonly devicePixelRatio: number
  readonly displayWidth: number
  readonly rasterScale: number
  readonly renderer: string
  readonly zoom: number
}

export function waitForXtermPaint(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
  )
}

export async function readXtermInkRatio(page: Page, terminal: Locator): Promise<number> {
  const screen = terminal.locator('.xterm-screen')
  await screen.waitFor({ state: 'visible' })
  const screenshot = await screen.screenshot()

  return page.evaluate(async (base64Png) => {
    const image = new Image()
    image.src = `data:image/png;base64,${base64Png}`
    await image.decode()

    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Unable to sample the terminal raster screenshot.')
    context.drawImage(image, 0, 0)

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    const histogram = new Map<number, number>()
    for (let index = 0; index < pixels.length; index += 4) {
      const key =
        (Math.floor(pixels[index]! / 16) << 8) |
        (Math.floor(pixels[index + 1]! / 16) << 4) |
        Math.floor(pixels[index + 2]! / 16)
      histogram.set(key, (histogram.get(key) ?? 0) + 1)
    }
    const backgroundKey = [...histogram.entries()].reduce(
      (current, entry) => (entry[1] > current[1] ? entry : current),
      [0, 0]
    )[0]
    const background = {
      blue: (backgroundKey & 0x0f) * 16,
      green: ((backgroundKey >> 4) & 0x0f) * 16,
      red: ((backgroundKey >> 8) & 0x0f) * 16
    }
    let inkPixels = 0
    for (let index = 0; index < pixels.length; index += 4) {
      const distance = Math.max(
        Math.abs(pixels[index]! - background.red),
        Math.abs(pixels[index + 1]! - background.green),
        Math.abs(pixels[index + 2]! - background.blue)
      )
      if (distance >= 24) inkPixels += 1
    }

    return inkPixels / (pixels.length / 4)
  }, screenshot.toString('base64'))
}

export function readXtermRasterProjection(
  terminal: Locator
): Promise<XtermRasterProjection | null> {
  return terminal.evaluate((element) => {
    const flowViewport = document.querySelector<HTMLElement>('.react-flow__viewport')
    const canvas = Array.from(element.querySelectorAll('canvas')).find((entry) =>
      entry.getContext('webgl2')
    )
    if (!flowViewport || !canvas) return null

    const displayWidth = canvas.getBoundingClientRect().width
    const zoom = new DOMMatrixReadOnly(getComputedStyle(flowViewport).transform).a
    if (displayWidth <= 0 || !Number.isFinite(zoom)) return null

    return {
      backingDensity: canvas.width / displayWidth,
      backingWidth: canvas.width,
      devicePixelRatio: window.devicePixelRatio,
      displayWidth,
      rasterScale: Number((element as HTMLElement).dataset.terminalRasterScale),
      renderer: (element as HTMLElement).dataset.terminalRenderer ?? '',
      zoom
    }
  })
}
