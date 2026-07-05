// @vitest-environment node

import { execFile } from 'node:child_process'
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
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

describe('first-stage workbench e2e', () => {
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
    projectDirectory = await mkdtemp(join(tmpdir(), 'cleancode-e2e-project-'))
    registryDirectory = await mkdtemp(join(tmpdir(), 'cleancode-e2e-registry-'))
    appStateDirectory = await mkdtemp(join(tmpdir(), 'cleancode-e2e-state-'))
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
    'adds a project, creates a terminal block, runs a shell command, and captures the result',
    async () => {
      await expectDesktopRuntime(page)

      await expectNoOpenProjectButton(page)
      await expectSingleWorkbenchToolbarAction(page)
      await expectNoFakeRuntimeData(page)
      await page.getByRole('button', { name: '添加项目' }).click()
      await page.getByRole('button', { name: '新建终端积木' }).click()
      await expectTerminalLooksLikePlainShell(page)
      await page.getByText('运行中').waitFor()
      await expectMinimapCanFocusTerminal(page, 'Terminal 1')
      await page.getByRole('button', { name: 'Terminal 1 编辑终端信息' }).click()
      await page.getByLabel('终端名称').fill('API Server')
      await page.getByLabel('终端描述').fill('Runs backend tasks')
      await page.getByRole('button', { name: '保存终端信息' }).click()
      await page.getByText('API Server').waitFor()
      await page.getByText('Runs backend tasks').waitFor()

      const editedGraph = JSON.parse(
        await readOnlyJsonFile(appStateDirectory, 'default-graph.json')
      ) as {
        blocks: Array<{ type: string; name: string; description: string }>
      }

      expect(editedGraph.blocks[0]).toMatchObject({
        type: 'terminal',
        name: 'API Server',
        description: 'Runs backend tasks'
      })
      await focusSelectedTerminalViewport(page)
      await page.keyboard.type('while true; do echo cleancode-loop; sleep 1; done')
      await page.keyboard.press('Enter')
      await page.waitForFunction(
        () =>
          document
            .querySelector('[aria-label="API Server 文本输出"]')
            ?.textContent?.includes('cleancode-loop') ?? false
      )
      await page.getByRole('button', { name: 'API Server 停止当前命令' }).click()
      expect(await page.getByText('已退出').count()).toBe(0)
      await focusSelectedTerminalViewport(page)
      await page.keyboard.type('printf "after-stop-ok\\n"')
      await page.keyboard.press('Enter')
      await page.waitForFunction(
        () =>
          document
            .querySelector('[aria-label="API Server 文本输出"]')
            ?.textContent?.includes('after-stop-ok') ?? false
      )
      await page.getByRole('button', { name: 'API Server 重启终端' }).click()
      await page.waitForTimeout(800)
      await page.getByText('运行中').waitFor()

      await waitForTerminalViewportHitTarget(page)
      await focusSelectedTerminalViewport(page)
      await page.keyboard.type('printf "cleancode-e2e-ok\\n"')
      await page.keyboard.press('Enter')
      await page.keyboard.type('pwd')
      await page.keyboard.press('Enter')
      const terminalOutput = page.getByLabel('API Server 文本输出')

      await terminalOutput.waitFor({ state: 'attached' })
      await page.waitForFunction(
        () =>
          document
            .querySelector('[aria-label="API Server 文本输出"]')
            ?.textContent?.includes('cleancode-e2e-ok') ?? false
      )
      await page.waitForFunction(
        (expectedDirectory) =>
          document
            .querySelector('[aria-label="API Server 文本输出"]')
            ?.textContent?.includes(expectedDirectory) ?? false,
        projectDirectory
      )
      await page.screenshot({
        fullPage: false,
        path: join(tmpdir(), 'cleancode-first-stage-e2e.png')
      })

      const projectMetadata = JSON.parse(
        await readOnlyJsonFile(appStateDirectory, 'project.json')
      ) as { name: string; workspaces: Array<{ name: string }> }
      const graph = JSON.parse(await readOnlyJsonFile(appStateDirectory, 'default-graph.json')) as {
        blocks: Array<{ type: string }>
      }

      expect(await pathExists(join(projectDirectory, '.cleancode'))).toBe(false)
      expect(projectMetadata.name).toBe(projectDirectory.split('/').at(-1))
      expect(projectMetadata.workspaces.map((workspace) => workspace.name)).toEqual(['main'])
      expect(graph.blocks).toHaveLength(1)
      expect(graph.blocks[0]?.type).toBe('terminal')
      expect(await terminalOutput.textContent()).toContain('cleancode-e2e-ok')
      expect(await terminalOutput.textContent()).toContain('after-stop-ok')
      expect(await terminalOutput.textContent()).toContain(projectDirectory)
      expect(await terminalOutput.textContent()).not.toMatch(/^%\r?\n/)
      expect(await terminalOutput.textContent()).not.toMatch(/^printf %/)
      await clickLocatorCenter(page, page.getByRole('button', { name: 'API Server 删除终端' }))
      await page.getByText('API Server').waitFor({ state: 'detached' })

      const graphAfterDelete = JSON.parse(
        await readOnlyJsonFile(appStateDirectory, 'default-graph.json')
      ) as {
        blocks: Array<{ type: string }>
      }

      expect(graphAfterDelete.blocks).toHaveLength(0)
    },
    electronScenarioTimeoutMs
  )

  it(
    'restores remembered projects and graphs after the app restarts',
    async () => {
      await expectDesktopRuntime(page)

      await page.getByRole('button', { name: '添加项目' }).click()
      await page.getByRole('button', { name: '新建终端积木' }).click()
      await page.getByText('Terminal 1').waitFor()

      await electronApp.close()
      electronApp = await launchApp(projectDirectory, registryDirectory, appStateDirectory)
      page = await electronApp.firstWindow()
      await page.waitForLoadState('domcontentloaded')
      await expectDesktopRuntime(page)

      await page.getByRole('button', { name: basename(projectDirectory) }).waitFor()
      await page.getByText('Terminal 1').waitFor()
      await page.screenshot({
        fullPage: false,
        path: join(tmpdir(), 'cleancode-restored-workbench-e2e.png')
      })
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

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function expectNoOpenProjectButton(page: Page): Promise<void> {
  expect(await page.getByRole('button', { name: '打开项目' }).count()).toBe(0)
}

async function expectSingleWorkbenchToolbarAction(page: Page): Promise<void> {
  const toolbar = page.locator('.app-shell__toolbar')

  expect(await toolbar.getByRole('button').count()).toBe(1)
  await toolbar.getByRole('button', { name: '新建终端积木' }).waitFor()
}

async function expectNoFakeRuntimeData(page: Page): Promise<void> {
  expect(await page.getByText('添加数据库终端').count()).toBe(0)
  expect(await page.getByText('添加测试终端').count()).toBe(0)
  expect(await page.getByText('本地 Agent 入口已预留。').count()).toBe(0)
  expect(await page.getByText('Codex').count()).toBe(0)
  expect(await page.getByText('待接入').count()).toBe(0)
  expect(await page.getByText('empty-project').count()).toBe(0)
  expect(await page.getByText('empty-graph').count()).toBe(0)
}

async function expectTerminalLooksLikePlainShell(page: Page): Promise<void> {
  const terminalNode = page.locator('.terminal-node')

  await terminalNode.waitFor()
  expect(await terminalNode.locator('.terminal-frame').count()).toBe(1)
  expect(await terminalNode.locator('.terminal-command-line').count()).toBe(0)
  expect(await terminalNode.getByLabel('Terminal 1 命令输入').count()).toBe(0)
  await terminalNode.getByRole('button', { name: 'Terminal 1 编辑终端信息' }).waitFor()
  await terminalNode.getByRole('button', { name: 'Terminal 1 停止当前命令' }).waitFor()
  await terminalNode.getByRole('button', { name: 'Terminal 1 重启终端' }).waitFor()
  await terminalNode.getByRole('button', { name: 'Terminal 1 删除终端' }).waitFor()
  expect(await terminalNode.locator('.terminal-frame__bar').count()).toBe(0)
  expect(await terminalNode.locator('.terminal-node__footer').count()).toBe(0)
  expect(await terminalNode.getByText('start shell').count()).toBe(0)
  expect(await terminalNode.getByText('按 Enter').count()).toBe(0)
}

async function expectMinimapCanFocusTerminal(page: Page, terminalName: string): Promise<void> {
  const minimapTerminal = page.locator(`[aria-label="聚焦终端 ${terminalName}"]`)

  await minimapTerminal.waitFor()
  await minimapTerminal.hover()
  await page.waitForFunction(
    () =>
      document
        .querySelector('.terminal-node')
        ?.classList.contains('terminal-node--navigation-highlighted') ?? false
  )
  await minimapTerminal.click()
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
  await page.waitForFunction(
    () => document.activeElement?.classList.contains('xterm-helper-textarea') ?? false
  )
  await waitForTerminalViewportHitTarget(page)
  await hoverLocatorCenter(page, selectedTerminalViewport(page))
  await page.waitForTimeout(120)
  await expectTerminalNotNavigationHighlighted(page)
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

function selectedTerminalViewport(page: Page) {
  return page.locator('.terminal-node--selected .terminal-viewport')
}

async function focusSelectedTerminalViewport(page: Page): Promise<void> {
  await waitForTerminalViewportHitTarget(page)
  await clickLocatorCenter(page, selectedTerminalViewport(page))
  await page.waitForFunction(
    () => document.activeElement?.classList.contains('xterm-helper-textarea') ?? false
  )
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

async function hoverLocatorCenter(page: Page, locator: Locator): Promise<void> {
  await locator.waitFor({ state: 'visible' })
  const boundingBox = await locator.boundingBox()

  expect(boundingBox).not.toBeNull()

  await page.mouse.move(
    boundingBox!.x + boundingBox!.width / 2,
    boundingBox!.y + boundingBox!.height / 2
  )
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
