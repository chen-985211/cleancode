// @vitest-environment node

import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { Locator, Page } from 'playwright'

import type { workbenchNodeTypes } from '../../src/presentation/app-shell/workbench/nodes/workbenchNodeTypes'
import {
  readFakeCodexCliReports,
  type FakeCodexCliFixture
} from '../fixtures/contexts/agent/fakeCodexCli'
import { waitForCanvasViewportZoomCommit } from '../support/e2eCanvasViewport'
import { agentCliReadyTimeoutMs } from '../support/e2eAgentRuntime'
import { createE2eFileCommand } from '../support/e2eTerminal'
import { pollUntilState } from '../support/e2ePolling'
import {
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  selectBlankCanvasAction,
  teardownE2eScenario,
  type E2eScenarioResources,
  type E2eWorkbench
} from '../support/e2eWorkbench'
import { createCodexAgent, launchWorkspaceAgentsE2e } from '../support/e2eWorkspaceAgents'

const nodeCases = {
  terminal: { title: '.terminal-node__title strong' },
  terminalGroup: { title: '.terminal-group-node__name' },
  agentConsole: { title: '.agent-console-actions__title' }
} satisfies Record<keyof typeof workbenchNodeTypes, { readonly title: string }>
const clickMovements = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: -2, y: -1 },
  { x: 3, y: 4 },
  { x: 5, y: 0 }
]

describe.each(Object.entries(nodeCases))('canvas %s title gestures e2e', (nodeType, scenario) => {
  let page: Page
  let workbench: E2eWorkbench
  let resources: E2eScenarioResources
  let node: Locator
  let fakeCodex: FakeCodexCliFixture

  beforeEach(async () => {
    resources = {}
    const launched = await launchWorkspaceAgentsE2e(resources, 'cleancode-node-title-gestures')
    page = launched.page
    workbench = launched.workbench
    fakeCodex = launched.fakeCodex
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expectDesktopRuntime(page)
    await page.getByRole('button', { name: '添加项目' }).click()

    if (nodeType === 'agentConsole') {
      await createCodexAgent(page)
    } else {
      await selectBlankCanvasAction(page, nodeType === 'terminal' ? '新建终端积木' : '组合终端')
      if (nodeType === 'terminalGroup') await page.getByRole('button', { name: '完成' }).click()
    }
    node = page.locator(`.react-flow__node-${nodeType}`)
    await node.locator(scenario.title).waitFor({ state: 'visible' })
    await node.locator(scenario.title).click({ trial: true })
  }, electronLaunchTimeoutMs)

  afterEach(async ({ task }) => {
    await teardownE2eScenario({
      resources,
      taskFailed: task.result?.state === 'fail',
      taskName: task.name
    })
  })

  it(
    'selects exclusively without moving when a title click contains small pointer movements',
    async () => {
      for (const zoomIn of [false, true]) {
        await page.emulateMedia({ reducedMotion: zoomIn ? 'reduce' : 'no-preference' })
        for (const movement of clickMovements) {
          await clearSelection(page)
          if (zoomIn) {
            await page.getByRole('button', { name: '放大画布', exact: true }).click()
            await waitForCanvasViewportZoomCommit(page, {
              direction: 'increase',
              previousZoom: 0.5,
              projectDirectory: workbench.projectDirectory
            })
          }
          const before = await readNodeState(node)
          const persistedBefore = await readPersistedPosition(page, workbench, nodeType)
          await movePointerOnTitle(page, node.locator(scenario.title), movement)

          const selected = await pollUntilState({
            description: `${nodeType} selection after title movement ${JSON.stringify(movement)}`,
            observe: () => readNodeState(node),
            accept: (state) =>
              state.selected &&
              state.hasOutline &&
              (nodeType === 'terminalGroup' || state.inputFocused),
            timeoutMs: 3_000
          })
          expect(selected.position).toEqual(before.position)
          expect(await readPersistedPosition(page, workbench, nodeType)).toEqual(persistedBefore)
          expect(await page.locator('.react-flow__node.selected').count()).toBe(1)
        }
      }

      await assertKeyboardInputReachesNode(page, nodeType, workbench, fakeCodex)
      const artifactDirectory = join(process.cwd(), 'test-results', 'node-title-gestures')
      await mkdir(artifactDirectory, { recursive: true })
      await node.screenshot({ path: join(artifactDirectory, `${nodeType}-selected.png`) })
    },
    electronScenarioTimeoutMs
  )

  it(
    'selects dragged nodes and activates their input on release without recentering',
    async () => {
      for (const initiallySelected of [false, true]) {
        await clearSelection(page)
        if (initiallySelected) await node.locator(scenario.title).click()
        const before = await readNodeState(node)
        expect(before.selected).toBe(initiallySelected)
        const viewportBefore = await page.locator('.react-flow__viewport').getAttribute('style')
        await movePointerOnTitle(page, node.locator(scenario.title), { x: 64, y: 32 }, async () => {
          const dragging = await pollUntilState({
            description: `${nodeType} to follow the pointer while the title is held`,
            observe: () => readNodeState(node),
            accept: (state) =>
              state.position.x > before.position.x + 30 &&
              state.position.y > before.position.y + 15,
            timeoutMs: 3_000
          })
          expect(dragging.selected).toBe(true)
          expect(dragging.inputFocused).toBe(false)
        })

        const committed = await pollUntilState({
          description: `${nodeType} dragged position to persist`,
          observe: async () => ({
            rendered: await readNodeState(node),
            persisted: await readPersistedPosition(page, workbench, nodeType)
          }),
          accept: ({ rendered, persisted }) =>
            persisted.x > before.position.x + 30 &&
            persisted.y > before.position.y + 15 &&
            // CSS matrices serialize with less precision than persisted canvas coordinates.
            Math.abs(persisted.x - rendered.position.x) < 0.01 &&
            Math.abs(persisted.y - rendered.position.y) < 0.01,
          timeoutMs: 5_000
        })
        expect(committed.rendered.selected).toBe(true)
        expect(committed.rendered.hasOutline).toBe(true)
        if (nodeType !== 'terminalGroup') {
          await pollUntilState({
            description: `${nodeType} input to activate after releasing the dragged title`,
            observe: () => readNodeState(node),
            accept: (state) => state.inputFocused,
            timeoutMs: 3_000
          })
        }
        expect(await page.locator('.react-flow__viewport').getAttribute('style')).toBe(
          viewportBefore
        )
      }
      await assertKeyboardInputReachesNode(page, nodeType, workbench, fakeCodex)
    },
    electronScenarioTimeoutMs
  )
})

