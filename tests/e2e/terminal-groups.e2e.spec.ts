// @vitest-environment node

import type { ElectronApplication, Locator, Page } from 'playwright'

import {
  createE2eWorkbench,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  launchApp,
  selectBlankCanvasAction,
  teardownE2eScenario,
  type E2eScenarioResources,
  type E2eWorkbench
} from '../support/e2eWorkbench'
import { pollUntilState } from '../support/e2ePolling'
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

      await selectBlankCanvasAction(page, '组合终端')
      const emptyGroup = await waitForTerminalGroup(
        page,
        workbench,
        (group) => group.memberBlockIds.length === 0
      )
      expect(emptyGroup.memberBlockIds).toEqual([])
      await page.getByRole('button', { name: '适应画布' }).click()
      await waitForCanvasViewportToSettle(page)

      const graphWithEmptyGroup = await readGraph(page, workbench)
      for (const terminal of graphWithEmptyGroup.blocks) {
        await dragTerminalIntoGroup(page, terminal.id)
        await Promise.all([
          page.locator('.terminal-node.workbench-object-motion--group-join').waitFor(),
          page.locator('.terminal-group-node.workbench-object-motion--group-accept').waitFor()
        ])
        await waitForTerminalGroup(page, workbench, (group) =>
          group.memberBlockIds.includes(terminal.id)
        )
      }
      await page.getByRole('button', { name: '完成' }).click()
      await page.getByRole('button', { name: '启动项目 折叠组合' }).waitFor()
      await page.getByRole('button', { name: '适应画布' }).click()
      await waitForCanvasViewportToSettle(page)

      await page.getByRole('button', { name: '启动项目 折叠组合' }).click()
      await page.waitForFunction(
        () => document.querySelectorAll('[data-terminal-block-id]').length === 0
      )
      await page.getByRole('button', { name: '聚焦终端组合 启动项目' }).waitFor()

      await page.getByRole('button', { name: '启动项目 展开组合' }).click()
      await page.waitForFunction(
        () =>
          document.querySelectorAll('[data-terminal-block-id]').length === 2 &&
          document.querySelectorAll(
            '[data-terminal-block-id] .workbench-object-motion--group-expand'
          ).length === 0
      )
      expect(await page.getByRole('button', { name: '聚焦终端组合 启动项目' }).count()).toBe(0)

      await page.getByRole('button', { name: '启动项目 管理组合内容' }).click()

      const graphBeforeDrag = await readGraph(page, workbench)
      const groupBeforeDrag = graphBeforeDrag.terminalGroups[0]!
      const terminalTwo = graphBeforeDrag.blocks.find((block) => block.name === 'Terminal 2')!
      const groupBeforeBox = await readRequiredBoundingBox(
        page.locator('[data-terminal-group-id]').first()
      )

      await dragTerminalTowardGroupRightEdge(page, terminalTwo.id)

      const resizedWidth = await pollUntilState({
        description: 'terminal group visible width to reflect the member drag',
        observe: async () => {
          const box = await page.locator('[data-terminal-group-id]').first().boundingBox()
          return box?.width ?? 0
        },
        accept: (width) => width > groupBeforeBox.width + 120,
        timeoutMs: 5_000
      })
      expect(resizedWidth).toBeGreaterThan(groupBeforeBox.width + 120)
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

      await dragTerminalIntoGroup(page, terminalTwo.id)

      const contractedGroup = await waitForTerminalGroup(
        page,
        workbench,
        (group) => group.size.width < groupAfterDrag.size.width - 100
      )
      const contractedBox = await readRequiredBoundingBox(
        page.locator('[data-terminal-group-id]').first()
      )
      expect(contractedGroup.size.width).toBeLessThan(groupAfterDrag.size.width - 100)
      expect(contractedBox.width).toBeLessThan(groupAfterBox.width - 60)
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
    await selectBlankCanvasActionAt(page, '新建终端积木', 0.2 + index * 0.26, 0.28)
    await page.getByLabel(`Terminal ${index} 文本输出`).waitFor()
  }
}

async function selectBlankCanvasActionAt(
  page: Page,
  action: '新建终端积木' | '组合终端',
  xRatio: number,
  yRatio: number
): Promise<void> {
  await pollUntilState({
    description: 'blank-canvas actions to become available',
    observe: () => page.getByRole('button', { name: '新建 Agent' }).isEnabled(),
    accept: Boolean,
    timeoutMs: 10_000
  })
  const pane = page.locator('.react-flow__pane')
  const bounds = await readRequiredBoundingBox(pane)
  await page.mouse.click(bounds.x + bounds.width * xRatio, bounds.y + bounds.height * yRatio, {
    button: 'right'
  })
  await page
    .getByRole('menu', { name: '画布操作' })
    .getByRole('menuitem', { name: action, exact: true })
    .click()
}

async function dragTerminalIntoGroup(page: Page, terminalBlockId: string): Promise<void> {
  const terminal = page.locator(`[data-terminal-block-id="${terminalBlockId}"]`)
  const terminalHeader = terminal.locator('.terminal-node__header')
  const terminalBox = await readRequiredBoundingBox(terminal)
  const headerBox = await readRequiredBoundingBox(terminalHeader)
  const groupBox = await readRequiredBoundingBox(page.locator('[data-terminal-group-id]').first())
  const startX = headerBox.x + headerBox.width / 2
  const startY = headerBox.y + headerBox.height / 2
  const deltaX = groupBox.x + groupBox.width / 2 - (terminalBox.x + terminalBox.width / 2)
  const deltaY = groupBox.y + groupBox.height / 2 - (terminalBox.y + terminalBox.height / 2)

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 18 })
  await page.mouse.up()
}

async function waitForCanvasViewportToSettle(page: Page): Promise<void> {
  let previousTransform = ''
  let stableObservationCount = 0

  await pollUntilState({
    description: 'canvas viewport motion to settle',
    observe: () =>
      page.locator('.react-flow__viewport').evaluate((viewport) => viewport.getAttribute('style')),
    accept: (style) => {
      const transform = style ?? ''
      stableObservationCount = transform === previousTransform ? stableObservationCount + 1 : 0
      previousTransform = transform
      return stableObservationCount >= 3
    },
    intervalMs: 50,
    timeoutMs: 5_000
  })
}

async function dragTerminalTowardGroupRightEdge(
  page: Page,
  terminalBlockId: string
): Promise<void> {
  const terminal = page.locator(`[data-terminal-block-id="${terminalBlockId}"]`)
  const terminalHeader = page.locator(
    `[data-terminal-block-id="${terminalBlockId}"] .terminal-node__header`
  )
  const terminalBox = await readRequiredBoundingBox(terminal)
  const headerBox = await readRequiredBoundingBox(terminalHeader)
  const groupBox = await readRequiredBoundingBox(page.locator('[data-terminal-group-id]').first())
  const startX = headerBox.x + headerBox.width / 2
  const startY = headerBox.y + headerBox.height / 2
  const terminalCenterX = terminalBox.x + terminalBox.width / 2
  const targetX = startX + groupBox.x + groupBox.width - 20 - terminalCenterX

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(targetX, startY, { steps: 18 })
  await page.mouse.up()
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
  return pollUntilState({
    description: 'terminal group graph state',
    observe: () => readGraph(page, workbench),
    accept: predicate,
    intervalMs: 250,
    retryObservationErrors: true,
    timeoutMs: 5_000
  })
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
