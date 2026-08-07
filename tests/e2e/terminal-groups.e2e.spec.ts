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

const screenPixelTolerance = 1

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
      const groupAnchor = emptyGroup.position
      await page.getByRole('button', { name: '适应画布' }).click()
      await waitForCanvasViewportToSettle(page)

      const graphWithEmptyGroup = await readGraph(page, workbench)
      for (const [terminalIndex, terminal] of graphWithEmptyGroup.blocks.entries()) {
        const groupMaterialBeforeDrag = await readTerminalGroupMaterial(
          page.locator('[data-terminal-group-id]').first()
        )
        await dragTerminalIntoGroup(
          page,
          terminal.id,
          terminalIndex === 0
            ? async ({ group, moveAway, moveBack, terminal: draggedTerminal }) => {
                const engagedScale = await waitForTerminalGroupScale(
                  group,
                  (scale) => scale > 1.005,
                  'terminal group to spring open for a nearby terminal'
                )
                const groupMaterial = await readTerminalGroupMaterial(group)
                const terminalTransform = await draggedTerminal.evaluate(
                  (element) => getComputedStyle(element).transform
                )

                expect(await readTerminalGroupSurfaceCenterDrift(group)).toBeLessThan(
                  screenPixelTolerance
                )
                expect(engagedScale).toBeGreaterThan(1.005)
                expect(groupMaterial).toEqual(groupMaterialBeforeDrag)
                expect(await group.locator('.terminal-group-node__drop-hint').count()).toBe(0)
                expect(terminalTransform).toBe('none')

                await moveAway()
                expect(
                  await waitForTerminalGroupRest(
                    group,
                    'terminal group to spring closed after the terminal moves away'
                  )
                ).toBeCloseTo(1, 3)

                await moveBack()
                expect(
                  await waitForTerminalGroupScale(
                    group,
                    (scale) => scale > 1.005,
                    'terminal group to spring open after the terminal returns'
                  )
                ).toBeGreaterThan(1.005)
              }
            : undefined
        )
        await page.locator('.terminal-node.workbench-object-motion--group-join').first().waitFor()
        const joinedGroup = await waitForTerminalGroup(page, workbench, (group) =>
          group.memberBlockIds.includes(terminal.id)
        )
        expect(joinedGroup.position).toEqual(groupAnchor)
        expect(
          await waitForTerminalGroupRest(
            page.locator('[data-terminal-group-id]').first(),
            'terminal group to spring closed after absorbing the terminal'
          )
        ).toBeCloseTo(1, 3)
        await waitForTerminalVisuallyInsideGroup(page, terminal.id)
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

      await inspectTerminalRemovalBoundary(page, terminalTwo.id)

      const groupBeforeBox = await readRequiredBoundingBox(
        page.locator('.react-flow__node-terminalGroup').first()
      )

      await dragTerminalTowardGroupRightEdge(page, terminalTwo.id)

      const groupAfterDrag = await waitForTerminalGroup(
        page,
        workbench,
        (group) => group.size.width > groupBeforeDrag.size.width + 160
      )
      const resizedProjection = await waitForTerminalGroupProjectedWidth(
        page,
        groupAfterDrag.size.width,
        'terminal group visible width to reflect the member drag'
      )
      expect(
        Math.abs(resizedProjection.renderedWidth - resizedProjection.expectedRenderedWidth)
      ).toBeLessThan(screenPixelTolerance)
      const groupAfterBox = await readRequiredBoundingBox(
        page.locator('.react-flow__node-terminalGroup').first()
      )

      expect(groupAfterDrag.size.width).toBeGreaterThan(groupBeforeDrag.size.width + 160)
      expect(groupAfterBox.width).toBeGreaterThan(groupBeforeBox.width + 120)

      await dragTerminalIntoGroup(page, terminalTwo.id)

      const contractedGroup = await waitForTerminalGroup(
        page,
        workbench,
        (group) => group.size.width < groupAfterDrag.size.width - 100
      )
      const contractedProjection = await waitForTerminalGroupProjectedWidth(
        page,
        contractedGroup.size.width,
        'terminal group visible width to reflect member contraction'
      )
      expect(contractedGroup.size.width).toBeLessThan(groupAfterDrag.size.width - 100)
      expect(
        Math.abs(contractedProjection.renderedWidth - contractedProjection.expectedRenderedWidth)
      ).toBeLessThan(screenPixelTolerance)
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
    await selectBlankCanvasAction(page, '新建终端积木')
    await page.getByLabel(`Terminal ${index} 文本输出`).waitFor()
  }
}

async function dragTerminalIntoGroup(
  page: Page,
  terminalBlockId: string,
  inspectHover?: (state: {
    readonly group: Locator
    readonly moveAway: () => Promise<void>
    readonly moveBack: () => Promise<void>
    readonly terminal: Locator
  }) => Promise<void>
): Promise<void> {
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
  const targetX = startX + deltaX
  const targetY = startY + deltaY
  await page.mouse.move(targetX, targetY, { steps: 18 })
  await inspectHover?.({
    group: page.locator('[data-terminal-group-id]').first(),
    moveAway: () => page.mouse.move(startX, startY, { steps: 12 }),
    moveBack: () => page.mouse.move(targetX, targetY, { steps: 12 }),
    terminal
  })
  await page.mouse.up()
}

async function waitForTerminalGroupScale(
  group: Locator,
  accept: (scale: number) => boolean,
  description: string
): Promise<number> {
  return pollUntilState({
    description,
    observe: () => group.evaluate(readScale),
    accept,
    intervalMs: 16,
    timeoutMs: 1_500
  })
}

