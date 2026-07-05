// @vitest-environment node

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
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

interface CanvasViewport {
  readonly x: number
  readonly y: number
  readonly zoom: number
}

describe('canvas viewport e2e', () => {
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
    projectDirectory = await mkdtemp(join(tmpdir(), 'cleancode-viewport-project-'))
    registryDirectory = await mkdtemp(join(tmpdir(), 'cleancode-viewport-registry-'))
    appStateDirectory = await mkdtemp(join(tmpdir(), 'cleancode-viewport-state-'))
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
    'restores the canvas pan and zoom after the app restarts',
    async () => {
      await page.getByRole('button', { name: '添加项目' }).click()
      await page.getByRole('button', { name: '新建终端积木' }).click()
      await page.getByText('Terminal 1').waitFor()

      await page.locator('.react-flow__controls-zoomin').click()
      const zoomedViewport = await waitForZoom(page)

      await dragPaneFromFreePoint(page, page.locator('.react-flow__pane'), -150, 95)
      const draggedViewport = await waitForViewportDelta(page, zoomedViewport)
      const savedViewport = await waitForSavedViewport(appStateDirectory, draggedViewport)

      expect(Math.abs(draggedViewport.x - zoomedViewport.x)).toBeGreaterThan(80)
      expect(Math.abs(draggedViewport.y - zoomedViewport.y)).toBeGreaterThan(40)
      expect(Math.abs(savedViewport.x - draggedViewport.x)).toBeLessThan(3)
      expect(Math.abs(savedViewport.y - draggedViewport.y)).toBeLessThan(3)
      expect(savedViewport.zoom).toBeGreaterThan(1)

      await electronApp.close()
      electronApp = await launchApp(projectDirectory, registryDirectory, appStateDirectory)
      page = await electronApp.firstWindow()
      await page.waitForLoadState('domcontentloaded')
      await page.getByRole('button', { name: basename(projectDirectory) }).waitFor()
      await page.getByText('Terminal 1').waitFor()
      await page.waitForFunction((expectedViewport) => {
        const viewportElement = document.querySelector('.react-flow__viewport')

        if (!(viewportElement instanceof HTMLElement)) {
          return false
        }

        const transform = window.getComputedStyle(viewportElement).transform
        const matrix =
          transform === 'none' ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(transform)
        const viewport = { x: matrix.e, y: matrix.f, zoom: matrix.a }

        return (
          Math.abs(viewport.x - expectedViewport.x) < 3 &&
          Math.abs(viewport.y - expectedViewport.y) < 3 &&
          Math.abs(viewport.zoom - expectedViewport.zoom) < 0.02
        )
      }, savedViewport)

      const restoredViewport = await readCanvasViewportFromPage(page)

      expect(Math.abs(restoredViewport.x - savedViewport.x)).toBeLessThan(3)
      expect(Math.abs(restoredViewport.y - savedViewport.y)).toBeLessThan(3)
      expect(Math.abs(restoredViewport.zoom - savedViewport.zoom)).toBeLessThan(0.02)
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

async function readOnlyJsonFile(directory: string, fileName: string): Promise<string> {
  const matches = await findFilesNamed(directory, fileName)

  expect(matches).toHaveLength(1)

  return readFile(matches[0]!, 'utf8')
}

async function waitForSavedViewport(
  appStateDirectory: string,
  expectedViewport: CanvasViewport
): Promise<CanvasViewport> {
  const startedAt = Date.now()
  let lastViewport: CanvasViewport | null = null

  while (Date.now() - startedAt < 5_000) {
    const graph = JSON.parse(await readOnlyJsonFile(appStateDirectory, 'default-graph.json')) as {
      viewport?: CanvasViewport
    }

    lastViewport = graph.viewport ?? null

    if (
      lastViewport &&
      Math.abs(lastViewport.x - expectedViewport.x) < 3 &&
      Math.abs(lastViewport.y - expectedViewport.y) < 3 &&
      Math.abs(lastViewport.zoom - expectedViewport.zoom) < 0.02
    ) {
      return lastViewport
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error(`Canvas viewport was not saved after drag: ${JSON.stringify(lastViewport)}`)
}

async function findFilesNamed(directory: string, fileName: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const matches: string[] = []

  for (const entry of entries) {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      matches.push(...(await findFilesNamed(path, fileName)))
      continue
    }

    if (entry.isFile() && entry.name === fileName) {
      matches.push(path)
    }
  }

  return matches
}

async function dragPaneFromFreePoint(
  page: Page,
  locator: Locator,
  deltaX: number,
  deltaY: number
): Promise<void> {
  await locator.waitFor({ state: 'visible' })
  const boundingBox = await locator.boundingBox()

  expect(boundingBox).not.toBeNull()

  const startPoint = await page.evaluate((box) => {
    const candidates = [
      { x: box.x + box.width - 120, y: box.y + 120 },
      { x: box.x + box.width - 80, y: box.y + 80 },
      { x: box.x + box.width - 160, y: box.y + 180 },
      { x: box.x + 100, y: box.y + 100 }
    ]

    return (
      candidates.find((point) => {
        const element = document.elementFromPoint(point.x, point.y)

        return element instanceof HTMLElement && element.classList.contains('react-flow__pane')
      }) ?? null
    )
  }, boundingBox!)

  expect(startPoint).not.toBeNull()

  await page.mouse.move(startPoint!.x, startPoint!.y)
  await page.mouse.down()
  await page.mouse.move(startPoint!.x + deltaX, startPoint!.y + deltaY, { steps: 10 })
  await page.mouse.up()
}

async function waitForZoom(page: Page): Promise<CanvasViewport> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < 5_000) {
    const viewport = await readCanvasViewportFromPage(page)

    if (viewport.zoom > 1.1) {
      return viewport
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error('Canvas zoom did not change after clicking the zoom control.')
}

async function waitForViewportDelta(
  page: Page,
  previousViewport: CanvasViewport
): Promise<CanvasViewport> {
  const startedAt = Date.now()
  let lastViewport: CanvasViewport = previousViewport

  while (Date.now() - startedAt < 5_000) {
    lastViewport = await readCanvasViewportFromPage(page)

    if (
      Math.abs(lastViewport.x - previousViewport.x) > 80 &&
      Math.abs(lastViewport.y - previousViewport.y) > 40
    ) {
      return lastViewport
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error(`Canvas viewport did not move after drag: ${JSON.stringify(lastViewport)}`)
}

async function readCanvasViewportFromPage(page: Page): Promise<CanvasViewport> {
  return page.evaluate(readCanvasViewportFromDom)
}

function readCanvasViewportFromDom(): CanvasViewport {
  const viewportElement = document.querySelector('.react-flow__viewport')

  if (!(viewportElement instanceof HTMLElement)) {
    return { x: 0, y: 0, zoom: 1 }
  }

  const transform = window.getComputedStyle(viewportElement).transform

  if (transform === 'none') {
    return { x: 0, y: 0, zoom: 1 }
  }

  const matrix = new DOMMatrixReadOnly(transform)

  return { x: matrix.e, y: matrix.f, zoom: matrix.a }
}
