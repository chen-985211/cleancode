// @vitest-environment node

import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import {
  _electron as electron,
  type ElectronApplication,
  type Locator,
  type Page
} from 'playwright'

const execFileAsync = promisify(execFile)
const electronBuildTimeoutMs = 45_000
const electronLaunchTimeoutMs = 30_000
const electronScenarioTimeoutMs = 60_000

describe('minimap e2e', () => {
  let projectDirectory: string
  let registryDirectory: string
  let appStateDirectory: string
  let electronApp: ElectronApplication
  let page: Page

  beforeAll(async () => {
    await execFileAsync('pnpm', ['exec', 'electron-vite', 'build'], {
      cwd: process.cwd()
    })
  }, electronBuildTimeoutMs)

  beforeEach(async () => {
    projectDirectory = await mkdtemp(join(tmpdir(), 'cleancode-minimap-project-'))
    registryDirectory = await mkdtemp(join(tmpdir(), 'cleancode-minimap-registry-'))
    appStateDirectory = await mkdtemp(join(tmpdir(), 'cleancode-minimap-state-'))
    electronApp = await launchApp(projectDirectory, registryDirectory, appStateDirectory)
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
  }, electronLaunchTimeoutMs)

  afterEach(async () => {
    await electronApp.close()
    await rm(projectDirectory, { recursive: true, force: true })
    await rm(registryDirectory, { recursive: true, force: true })
    await rm(appStateDirectory, { recursive: true, force: true })
  })

  it(
    'centers the focused terminal and keeps controls outside the map area',
    async () => {
      await expectDesktopRuntime(page)

      await page.getByRole('button', { name: '添加项目' }).click()
      await page.getByRole('button', { name: '新建终端积木' }).click()
      await page.getByText('Terminal 1').waitFor()
      await page.getByRole('button', { name: '新建终端积木' }).click()
      await page.getByText('Terminal 2').waitFor()

      await focusMinimapTerminal(page, 'Terminal 1')
      await expectMinimapTerminalIsCentered(page, 'Terminal 1')
      await expectMinimapLayoutIsBalanced(page)
      await expectMinimapCanCollapseFromControls(page)
    },
    electronScenarioTimeoutMs
  )

  it(
    'moves the canvas viewport when the minimap is clicked or dragged',
    async () => {
      await expectDesktopRuntime(page)

      await page.getByRole('button', { name: '添加项目' }).click()
      await page.getByRole('button', { name: '新建终端积木' }).click()
      await page.getByText('Terminal 1').waitFor()

      const initialViewport = await readCanvasViewportTransform(page)

      await clickMinimapMapAtRatio(page, 0.82, 0.68)
      await page.waitForFunction((initial) => {
        const viewport = document.querySelector('.react-flow__viewport')

        if (!(viewport instanceof HTMLElement)) {
          return false
        }

        const matrix = new DOMMatrixReadOnly(getComputedStyle(viewport).transform)

        return Math.hypot(matrix.m41 - initial.x, matrix.m42 - initial.y) > 24
      }, initialViewport)

      const viewportAfterClick = await readCanvasViewportTransform(page)

      await dragMinimapMapBetweenRatios(page, { x: 0.82, y: 0.74 }, { x: 0.18, y: 0.28 })
      await page.waitForFunction((afterClick) => {
        const viewport = document.querySelector('.react-flow__viewport')

        if (!(viewport instanceof HTMLElement)) {
          return false
        }

        const matrix = new DOMMatrixReadOnly(getComputedStyle(viewport).transform)

        return Math.hypot(matrix.m41 - afterClick.x, matrix.m42 - afterClick.y) > 24
      }, viewportAfterClick)
    },
    electronScenarioTimeoutMs
  )
})

async function launchApp(
  projectDirectory: string,
  registryDirectory: string,
  appStateDirectory: string
): Promise<ElectronApplication> {
  return electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      CLEANCODE_TEST_PROJECT_DIRECTORY: projectDirectory,
      CLEANCODE_TEST_APP_STATE_DIRECTORY: appStateDirectory,
      CLEANCODE_TEST_PROJECT_REGISTRY_PATH: join(registryDirectory, 'project-registry.json')
    }
  })
}

async function expectDesktopRuntime(page: Page): Promise<void> {
  const runtimeState = await page.evaluate(() => ({
    hasCleancodeApi: Boolean(window.cleancode),
    hasPreviewWarning: document.body.textContent?.includes('浏览器预览模式') ?? false
  }))

  expect(runtimeState).toEqual({
    hasCleancodeApi: true,
    hasPreviewWarning: false
  })
}

