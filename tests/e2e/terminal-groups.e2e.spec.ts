// @vitest-environment node

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const execFileAsync = promisify(execFile)
const electronBuildTimeoutMs = 45_000
const electronLaunchTimeoutMs = 30_000
const electronScenarioTimeoutMs = 60_000

interface TerminalGroupRecord {
  readonly name: string
  readonly isCollapsed: boolean
  readonly memberBlockIds: string[]
}

describe('terminal groups e2e', () => {
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
    projectDirectory = await mkdtemp(join(tmpdir(), 'cleancode-group-project-'))
    registryDirectory = await mkdtemp(join(tmpdir(), 'cleancode-group-registry-'))
    appStateDirectory = await mkdtemp(join(tmpdir(), 'cleancode-group-state-'))
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
    'binds terminal blocks into a persistent terminal group workflow',
    async () => {
      await page.getByRole('button', { name: '添加项目' }).click()

      for (let terminalIndex = 1; terminalIndex <= 3; terminalIndex += 1) {
        await page.getByRole('button', { name: '新建终端积木' }).click()
        await page.getByText(`Terminal ${terminalIndex}`).waitFor()
      }

      await page.getByRole('button', { name: '小地图适应' }).click()
      await page.getByRole('button', { name: '组合终端' }).click()
      await page.getByText('选择要组合的终端').waitFor()
      await page.getByRole('button', { name: 'Terminal 1 选择加入组合' }).click()
      await page.getByRole('button', { name: 'Terminal 2 选择加入组合' }).click()
      await page.getByRole('button', { name: '创建组合' }).click()
      await page.getByText('启动项目').waitFor()
      await expectGroupActionTooltipVisible(page, '启动项目', '折叠组合')

      await page.getByRole('button', { name: '启动项目 编辑组合名称' }).click()
      await page.getByRole('textbox', { name: '组合名称' }).fill('开发环境')
      await page.getByRole('button', { name: '保存组合名称' }).click()
      await page.getByText('开发环境').waitFor()

      await page.getByRole('button', { name: '小地图适应' }).click()
      await selectTerminalNode(page, 'Terminal 3')
      await page.getByRole('button', { name: '开发环境 添加选中终端' }).click()
      await page.getByRole('button', { name: '开发环境 折叠组合' }).click()
      await waitForTerminalNodeCount(page, 0)
      await expectGroupMembersStayInsideNode(page, '开发环境', 3)
      await page.getByRole('button', { name: '开发环境 展开组合' }).click()
      await waitForTerminalNodeCount(page, 3)

      await selectTerminalNode(page, 'Terminal 3')
      await page.getByRole('button', { name: '开发环境 移出选中终端' }).click()
      await page.getByRole('button', { name: '开发环境 折叠组合' }).click()
      await waitForTerminalNodeCount(page, 1)
      await page.getByRole('button', { name: '开发环境 展开组合' }).click()
      await waitForTerminalNodeCount(page, 3)

      const graph = JSON.parse(await readOnlyJsonFile(appStateDirectory, 'default-graph.json')) as {
        terminalGroups: TerminalGroupRecord[]
      }

      expect(graph.terminalGroups).toEqual([
        expect.objectContaining({
          name: '开发环境',
          isCollapsed: false
        })
      ])
      expect(graph.terminalGroups[0]?.memberBlockIds).toHaveLength(2)

      await electronApp.close()
      electronApp = await launchApp(projectDirectory, registryDirectory, appStateDirectory)
      page = await electronApp.firstWindow()
      await page.waitForLoadState('domcontentloaded')

      await page.getByText('开发环境').waitFor()
      await waitForTerminalNodeCount(page, 3)
    },
    electronScenarioTimeoutMs
  )

  it(
    'restores visible terminal output after a terminal group is collapsed and expanded',
    async () => {
      await page.getByRole('button', { name: '添加项目' }).click()

      for (let terminalIndex = 1; terminalIndex <= 2; terminalIndex += 1) {
        await page.getByRole('button', { name: '新建终端积木' }).click()
        await page.getByText(`Terminal ${terminalIndex}`).waitFor()
      }

      await page.getByRole('button', { name: '小地图适应' }).click()
      await page.getByRole('button', { name: '组合终端' }).click()
      await page.getByText('选择要组合的终端').waitFor()
      await page.getByRole('button', { name: 'Terminal 1 选择加入组合' }).click()
      await page.getByRole('button', { name: 'Terminal 2 选择加入组合' }).click()
      await page.getByRole('button', { name: '创建组合' }).click()
      await page.getByText('启动项目').waitFor()

      await selectTerminalNode(page, 'Terminal 1')
      await focusTerminalViewport(page, 'Terminal 1')
      await page.keyboard.type('printf "collapse-persist-ok\\n"')
      await page.keyboard.press('Enter')
      await waitForVisibleTerminalOutput(page, 'Terminal 1', 'collapse-persist-ok')

      await page.getByRole('button', { name: '启动项目 折叠组合' }).click()
      await waitForTerminalNodeCount(page, 0)
      await page.getByRole('button', { name: '启动项目 展开组合' }).click()
      await waitForTerminalNodeCount(page, 2)
      await waitForVisibleTerminalOutput(page, 'Terminal 1', 'collapse-persist-ok')
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
      CLEANCODE_TEST_APP_STATE_DIRECTORY: appStateDirectory,
      CLEANCODE_TEST_PROJECT_DIRECTORY: projectDirectory,
      CLEANCODE_TEST_PROJECT_REGISTRY_DIRECTORY: registryDirectory
    }
  })
}

