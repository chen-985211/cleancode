// @vitest-environment node

import type { ElectronApplication, Locator, Page } from 'playwright'

import {
  createE2eWorkbench,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  launchApp,
  teardownE2eScenario,
  type E2eScenarioResources,
  type E2eWorkbench
} from '../support/e2eWorkbench'
describe('terminal groups e2e', () => {
  let workbench: E2eWorkbench
  let electronApp: ElectronApplication
  let page: Page
  let resources: E2eScenarioResources

  beforeEach(async () => {
    resources = {}
    workbench = await createE2eWorkbench('cleancode-terminal-groups-e2e')
    resources.workbench = workbench
    electronApp = await launchApp(workbench)
    resources.electronApp = electronApp
    page = await electronApp.firstWindow()
    resources.page = page
    await page.waitForLoadState('domcontentloaded')
  }, electronLaunchTimeoutMs)

  afterEach(async ({ task }) => {
    await teardownE2eScenario({
      resources,
      taskFailed: task.result?.state === 'fail',
      taskName: task.name
    })
  })

  it(
    'creates, collapses, expands, and resizes a terminal group through member drag',
    async () => {
      await createTwoTerminalBlocks(page)

      await page.getByRole('button', { name: '组合终端', exact: true }).click()
      await ensureTerminalSelectedForGroup(page, 'Terminal 1')
      await ensureTerminalSelectedForGroup(page, 'Terminal 2')
      await page.getByRole('button', { name: '创建组合' }).click()
      await page.getByRole('button', { name: '启动项目 折叠组合' }).waitFor()

      await page.getByRole('button', { name: '启动项目 折叠组合' }).click()
      await page.waitForFunction(
        () => document.querySelectorAll('[data-terminal-block-id]').length === 0
      )
      await page.getByRole('button', { name: '聚焦终端组合 启动项目' }).waitFor()

      await page.getByRole('button', { name: '启动项目 展开组合' }).click()
      await page.waitForFunction(
        () => document.querySelectorAll('[data-terminal-block-id]').length === 2
      )
      expect(await page.getByRole('button', { name: '聚焦终端组合 启动项目' }).count()).toBe(0)

      const graphBeforeDrag = await readGraph(page, workbench)
      const groupBeforeDrag = graphBeforeDrag.terminalGroups[0]!
      const terminalTwo = graphBeforeDrag.blocks.find((block) => block.name === 'Terminal 2')!
      const groupBeforeBox = await readRequiredBoundingBox(
        page.locator('[data-terminal-group-id]').first()
      )

      await dragTerminalHeader(page, terminalTwo.id, 260, 0)

      await expect
        .poll(async () => {
          const box = await page.locator('[data-terminal-group-id]').first().boundingBox()
          return box?.width ?? 0
        })
        .toBeGreaterThan(groupBeforeBox.width + 120)
      const groupAfterDrag = await waitForTerminalGroup(
        page,
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

async function createTwoTerminalBlocks(page: Page): Promise<void> {
  await createTerminalBlocks(page, 2)
}

async function createTerminalBlocks(page: Page, count: number): Promise<void> {
  await expectDesktopRuntime(page)
  await page.getByRole('button', { name: '添加项目' }).click()

  for (let index = 1; index <= count; index += 1) {
    await page.getByRole('button', { name: '新建终端积木' }).click()
    await page.getByLabel(`Terminal ${index} 文本输出`).waitFor()
  }
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
    { steps: process.platform === 'win32' ? 1 : 18 }
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

async function waitForTerminalGroup(
  page: Page,
  workbench: E2eWorkbench,
  predicate: (group: TerminalGroupRecord) => boolean
): Promise<TerminalGroupRecord> {
  const graph = await waitForGraph(page, workbench, (candidateGraph) =>
    candidateGraph.terminalGroups.some(predicate)
  )
  const group = graph.terminalGroups.find(predicate)

  expect(group).toBeDefined()

  return group!
}

async function waitForGraph(
  page: Page,
  workbench: E2eWorkbench,
  predicate: (graph: TerminalGroupGraphRecord) => boolean
): Promise<TerminalGroupGraphRecord> {
  const deadline = Date.now() + 5_000

  while (Date.now() < deadline) {
    try {
      const graph = await readGraph(page, workbench)

      if (predicate(graph)) {
        return graph
      }
    } catch {
      // The project may not be registered until the first action completes.
    }

    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  return readGraph(page, workbench)
}

async function readGraph(page: Page, workbench: E2eWorkbench): Promise<TerminalGroupGraphRecord> {
  const graph = await page.evaluate(async (projectDirectory) => {
    const workbenches = await window.cleancode?.listWorkbenches()

    return (
      workbenches?.find((candidate) => candidate.project.directory === projectDirectory)?.graph ??
      null
    )
  }, workbench.projectDirectory)

  if (!graph) throw new Error('The terminal group workbench is not registered.')

  return graph
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