async function focusMinimapTerminal(page: Page, terminalName: string): Promise<void> {
  const minimapTerminal = page.locator(`[aria-label="聚焦终端 ${terminalName}"]`)

  await minimapTerminal.waitFor()
  await clickLocatorCenter(page, minimapTerminal.locator('.canvas-minimap__node-screen'))
  await page.waitForFunction(
    (label) =>
      document
        .querySelector(`[aria-label="${label}"]`)
        ?.classList.contains('canvas-minimap__node--selected') ?? false,
    `聚焦终端 ${terminalName}`
  )
}

async function expectMinimapTerminalIsCentered(page: Page, terminalName: string): Promise<void> {
  const geometry = await page.evaluate((label) => {
    const nodeScreen = document.querySelector(
      `[aria-label="${label}"] .canvas-minimap__node-screen`
    )
    const map = document.querySelector('.canvas-minimap__map')

    if (!(nodeScreen instanceof SVGGraphicsElement) || !(map instanceof SVGSVGElement)) {
      return null
    }

    const nodeRect = nodeScreen.getBoundingClientRect()
    const mapRect = map.getBoundingClientRect()

    return {
      nodeCenterX: nodeRect.left + nodeRect.width / 2,
      nodeCenterY: nodeRect.top + nodeRect.height / 2,
      mapCenterX: mapRect.left + mapRect.width / 2,
      mapCenterY: mapRect.top + mapRect.height / 2
    }
  }, `聚焦终端 ${terminalName}`)

  expect(geometry).not.toBeNull()
  expect(Math.abs(geometry!.nodeCenterX - geometry!.mapCenterX)).toBeLessThan(12)
  expect(Math.abs(geometry!.nodeCenterY - geometry!.mapCenterY)).toBeLessThan(12)
}

async function expectMinimapLayoutIsBalanced(page: Page): Promise<void> {
  const geometry = await page.evaluate(() => {
    const panel = document.querySelector('.canvas-minimap__panel')
    const mapFrame = document.querySelector('.canvas-minimap__map-frame')
    const map = document.querySelector('.canvas-minimap__map')
    const controls = document.querySelector('.canvas-minimap__controls')
    const header = document.querySelector('.canvas-minimap__header')
    const collapseButton = document.querySelector('[aria-label="收起小地图"]')

    if (
      !(panel instanceof HTMLElement) ||
      !(mapFrame instanceof HTMLElement) ||
      !(map instanceof SVGSVGElement) ||
      !(controls instanceof HTMLElement) ||
      !(collapseButton instanceof HTMLElement)
    ) {
      return null
    }

    const panelRect = panel.getBoundingClientRect()
    const mapFrameRect = mapFrame.getBoundingClientRect()
    const mapRect = map.getBoundingClientRect()
    const controlsRect = controls.getBoundingClientRect()
    const mapFrameBorder = getComputedStyle(mapFrame).borderTopWidth
    const controlsStyle = getComputedStyle(controls)
    const viewportFrame = document.querySelector('.canvas-minimap__viewport-frame')

    if (!(viewportFrame instanceof SVGElement)) {
      return null
    }

    const viewportFrameStyle = getComputedStyle(viewportFrame)
    const parseAlpha = (color: string): number => {
      const rgbaMatch = color.match(/rgba?\((.+)\)/)

      if (!rgbaMatch) {
        return color === 'transparent' ? 0 : 1
      }

      const channels = rgbaMatch[1]!.split(',').map((channel) => channel.trim())
      const alpha = Number.parseFloat(channels[3] ?? '1')

      return Number.isFinite(alpha) ? alpha : 1
    }

    return {
      hasHeader: Boolean(header),
      collapseButtonInsideControls: controls.contains(collapseButton),
      panelRight: panelRect.right,
      panelCenterY: panelRect.top + panelRect.height / 2,
      panelRatio: panelRect.width / panelRect.height,
      mapFrameBorderWidth: Number.parseFloat(mapFrameBorder),
      mapFrameHeight: mapFrameRect.height,
      mapFrameLeft: mapFrameRect.left,
      mapFrameRight: mapFrameRect.right,
      mapFrameRatio: mapFrameRect.width / mapFrameRect.height,
      mapLeft: mapRect.left,
      mapRight: mapRect.right,
      controlsLeft: controlsRect.left,
      controlsCenterY: controlsRect.top + controlsRect.height / 2,
      controlsWidth: controlsRect.width,
      controlsHeight: controlsRect.height,
      controlsBackgroundAlpha: parseAlpha(controlsStyle.backgroundColor),
      controlsBoxShadow: controlsStyle.boxShadow,
      viewportStrokeAlpha: parseAlpha(viewportFrameStyle.stroke),
      viewportStrokeWidth: Number.parseFloat(viewportFrameStyle.strokeWidth)
    }
  })

  expect(geometry).not.toBeNull()
  expect(geometry!.hasHeader).toBe(false)
  expect(geometry!.collapseButtonInsideControls).toBe(true)
  expect(geometry!.controlsLeft).toBeGreaterThanOrEqual(geometry!.panelRight + 8)
  expect(Math.abs(geometry!.controlsCenterY - geometry!.panelCenterY)).toBeLessThan(18)
  expect(geometry!.controlsHeight).toBeGreaterThan(geometry!.controlsWidth)
  expect(geometry!.controlsBackgroundAlpha).toBeLessThanOrEqual(0.72)
  expect(geometry!.controlsBoxShadow).toBe('none')
  expect(geometry!.panelRatio).toBeGreaterThan(1.55)
  expect(geometry!.mapFrameRatio).toBeGreaterThan(1.6)
  expect(geometry!.mapFrameHeight).toBeGreaterThanOrEqual(148)
  expect(geometry!.mapFrameBorderWidth).toBeGreaterThanOrEqual(1)
  expect(geometry!.viewportStrokeAlpha).toBeGreaterThanOrEqual(0.28)
  expect(geometry!.viewportStrokeWidth).toBeGreaterThanOrEqual(1.3)
  expect(geometry!.mapFrameLeft).toBeLessThanOrEqual(geometry!.mapLeft)
  expect(geometry!.mapFrameRight).toBeGreaterThanOrEqual(geometry!.mapRight)
}