async function selectTerminalNode(page: Page, terminalName: string): Promise<void> {
  await page
    .locator('.terminal-node', { hasText: terminalName })
    .locator('.terminal-node__header')
    .click()
}

async function focusTerminalViewport(page: Page, terminalName: string): Promise<void> {
  const viewport = page
    .locator('.terminal-node', { hasText: terminalName })
    .locator('.terminal-viewport')

  await viewport.waitFor({ state: 'visible' })
  const boundingBox = await viewport.boundingBox()

  expect(boundingBox).not.toBeNull()

  await page.mouse.click(
    boundingBox!.x + boundingBox!.width / 2,
    boundingBox!.y + boundingBox!.height / 2
  )
  await page.waitForFunction(
    () => document.activeElement?.classList.contains('xterm-helper-textarea') ?? false
  )
}

async function waitForVisibleTerminalOutput(
  page: Page,
  terminalName: string,
  output: string
): Promise<void> {
  await page.waitForFunction(
    ({ terminalName, output }) => {
      const terminalNode = Array.from(document.querySelectorAll('.terminal-node')).find(
        (node) => node.querySelector('.terminal-node__title strong')?.textContent === terminalName
      )

      return terminalNode?.querySelector('.xterm-rows')?.textContent?.includes(output) ?? false
    },
    { terminalName, output }
  )
}

async function waitForTerminalNodeCount(page: Page, expectedCount: number): Promise<void> {
  await page.waitForFunction(
    (count) => document.querySelectorAll('.terminal-node').length === count,
    expectedCount
  )
}

async function expectGroupMembersStayInsideNode(
  page: Page,
  groupName: string,
  expectedMemberCount: number
): Promise<void> {
  const group = page.locator('.terminal-group-node', { hasText: groupName })

  await group.waitFor({ state: 'visible' })

  const groupBox = await group.boundingBox()
  const memberBoxes = await group.locator('.terminal-group-node__member').evaluateAll((members) =>
    members.map((member) => {
      const box = member.getBoundingClientRect()

      return {
        bottom: box.bottom,
        left: box.left,
        right: box.right,
        top: box.top
      }
    })
  )

  expect(groupBox).not.toBeNull()
  expect(memberBoxes).toHaveLength(expectedMemberCount)

  const tolerance = 1

  for (const memberBox of memberBoxes) {
    expect(memberBox.left).toBeGreaterThanOrEqual(groupBox!.x - tolerance)
    expect(memberBox.right).toBeLessThanOrEqual(groupBox!.x + groupBox!.width + tolerance)
    expect(memberBox.top).toBeGreaterThanOrEqual(groupBox!.y - tolerance)
    expect(memberBox.bottom).toBeLessThanOrEqual(groupBox!.y + groupBox!.height + tolerance)
  }
}

async function expectGroupActionTooltipVisible(
  page: Page,
  groupName: string,
  tooltip: string
): Promise<void> {
  const button = page.getByRole('button', { name: `${groupName} ${tooltip}` })

  await button.hover()
  await page.waitForFunction(
    ({ groupName, tooltip }) => {
      const button = Array.from(document.querySelectorAll<HTMLElement>('[data-cc-tooltip]')).find(
        (element) => element.getAttribute('aria-label') === `${groupName} ${tooltip}`
      )
      const group = button?.closest('.terminal-group-node')

      if (!button || !group) {
        return false
      }

      return (
        getComputedStyle(group).overflow === 'visible' &&
        getComputedStyle(button, '::after').opacity === '1' &&
        getComputedStyle(button, '::after').content.includes(tooltip)
      )
    },
    { groupName, tooltip }
  )
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
