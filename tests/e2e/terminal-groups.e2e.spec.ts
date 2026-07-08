// @vitest-environment node

import type { ElectronApplication, Locator, Page } from 'playwright'

import {
  buildElectronApp,
  cleanupE2eWorkbench,
  createE2eWorkbench,
  electronBuildTimeoutMs,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  launchApp,
  readOnlyJsonFile,
  type E2eWorkbench
} from '../support/e2eWorkbench'

describe('terminal groups e2e', () => {
  let workbench: E2eWorkbench
  let electronApp: ElectronApplication
  let page: Page

  beforeAll(async () => {
    await buildElectronApp()
  }, electronBuildTimeoutMs)

  beforeEach(async () => {
    workbench = await createE2eWorkbench('cleancode-terminal-groups-e2e')
    electronApp = await launchApp(workbench)
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
  }, electronLaunchTimeoutMs)

  afterEach(async () => {
    await electronApp.close()
    await cleanupE2eWorkbench(workbench)
  })

  it(
    'creates, collapses, expands, and resizes a terminal group through member drag',
    async () => {
      await createTwoTerminalBlocks(page, workbench)

      await page.getByRole('button', { name: '组合终端' }).click()
      await page.getByRole('button', { name: 'Terminal 1 选择加入组合' }).click()
      await page.getByRole('button', { name: 'Terminal 2 选择加入组合' }).click()
      await page.getByRole('button', { name: '创建组合' }).click()
      await page.getByRole('button', { name: '启动项目 折叠组合' }).waitFor()

      await waitForTerminalGroup(workbench, (group) => group.memberBlockIds.length === 2)

      await page.getByRole('button', { name: '启动项目 折叠组合' }).click()
      await waitForTerminalGroup(workbench, (group) => group.isCollapsed)
      await page.waitForFunction(
        () => document.querySelectorAll('[data-terminal-block-id]').length === 0
      )
      await page.getByRole('button', { name: '聚焦终端组合 启动项目' }).waitFor()

      await page.getByRole('button', { name: '启动项目 展开组合' }).click()
      await waitForTerminalGroup(workbench, (group) => !group.isCollapsed)
      await page.waitForFunction(
        () => document.querySelectorAll('[data-terminal-block-id]').length === 2
      )
      expect(await page.getByRole('button', { name: '聚焦终端组合 启动项目' }).count()).toBe(0)

      const graphBeforeDrag = await readGraph(workbench)
      const groupBeforeDrag = graphBeforeDrag.terminalGroups[0]!
      const terminalTwo = graphBeforeDrag.blocks.find((block) => block.name === 'Terminal 2')!
      const groupBeforeBox = await readRequiredBoundingBox(
        page.locator('[data-terminal-group-id]').first()
      )

      await dragTerminalHeader(page, terminalTwo.id, 260, 0)

      const groupAfterDrag = await waitForTerminalGroup(
        workbench,
        (group) => group.size.width > groupBeforeDrag.size.width + 160
      )
      const groupAfterBox = await readRequiredBoundingBox(
        page.locator('[data-terminal-group-id]').first()
      )

      expect(groupAfterDrag.size.width).toBeGreaterThan(groupBeforeDrag.size.width + 160)
      expect(groupAfterBox.width).toBeGreaterThan(groupBeforeBox.width + 120)
    },
    electronScenarioTimeoutMs
  )
})

async function createTwoTerminalBlocks(page: Page, workbench: E2eWorkbench): Promise<void> {
  await expectDesktopRuntime(page)
  await page.getByRole('button', { name: '添加项目' }).click()
  await page.getByRole('button', { name: '新建终端积木' }).click()
  await page.getByLabel('Terminal 1 文本输出').waitFor()
  await page.getByRole('button', { name: '新建终端积木' }).click()
  await page.getByLabel('Terminal 2 文本输出').waitFor()
  await waitForGraph(workbench, (graph) => graph.blocks.length === 2)
}

async function dragTerminalHeader(
  page: Page,
  terminalBlockId: string,
  deltaX: number,
  deltaY: number
): Promise<void> {
  const terminalHeader = page.locator(
    `[data-terminal-block-id="${terminalBlockId}"] .terminal-node__header`
  )
  const headerBox = await readRequiredBoundingBox(terminalHeader)

  await page.mouse.move(headerBox.x + headerBox.width / 2, headerBox.y + headerBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(
    headerBox.x + headerBox.width / 2 + deltaX,
    headerBox.y + headerBox.height / 2 + deltaY,
    { steps: 18 }
  )
  await page.mouse.up()
}

async function waitForTerminalGroup(
  workbench: E2eWorkbench,
  predicate: (group: TerminalGroupRecord) => boolean
): Promise<TerminalGroupRecord> {
  const graph = await waitForGraph(workbench, (candidateGraph) =>
    candidateGraph.terminalGroups.some(predicate)
  )
  const group = graph.terminalGroups.find(predicate)

  expect(group).toBeDefined()

  return group!
}

async function waitForGraph(
  workbench: E2eWorkbench,
  predicate: (graph: TerminalGroupGraphRecord) => boolean
): Promise<TerminalGroupGraphRecord> {
  const deadline = Date.now() + 5_000

  while (Date.now() < deadline) {
    try {
      const graph = await readGraph(workbench)

      if (predicate(graph)) {
        return graph
      }
    } catch {
      // The graph file may not exist until the first project action is persisted.
    }

    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  return readGraph(workbench)
}

async function readGraph(workbench: E2eWorkbench): Promise<TerminalGroupGraphRecord> {
  return JSON.parse(
    await readOnlyJsonFile(workbench.appStateDirectory, 'default-graph.json')
  ) as TerminalGroupGraphRecord
}

async function readRequiredBoundingBox(locator: Locator) {
  const box = await locator.boundingBox()

  expect(box).not.toBeNull()

  return box!
}

interface TerminalGroupGraphRecord {
  readonly blocks: readonly TerminalBlockRecord[]
  readonly terminalGroups: readonly TerminalGroupRecord[]
}

interface TerminalBlockRecord {
  readonly id: string
  readonly name: string
}

interface TerminalGroupRecord {
  readonly isCollapsed: boolean
  readonly memberBlockIds: readonly string[]
  readonly size: { readonly width: number; readonly height: number }
}
