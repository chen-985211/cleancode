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
      await ensureTerminalSelectedForGroup(page, 'Terminal 1')
      await ensureTerminalSelectedForGroup(page, 'Terminal 2')
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

  it(
    'adds a terminal to an existing group by dropping it in group edit mode',
    async () => {
      await createTerminalBlocks(page, workbench, 3)

      await page.getByRole('button', { name: '组合终端' }).click()
      await ensureTerminalSelectedForGroup(page, 'Terminal 1')
      await ensureTerminalSelectedForGroup(page, 'Terminal 2')
      await ensureTerminalNotSelectedForGroup(page, 'Terminal 3')
      await page.getByRole('button', { name: '创建组合' }).click()
      await waitForTerminalGroup(workbench, (group) => group.memberBlockIds.length === 2)

      const graphBeforeDrop = await readGraph(workbench)
      const terminalThree = graphBeforeDrop.blocks.find((block) => block.name === 'Terminal 3')!

      await page.getByRole('button', { name: '组合终端' }).click()
      await dragTerminalHeaderToGroupCenter(page, terminalThree.id)

      await waitForTerminalGroup(
        workbench,
        (group) =>
          group.memberBlockIds.length === 3 && group.memberBlockIds.includes(terminalThree.id)
      )
    },
    electronScenarioTimeoutMs
  )

  it(
    'removes a member terminal by dropping it outside in group edit mode',
    async () => {
      await createTerminalBlocks(page, workbench, 3)

      await page.getByRole('button', { name: '组合终端' }).click()
      await ensureTerminalSelectedForGroup(page, 'Terminal 1')
      await ensureTerminalSelectedForGroup(page, 'Terminal 2')
      await ensureTerminalSelectedForGroup(page, 'Terminal 3')
      await page.getByRole('button', { name: '创建组合' }).click()
      await waitForTerminalGroup(workbench, (group) => group.memberBlockIds.length === 3)

      const graphBeforeDrop = await readGraph(workbench)
      const terminalOne = graphBeforeDrop.blocks.find((block) => block.name === 'Terminal 1')!

      await page.getByRole('button', { name: '组合终端' }).click()
      await dragTerminalHeaderOutsideGroup(page, terminalOne.id)

      await waitForTerminalGroup(
        workbench,
        (group) =>
          group.memberBlockIds.length === 2 && !group.memberBlockIds.includes(terminalOne.id)
      )
    },
    electronScenarioTimeoutMs
  )
})

async function createTwoTerminalBlocks(page: Page, workbench: E2eWorkbench): Promise<void> {
  await createTerminalBlocks(page, workbench, 2)
}

async function createTerminalBlocks(
  page: Page,
  workbench: E2eWorkbench,
  count: number
): Promise<void> {
  await expectDesktopRuntime(page)
  await page.getByRole('button', { name: '添加项目' }).click()

  for (let index = 1; index <= count; index += 1) {
    await page.getByRole('button', { name: '新建终端积木' }).click()
    await page.getByLabel(`Terminal ${index} 文本输出`).waitFor()
  }

  await waitForGraph(workbench, (graph) => graph.blocks.length === count)
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

async function ensureTerminalSelectedForGroup(page: Page, terminalName: string): Promise<void> {
  await waitForTerminalGroupSelectionButton(page, terminalName)

  if (await page.getByRole('button', { name: `${terminalName} 已选择终端` }).count()) {
    return
  }

  await page.getByRole('button', { name: `${terminalName} 选择终端` }).click()
}

async function ensureTerminalNotSelectedForGroup(page: Page, terminalName: string): Promise<void> {
  await waitForTerminalGroupSelectionButton(page, terminalName)

  const selectedButton = page.getByRole('button', { name: `${terminalName} 已选择终端` })

  if ((await selectedButton.count()) === 0) {
    return
  }

  await selectedButton.click()
}

async function waitForTerminalGroupSelectionButton(
  page: Page,
  terminalName: string
): Promise<void> {
  await page.waitForFunction(
    (name) =>
      Array.from(document.querySelectorAll('button')).some((button) => {
        const label = button.getAttribute('aria-label')

        return label === `${name} 选择终端` || label === `${name} 已选择终端`
      }),
    terminalName
  )
}

async function dragTerminalHeaderToGroupCenter(page: Page, terminalBlockId: string): Promise<void> {
  const terminal = page.locator(`[data-terminal-block-id="${terminalBlockId}"]`)
  const terminalHeader = page.locator(
    `[data-terminal-block-id="${terminalBlockId}"] .terminal-node__header`
  )
  const terminalBox = await readRequiredBoundingBox(terminal)
  const headerBox = await readRequiredBoundingBox(terminalHeader)
  const groupBox = await readRequiredBoundingBox(page.locator('[data-terminal-group-id]').first())
  const terminalCenterOffset = {
    x: terminalBox.x + terminalBox.width / 2 - (headerBox.x + headerBox.width / 2),
    y: terminalBox.y + terminalBox.height / 2 - (headerBox.y + headerBox.height / 2)
  }
  const start = {
    x: headerBox.x + headerBox.width / 2,
    y: headerBox.y + headerBox.height / 2
  }
  const target = {
    x: groupBox.x + groupBox.width / 2 - terminalCenterOffset.x,
    y: groupBox.y + groupBox.height / 2 - terminalCenterOffset.y
  }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 24 })
  await page.mouse.up()
}

async function dragTerminalHeaderOutsideGroup(page: Page, terminalBlockId: string): Promise<void> {
  const terminal = page.locator(`[data-terminal-block-id="${terminalBlockId}"]`)
  const terminalHeader = page.locator(
    `[data-terminal-block-id="${terminalBlockId}"] .terminal-node__header`
  )
  const terminalBox = await readRequiredBoundingBox(terminal)
  const headerBox = await readRequiredBoundingBox(terminalHeader)
  const groupBox = await readRequiredBoundingBox(page.locator('[data-terminal-group-id]').first())
  const terminalCenterOffset = {
    x: terminalBox.x + terminalBox.width / 2 - (headerBox.x + headerBox.width / 2),
    y: terminalBox.y + terminalBox.height / 2 - (headerBox.y + headerBox.height / 2)
  }
  const start = {
    x: headerBox.x + headerBox.width / 2,
    y: headerBox.y + headerBox.height / 2
  }
  const targetTerminalCenter = {
    x: groupBox.x + groupBox.width + terminalBox.width / 2 + 140,
    y: terminalBox.y + terminalBox.height / 2
  }
  const target = {
    x: targetTerminalCenter.x - terminalCenterOffset.x,
    y: targetTerminalCenter.y - terminalCenterOffset.y
  }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 24 })
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