async function expectMinimapCanCollapseFromControls(page: Page): Promise<void> {
  await page.getByRole('button', { name: '收起小地图' }).click()
  await page.locator('.canvas-minimap__panel').waitFor({ state: 'detached' })
  await page.getByRole('button', { name: '展开小地图' }).waitFor()

  await page.getByRole('button', { name: '展开小地图' }).click()
  await page.locator('.canvas-minimap__map-frame').waitFor({ state: 'visible' })
  await page.getByRole('button', { name: '收起小地图' }).waitFor()
}

async function clickMinimapMapAtRatio(page: Page, xRatio: number, yRatio: number): Promise<void> {
  const mapBox = await page.locator('.canvas-minimap__map').boundingBox()

  expect(mapBox).not.toBeNull()

  await page.mouse.click(mapBox!.x + mapBox!.width * xRatio, mapBox!.y + mapBox!.height * yRatio)
}

async function dragMinimapMapBetweenRatios(
  page: Page,
  start: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number }
): Promise<void> {
  const mapBox = await page.locator('.canvas-minimap__map').boundingBox()

  expect(mapBox).not.toBeNull()

  await page.mouse.move(mapBox!.x + mapBox!.width * start.x, mapBox!.y + mapBox!.height * start.y)
  await page.mouse.down()
  await page.mouse.move(mapBox!.x + mapBox!.width * end.x, mapBox!.y + mapBox!.height * end.y, {
    steps: 5
  })
  await page.mouse.up()
}

async function readCanvasViewportTransform(
  page: Page
): Promise<{ readonly x: number; readonly y: number; readonly zoom: number }> {
  const viewport = await page.evaluate(() => {
    const element = document.querySelector('.react-flow__viewport')

    if (!(element instanceof HTMLElement)) {
      return null
    }

    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform)

    return {
      x: matrix.m41,
      y: matrix.m42,
      zoom: matrix.a
    }
  })

  expect(viewport).not.toBeNull()

  return viewport!
}

async function clickLocatorCenter(page: Page, locator: Locator): Promise<void> {
  await locator.waitFor({ state: 'visible' })
  const boundingBox = await locator.boundingBox()

  expect(boundingBox).not.toBeNull()

  await page.mouse.click(
    boundingBox!.x + boundingBox!.width / 2,
    boundingBox!.y + boundingBox!.height / 2
  )
}