async function assertKeyboardInputReachesNode(
  page: Page,
  nodeType: string,
  workbench: E2eWorkbench,
  fakeCodex: FakeCodexCliFixture
): Promise<void> {
  if (nodeType === 'terminalGroup') return
  if (nodeType === 'agentConsole') {
    const ready = await pollUntilState({
      description: 'Agent test CLI to finish starting before accepting typed commands',
      observe: async () =>
        (await readFakeCodexCliReports(fakeCodex.reportPath))
          .filter((report) => report.kind === 'draw')
          .map(({ pid }) => pid),
      accept: (processIds) => processIds.length > 0,
      timeoutMs: agentCliReadyTimeoutMs
    })
    // The test CLI supports line clearing; terminal replies can precede the test command.
    await page.keyboard.press('Control+u')
    await page.keyboard.type('/resume')
    await page.keyboard.press('Enter')
    await pollUntilState({
      description: 'typed input to reach the selected Agent CLI',
      observe: async () =>
        (await readFakeCodexCliReports(fakeCodex.reportPath)).map(({ kind, pid }) => ({
          kind,
          pid
        })),
      accept: (reports) =>
        reports.some((report) => report.kind === 'resume' && report.pid === ready.at(-1)),
      timeoutMs: 5_000
    })
    return
  }
  const markerPath = join(workbench.projectDirectory, 'selected-node-input.txt')
  await page.keyboard.type(
    createE2eFileCommand({ files: { [markerPath]: 'typed-through-selected-node' } })
  )
  await page.keyboard.press('Enter')
  await pollUntilState({
    description: 'typed input to execute in the selected terminal',
    observe: () => readFile(markerPath, 'utf8'),
    accept: (contents) => contents === 'typed-through-selected-node',
    retryObservationErrors: true,
    timeoutMs: 5_000
  })
}

async function movePointerOnTitle(
  page: Page,
  title: Locator,
  movement: { readonly x: number; readonly y: number },
  whilePressed?: () => Promise<void>
): Promise<void> {
  await title.click({ trial: true })
  const bounds = await title.boundingBox()
  if (!bounds) throw new Error('The node title is not visible.')
  const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  try {
    await page.mouse.move(point.x + movement.x, point.y + movement.y, {
      steps: whilePressed ? 8 : 1
    })
    await whilePressed?.()
  } finally {
    await page.mouse.up()
  }
}

async function clearSelection(page: Page): Promise<void> {
  const point = await page.locator('.react-flow__pane').evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    for (const yRatio of [0.2, 0.4, 0.6, 0.8]) {
      for (const xRatio of [0.3, 0.5, 0.7, 0.9]) {
        const point = {
          x: bounds.left + bounds.width * xRatio,
          y: bounds.top + bounds.height * yRatio
        }
        if (document.elementFromPoint(point.x, point.y) === element) return point
      }
    }
    throw new Error('No visible blank canvas point is available.')
  })
  await page.mouse.click(point.x, point.y)
  await page.waitForFunction(() => {
    const viewport = document.querySelector('.react-flow__viewport')
    return (
      viewport &&
      new DOMMatrixReadOnly(getComputedStyle(viewport).transform).a === 0.5 &&
      document.querySelectorAll('.react-flow__node.selected').length === 0
    )
  })
}

async function readNodeState(node: Locator) {
  return node.evaluate((element) => {
    const transform = new DOMMatrixReadOnly(getComputedStyle(element).transform)
    return {
      selected: element.classList.contains('selected'),
      hasOutline: element.querySelector('[data-workbench-node-selection]') !== null,
      inputFocused:
        document.activeElement?.matches('.xterm-helper-textarea') === true &&
        element.contains(document.activeElement),
      position: { x: transform.e, y: transform.f }
    }
  })
}

async function readPersistedPosition(page: Page, workbench: E2eWorkbench, nodeType: string) {
  return page.evaluate(
    async ({ projectDirectory, nodeType }) => {
      const workbenches = await window.cleancode?.listWorkbenches()
      const current = workbenches?.find(
        (candidate) => candidate.project.directory === projectDirectory
      )
      const position =
        nodeType === 'agentConsole'
          ? current?.agents?.[0]?.layout.position
          : nodeType === 'terminal'
            ? current?.graph.blocks[0]?.position
            : current?.graph.terminalGroups[0]?.position
      if (!position) throw new Error(`No persisted ${nodeType} position is available.`)
      return position
    },
    { projectDirectory: workbench.projectDirectory, nodeType }
  )
}