async function waitForTerminalGroupRest(group: Locator, description: string): Promise<number> {
  const state = await pollUntilState({
    description,
    observe: () =>
      group.evaluate((element) => {
        const transform = getComputedStyle(element).transform
        return {
          active: element.classList.contains('terminal-group-drop-spring--active'),
          scale: transform === 'none' ? 1 : new DOMMatrixReadOnly(transform).a
        }
      }),
    accept: ({ active, scale }) => !active && Math.abs(scale - 1) < 0.001,
    intervalMs: 16,
    timeoutMs: 1_500
  })

  return state.scale
}

function readScale(element: Element): number {
  const transform = getComputedStyle(element).transform
  if (transform === 'none') return 1
  return new DOMMatrixReadOnly(transform).a
}

async function readTerminalGroupMaterial(group: Locator): Promise<{
  readonly background: string
  readonly depthOpacity: string
  readonly shadow: string
}> {
  return group.evaluate((element) => ({
    background: getComputedStyle(element).background,
    depthOpacity: getComputedStyle(element, '::after').opacity,
    shadow: getComputedStyle(element).boxShadow
  }))
}

async function waitForTerminalVisuallyInsideGroup(
  page: Page,
  terminalBlockId: string
): Promise<void> {
  const group = page.locator('[data-terminal-group-id]').first()
  const terminal = page.locator(`[data-terminal-block-id="${terminalBlockId}"]`)

  await pollUntilState({
    description: 'absorbed terminal to settle inside its terminal group',
    observe: async () => ({
      group: await group.boundingBox(),
      terminal: await terminal.boundingBox()
    }),
    accept: ({ group: groupBox, terminal: terminalBox }) => {
      if (!groupBox || !terminalBox) return false

      const tolerance = 2
      return (
        terminalBox.x >= groupBox.x - tolerance &&
        terminalBox.y >= groupBox.y - tolerance &&
        terminalBox.x + terminalBox.width <= groupBox.x + groupBox.width + tolerance &&
        terminalBox.y + terminalBox.height <= groupBox.y + groupBox.height + tolerance
      )
    },
    intervalMs: 16,
    timeoutMs: 2_000
  })
}

function readTerminalGroupSurfaceCenterDrift(group: Locator): Promise<number> {
  return group.evaluate((surface) => {
    const flowNode = surface.closest('.react-flow__node-terminalGroup')
    if (!flowNode) throw new Error('Terminal group React Flow node is unavailable.')

    const surfaceBox = surface.getBoundingClientRect()
    const flowNodeBox = flowNode.getBoundingClientRect()
    return Math.hypot(
      surfaceBox.x + surfaceBox.width / 2 - (flowNodeBox.x + flowNodeBox.width / 2),
      surfaceBox.y + surfaceBox.height / 2 - (flowNodeBox.y + flowNodeBox.height / 2)
    )
  })
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

async function waitForTerminalGroupProjectedWidth(
  page: Page,
  expectedCanvasWidth: number,
  description: string
): Promise<{ readonly expectedRenderedWidth: number; readonly renderedWidth: number }> {
  return pollUntilState({
    accept: ({ expectedRenderedWidth, renderedWidth }) =>
      Math.abs(renderedWidth - expectedRenderedWidth) < screenPixelTolerance,
    description,
    observe: () =>
      page.evaluate((canvasWidth) => {
        const group = document.querySelector<HTMLElement>('.react-flow__node-terminalGroup')
        const viewport = document.querySelector<HTMLElement>('.react-flow__viewport')
        if (!group || !viewport) return { expectedRenderedWidth: 0, renderedWidth: 0 }

        const zoom = new DOMMatrixReadOnly(getComputedStyle(viewport).transform).a
        return {
          expectedRenderedWidth: canvasWidth * zoom,
          renderedWidth: group.getBoundingClientRect().width
        }
      }, expectedCanvasWidth),
    intervalMs: 16,
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

async function inspectTerminalRemovalBoundary(page: Page, terminalBlockId: string): Promise<void> {
  const group = page.locator('[data-terminal-group-id]').first()
  const terminal = page.locator(`[data-terminal-block-id="${terminalBlockId}"]`)
  const terminalHeader = terminal.locator('.terminal-node__header')
  const groupBox = await readRequiredBoundingBox(group)
  const terminalBox = await readRequiredBoundingBox(terminal)
  const headerBox = await readRequiredBoundingBox(terminalHeader)
  const materialBeforeDrag = await readTerminalGroupMaterial(group)
  const startX = headerBox.x + headerBox.width / 2
  const startY = headerBox.y + headerBox.height / 2
  const terminalCenterX = terminalBox.x + terminalBox.width / 2
  const outsideX = startX + groupBox.x + groupBox.width + 20 - terminalCenterX

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  try {
    await page.mouse.move(outsideX, startY, { steps: 18 })

    expect(
      await waitForTerminalGroupScale(
        group,
        (scale) => scale < 0.995,
        'terminal group to contract when a member crosses its removal boundary'
      )
    ).toBeLessThan(0.995)
    expect(await readTerminalGroupMaterial(group)).toEqual(materialBeforeDrag)
    expect(await group.locator('.terminal-group-node__drop-hint').count()).toBe(0)

    await page.mouse.move(startX, startY, { steps: 18 })
    expect(
      await waitForTerminalGroupRest(
        group,
        'terminal group to return to rest after the member returns inside'
      )
    ).toBeCloseTo(1, 3)
  } finally {
    await page.mouse.up()
  }
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
  readonly position: { readonly x: number; readonly y: number }
  readonly size: { readonly width: number; readonly height: number }
}
