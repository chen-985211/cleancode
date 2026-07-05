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

describe('terminal block resize e2e', () => {
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
    projectDirectory = await mkdtemp(join(tmpdir(), 'cleancode-resize-project-'))
    registryDirectory = await mkdtemp(join(tmpdir(), 'cleancode-resize-registry-'))
    appStateDirectory = await mkdtemp(join(tmpdir(), 'cleancode-resize-state-'))
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
    'resizes terminal blocks, persists the size, and keeps terminal text inset from the frame',
    async () => {
      await page.getByRole('button', { name: '添加项目' }).click()
      await page.getByRole('button', { name: '新建终端积木' }).click()
      await page.getByText('Terminal 1').waitFor()

      const terminalNode = page.locator('.terminal-node')

      await clickLocatorCenter(page, terminalNode)
      const initialBox = await requireBoundingBox(terminalNode)
      const resizeHandle = terminalNode.locator('.terminal-node__resize-handle').last()

      await resizeHandle.waitFor({ state: 'visible' })
      await dragLocatorCenter(page, resizeHandle, 180, 110)
      await page.waitForFunction(
        ([initialWidth, initialHeight]) => {
          const terminal = document.querySelector('.terminal-node')

          if (!(terminal instanceof HTMLElement)) {
            return false
          }

          const rect = terminal.getBoundingClientRect()

          return rect.width > initialWidth + 100 && rect.height > initialHeight + 60
        },
        [initialBox.width, initialBox.height]
      )

      const resizedBox = await requireBoundingBox(terminalNode)
      const savedGraph = JSON.parse(
        await readOnlyJsonFile(appStateDirectory, 'default-graph.json')
      ) as {
        blocks: Array<{ size: { width: number; height: number } }>
      }
      const terminalInsets = await getTerminalInsets(page)

      expect(savedGraph.blocks[0]?.size.width).toBeGreaterThan(initialBox.width)
      expect(savedGraph.blocks[0]?.size.height).toBeGreaterThan(initialBox.height)
      expect(Math.abs(savedGraph.blocks[0]!.size.width - resizedBox.width)).toBeLessThanOrEqual(2)
      expect(Math.abs(savedGraph.blocks[0]!.size.height - resizedBox.height)).toBeLessThanOrEqual(2)
      expect(terminalInsets.viewportLeft).toBeGreaterThanOrEqual(6)
      expect(terminalInsets.viewportTop).toBeGreaterThanOrEqual(6)

      await electronApp.close()
      electronApp = await launchApp(projectDirectory, registryDirectory, appStateDirectory)
      page = await electronApp.firstWindow()
      await page.waitForLoadState('domcontentloaded')
      await page.getByRole('button', { name: basename(projectDirectory) }).waitFor()
      await page.getByText('Terminal 1').waitFor()

      const restoredBox = await requireBoundingBox(page.locator('.terminal-node'))

      expect(Math.abs(restoredBox.width - savedGraph.blocks[0]!.size.width)).toBeLessThanOrEqual(2)
      expect(Math.abs(restoredBox.height - savedGraph.blocks[0]!.size.height)).toBeLessThanOrEqual(
        2
      )
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

async function requireBoundingBox(locator: Locator) {
  await locator.waitFor({ state: 'visible' })
  const boundingBox = await locator.boundingBox()

  expect(boundingBox).not.toBeNull()

  return boundingBox!
}

async function clickLocatorCenter(page: Page, locator: Locator): Promise<void> {
  const boundingBox = await requireBoundingBox(locator)

  await page.mouse.click(
    boundingBox.x + boundingBox.width / 2,
    boundingBox.y + boundingBox.height / 2
  )
}

async function dragLocatorCenter(
  page: Page,
  locator: Locator,
  deltaX: number,
  deltaY: number
): Promise<void> {
  const boundingBox = await requireBoundingBox(locator)
  const startX = boundingBox.x + boundingBox.width / 2
  const startY = boundingBox.y + boundingBox.height / 2

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 8 })
  await page.mouse.up()
}

async function getTerminalInsets(
  page: Page
): Promise<{ viewportLeft: number; viewportTop: number }> {
  return page.evaluate(() => {
    const frame = document.querySelector('.terminal-frame')
    const viewport = document.querySelector('.terminal-viewport')

    if (!(frame instanceof HTMLElement) || !(viewport instanceof HTMLElement)) {
      return { viewportLeft: 0, viewportTop: 0 }
    }

    const frameRect = frame.getBoundingClientRect()
    const viewportRect = viewport.getBoundingClientRect()

    return {
      viewportLeft: viewportRect.left - frameRect.left,
      viewportTop: viewportRect.top - frameRect.top
    }
  })
}
