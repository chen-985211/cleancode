import { execFile } from 'node:child_process'
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
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

export const electronBuildTimeoutMs = 45_000
export const electronLaunchTimeoutMs = 30_000
export const electronScenarioTimeoutMs = 60_000

export interface E2eWorkbench {
  readonly projectDirectory: string
  readonly registryDirectory: string
  readonly appStateDirectory: string
}

export interface TerminalBlockRecord {
  readonly name: string
  readonly position: {
    readonly x: number
    readonly y: number
  }
  readonly size: {
    readonly width: number
    readonly height: number
  }
}

export async function buildElectronApp(): Promise<void> {
  await execFileAsync('pnpm', ['exec', 'electron-vite', 'build'], {
    cwd: process.cwd()
  })
}

export async function createE2eWorkbench(prefix: string): Promise<E2eWorkbench> {
  return {
    projectDirectory: await mkdtemp(join(tmpdir(), `${prefix}-project-`)),
    registryDirectory: await mkdtemp(join(tmpdir(), `${prefix}-registry-`)),
    appStateDirectory: await mkdtemp(join(tmpdir(), `${prefix}-state-`))
  }
}

export async function cleanupE2eWorkbench(workbench: E2eWorkbench): Promise<void> {
  await rm(workbench.projectDirectory, { recursive: true, force: true })
  await rm(workbench.registryDirectory, { recursive: true, force: true })
  await rm(workbench.appStateDirectory, { recursive: true, force: true })
}

export function launchApp(workbench: E2eWorkbench): Promise<ElectronApplication> {
  return electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      CLEANCODE_TEST_PROJECT_DIRECTORY: workbench.projectDirectory,
      CLEANCODE_TEST_APP_STATE_DIRECTORY: workbench.appStateDirectory,
      CLEANCODE_TEST_PROJECT_REGISTRY_PATH: join(
        workbench.registryDirectory,
        'project-registry.json'
      )
    }
  })
}

export async function readOnlyJsonFile(directory: string, fileName: string): Promise<string> {
  const matches = await findFilesNamed(directory, fileName)

  expect(matches).toHaveLength(1)

  return readFile(matches[0]!, 'utf8')
}

export async function waitForJsonFile(directory: string, fileName: string): Promise<string> {
  const deadline = Date.now() + 5_000

  while (Date.now() < deadline) {
    const matches = await findFilesNamed(directory, fileName)

    if (matches.length === 1) {
      return readFile(matches[0]!, 'utf8')
    }

    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  return readOnlyJsonFile(directory, fileName)
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function expectDesktopRuntime(page: Page): Promise<void> {
  const runtimeState = await page.evaluate(() => ({
    hasCleancodeApi: Boolean(window.cleancode),
    hasPreviewWarning: document.body.textContent?.includes('浏览器预览模式') ?? false
  }))

  expect(runtimeState).toEqual({
    hasCleancodeApi: true,
    hasPreviewWarning: false
  })
}

export async function expectNoOpenProjectButton(page: Page): Promise<void> {
  expect(await page.getByRole('button', { name: '打开项目' }).count()).toBe(0)
}

export async function expectSingleWorkbenchToolbarAction(page: Page): Promise<void> {
  const toolbar = page.locator('.app-shell__toolbar')

  expect(await toolbar.getByRole('button').count()).toBe(2)
  await toolbar.getByRole('button', { name: '新建终端积木' }).waitFor()
  await toolbar.getByRole('button', { name: '组合终端' }).waitFor()
}

export async function expectNoFakeRuntimeData(page: Page): Promise<void> {
  expect(await page.getByText('添加数据库终端').count()).toBe(0)
  expect(await page.getByText('添加测试终端').count()).toBe(0)
  expect(await page.getByText('本地 Agent 入口已预留。').count()).toBe(0)
  expect(await page.getByText('Codex').count()).toBe(0)
  expect(await page.getByText('待接入').count()).toBe(0)
  expect(await page.getByText('empty-project').count()).toBe(0)
  expect(await page.getByText('empty-graph').count()).toBe(0)
}

export async function expectTerminalLooksLikePlainShell(page: Page): Promise<void> {
  const terminalNode = page.locator('.terminal-node')

  await terminalNode.waitFor()
  expect(await terminalNode.locator('.terminal-frame').count()).toBe(1)
  expect(await terminalNode.locator('.terminal-command-line').count()).toBe(0)
  expect(await terminalNode.getByLabel('Terminal 1 命令输入').count()).toBe(0)
  await terminalNode.getByRole('button', { name: 'Terminal 1 编辑终端信息' }).waitFor()
  await terminalNode.getByRole('button', { name: 'Terminal 1 停止当前命令' }).waitFor()
  await terminalNode.getByRole('button', { name: 'Terminal 1 重启终端' }).waitFor()
  await terminalNode.getByRole('button', { name: 'Terminal 1 删除终端' }).waitFor()
  expect(await terminalNode.locator('.terminal-output-mirror').count()).toBe(0)
  expect(await terminalNode.locator('[data-terminal-output-tail="true"]').count()).toBe(1)
  expect(await terminalNode.locator('.terminal-frame__bar').count()).toBe(0)
  expect(await terminalNode.locator('.terminal-node__footer').count()).toBe(0)
  expect(await terminalNode.getByText('start shell').count()).toBe(0)
  expect(await terminalNode.getByText('按 Enter').count()).toBe(0)
}

export async function expectNewTerminalIsFocused(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document.querySelector('.terminal-node')?.classList.contains('terminal-node--selected') ??
      false
  )
  await waitForTerminalViewportHitTarget(page)
}

export async function expectMinimapCanFocusTerminal(
  page: Page,
  terminalName: string
): Promise<void> {
  const minimapTerminal = page.locator(`[aria-label="聚焦终端 ${terminalName}"]`)

  await minimapTerminal.waitFor()
  await hoverLocatorCenter(page, minimapTerminal.locator('.canvas-minimap__node-screen'))
  await page.waitForFunction(
    () =>
      document
        .querySelector('.terminal-node')
        ?.classList.contains('terminal-node--navigation-highlighted') ?? false
  )
  await clickLocatorCenter(page, minimapTerminal.locator('.canvas-minimap__node-screen'))
  await page.waitForFunction(
    () =>
      document.querySelector('.terminal-node')?.classList.contains('terminal-node--selected') ??
      false
  )
  await page.waitForFunction(
    (label) =>
      document
        .querySelector(`[aria-label="${label}"]`)
        ?.classList.contains('canvas-minimap__node--selected') ?? false,
    `聚焦终端 ${terminalName}`
  )
  await waitForXtermHelperTextareaFocus(page)
  await waitForTerminalViewportHitTarget(page)
  await hoverLocatorCenter(page, selectedTerminalViewport(page))
  await page.waitForTimeout(120)
  await expectTerminalNotNavigationHighlighted(page)
}

export function expectTerminalBlocksDoNotOverlap(blocks: TerminalBlockRecord[]): void {
  const overlappingPairs: string[] = []

  for (let leftIndex = 0; leftIndex < blocks.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < blocks.length; rightIndex += 1) {
      const leftBlock = blocks[leftIndex]!
      const rightBlock = blocks[rightIndex]!

      if (terminalBlocksOverlap(leftBlock, rightBlock)) {
        overlappingPairs.push(`${leftBlock.name} overlaps ${rightBlock.name}`)
      }
    }
  }

  expect(overlappingPairs).toEqual([])
}

