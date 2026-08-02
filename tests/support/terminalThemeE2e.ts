import type { Locator, Page } from 'playwright'
import { expect } from 'vitest'

import { pollUntilState } from './e2ePolling'

export async function expectTerminalPresentation(
  page: Page,
  viewport: Locator,
  visualTheme: 'dark' | 'light',
  shouldBeFiltered: boolean
): Promise<void> {
  const projection = viewport.locator('..')

  await waitForComputedFilterState(
    projection,
    false,
    'terminal projection filter to remain neutral'
  )
  await waitForComputedFilterState(
    viewport,
    shouldBeFiltered,
    'terminal viewport filter to match the source and application themes'
  )

  const luminance = await pollUntilState({
    description: `${visualTheme} terminal center luminance`,
    observe: () => readCenterLuminance(page, viewport),
    accept: (value) => (visualTheme === 'dark' ? value < 0.2 : value > 0.8),
    intervalMs: 100,
    timeoutMs: 5_000
  })

  if (visualTheme === 'dark') {
    expect(luminance).toBeLessThan(0.2)
  } else {
    expect(luminance).toBeGreaterThan(0.8)
  }
}

export async function expectProjectionColorContinuity(
  page: Page,
  projection: Locator,
  kind: 'agent' | 'terminal'
): Promise<void> {
  const content = projection
    .locator(':scope > .agent-terminal-viewport, :scope > .terminal-viewport')
    .first()
  await waitForComputedFilterState(content, true, `${kind} terminal content filter to activate`)
  expect(await projection.evaluate((element) => getComputedStyle(element).filter)).toBe('none')
  await pollUntilState({
    description: `${kind} terminal projection to fit inside the canvas`,
    observe: () =>
      projection.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        const canvasBounds = element.closest('.react-flow')?.getBoundingClientRect()
        return Boolean(
          canvasBounds &&
          bounds.left >= canvasBounds.left &&
          bounds.top >= canvasBounds.top &&
          bounds.right <= canvasBounds.right &&
          bounds.bottom <= canvasBounds.bottom
        )
      }),
    accept: Boolean,
    intervalMs: 50,
    timeoutMs: 5_000
  })

  const colors = await readProjectionColors(page, projection)
  const distances = {
    bottom: maximumColorDistance(colors.content, colors.bottom),
    left: maximumColorDistance(colors.content, colors.left),
    top: maximumColorDistance(colors.content, colors.top)
  }
  const message = `${kind} projection colors: ${JSON.stringify(colors)}`
  expect(distances.bottom, message).toBeLessThanOrEqual(2)
  expect(distances.left, message).toBeLessThanOrEqual(2)
  expect(distances.top, message).toBeLessThanOrEqual(2)
}

interface PixelColor {
  readonly blue: number
  readonly green: number
  readonly red: number
}

async function readProjectionColors(
  page: Page,
  projection: Locator
): Promise<{
  readonly bottom: PixelColor
  readonly content: PixelColor
  readonly left: PixelColor
  readonly top: PixelColor
}> {
  const geometry = await projection.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const content = element.firstElementChild
    if (!content) throw new Error('Terminal theme projection has no content.')
    const contentBounds = content.getBoundingClientRect()
    const leftInset = contentBounds.left - bounds.left
    const topInset = contentBounds.top - bounds.top
    const bottomInset = bounds.bottom - contentBounds.bottom

    return {
      cssHeight: bounds.height,
      cssWidth: bounds.width,
      sampleBottomY: bounds.height - bottomInset / 2,
      sampleContentX: contentBounds.right - bounds.left - 24,
      sampleContentY: contentBounds.top - bounds.top + contentBounds.height / 2,
      sampleLeftX: leftInset / 2,
      sampleTopY: topInset / 2
    }
  })
  const screenshot = await projection.screenshot()

  return page.evaluate(
    async ({
      base64Png,
      cssHeight,
      cssWidth,
      sampleBottomY,
      sampleContentX,
      sampleContentY,
      sampleLeftX,
      sampleTopY
    }) => {
      const image = new Image()
      image.src = `data:image/png;base64,${base64Png}`
      await image.decode()

      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Unable to sample terminal theme projection.')
      context.drawImage(image, 0, 0)

      const scaleX = canvas.width / cssWidth
      const scaleY = canvas.height / cssHeight
      const read = (cssX: number, cssY: number) => {
        const pixel = context.getImageData(
          Math.max(0, Math.min(canvas.width - 1, Math.round(cssX * scaleX))),
          Math.max(0, Math.min(canvas.height - 1, Math.round(cssY * scaleY))),
          1,
          1
        ).data
        return { blue: pixel[2]!, green: pixel[1]!, red: pixel[0]! }
      }

      return {
        bottom: read(sampleContentX, sampleBottomY),
        content: read(sampleContentX, sampleContentY),
        left: read(sampleLeftX, sampleContentY),
        top: read(sampleContentX, sampleTopY)
      }
    },
    {
      base64Png: screenshot.toString('base64'),
      ...geometry
    }
  )
}

function maximumColorDistance(left: PixelColor, right: PixelColor): number {
  return Math.max(
    Math.abs(left.red - right.red),
    Math.abs(left.green - right.green),
    Math.abs(left.blue - right.blue)
  )
}

async function readCenterLuminance(page: Page, viewport: Locator): Promise<number> {
  const screenshot = await viewport.screenshot()

  return page.evaluate(async (base64Png) => {
    const image = new Image()
    image.src = `data:image/png;base64,${base64Png}`
    await image.decode()

    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('Unable to create screenshot sampling context.')
    }

    context.drawImage(image, 0, 0)
    const sampleSize = 5
    const pixels = context.getImageData(
      Math.floor((canvas.width - sampleSize) / 2),
      Math.floor((canvas.height - sampleSize) / 2),
      sampleSize,
      sampleSize
    ).data
    let luminance = 0

    for (let index = 0; index < pixels.length; index += 4) {
      luminance +=
        (0.2126 * pixels[index]! + 0.7152 * pixels[index + 1]! + 0.0722 * pixels[index + 2]!) / 255
    }

    return luminance / (pixels.length / 4)
  }, screenshot.toString('base64'))
}

async function waitForComputedFilterState(
  locator: Locator,
  expected: boolean,
  description: string
): Promise<void> {
  const filtered = await pollUntilState({
    description,
    observe: () => locator.evaluate((element) => getComputedStyle(element).filter !== 'none'),
    accept: (value) => value === expected,
    intervalMs: 50,
    timeoutMs: 5_000
  })

  expect(filtered).toBe(expected)
}