export async function focusSelectedTerminalViewport(page: Page): Promise<void> {
  const isAlreadyFocused = await isSelectedXtermHelperTextareaFocused(page)
  if (isAlreadyFocused) {
    return
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await waitForTerminalViewportHitTarget(page)
    await clickLocatorCenter(page, selectedTerminalViewport(page))
    await focusSelectedXtermHelperTextarea(page)

    if (await isSelectedXtermHelperTextareaFocused(page)) {
      return
    }

    await page.waitForTimeout(120)
  }

  await waitForXtermHelperTextareaFocus(page)
}

export async function typeTerminalCommand(page: Page, command: string): Promise<void> {
  await focusSelectedTerminalViewport(page)
  await page.keyboard.type(command)
  await page.waitForTimeout(30)
  await page.keyboard.press('Enter')
}

export async function clickLocatorCenter(page: Page, locator: Locator): Promise<void> {
  await locator.waitFor({ state: 'visible' })
  const boundingBox = await locator.boundingBox()

  expect(boundingBox).not.toBeNull()

  await page.mouse.click(
    boundingBox!.x + boundingBox!.width / 2,
    boundingBox!.y + boundingBox!.height / 2
  )
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

async function expectTerminalNotNavigationHighlighted(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      !(
        document
          .querySelector('.terminal-node')
          ?.classList.contains('terminal-node--navigation-highlighted') ?? false
      )
  )
}

async function waitForTerminalViewportHitTarget(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const terminalViewport = document.querySelector('.terminal-node--selected .terminal-viewport')

    if (!(terminalViewport instanceof HTMLElement)) {
      return false
    }

    const rect = terminalViewport.getBoundingClientRect()

    if (rect.width <= 0 || rect.height <= 0) {
      return false
    }

    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2

    return document
      .elementsFromPoint(centerX, centerY)
      .some((element) => element === terminalViewport || terminalViewport.contains(element))
  })
}

async function waitForXtermHelperTextareaFocus(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document
        .querySelector('.terminal-node--selected .xterm-helper-textarea')
        ?.isSameNode(document.activeElement) ?? false
  )
}

async function isSelectedXtermHelperTextareaFocused(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      document
        .querySelector('.terminal-node--selected .xterm-helper-textarea')
        ?.isSameNode(document.activeElement) ?? false
  )
}

async function focusSelectedXtermHelperTextarea(page: Page): Promise<void> {
  const helperTextarea = page.locator('.terminal-node--selected .xterm-helper-textarea')

  if ((await helperTextarea.count()) === 0) {
    return
  }

  await helperTextarea.evaluate((element) => {
    if (element instanceof HTMLElement) {
      element.focus()
    }
  })
}

function selectedTerminalViewport(page: Page) {
  return page.locator('.terminal-node--selected .terminal-viewport')
}

async function hoverLocatorCenter(page: Page, locator: Locator): Promise<void> {
  await locator.waitFor({ state: 'visible' })
  const boundingBox = await locator.boundingBox()

  expect(boundingBox).not.toBeNull()

  await page.mouse.move(
    boundingBox!.x + boundingBox!.width / 2,
    boundingBox!.y + boundingBox!.height / 2
  )
}

function terminalBlocksOverlap(leftBlock: TerminalBlockRecord, rightBlock: TerminalBlockRecord) {
  return (
    leftBlock.position.x < rightBlock.position.x + rightBlock.size.width &&
    leftBlock.position.x + leftBlock.size.width > rightBlock.position.x &&
    leftBlock.position.y < rightBlock.position.y + rightBlock.size.height &&
    leftBlock.position.y + leftBlock.size.height > rightBlock.position.y
  )
}
