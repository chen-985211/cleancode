// @vitest-environment node

import type { ElectronApplication, Locator, Page } from 'playwright'

import {
  createE2eWorkbench,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  e2eTeardownTimeoutMs,
  expectDesktopRuntime,
  launchApp,
  teardownE2eScenario,
  type E2eScenarioResources,
  type E2eWorkbench
} from '../support/e2eWorkbench'
import { readE2eBlockGraph } from '../support/e2eBlockGraph'
import {
  createE2ePrintCommand,
  createE2eTerminalEnvironment,
  readTerminalSessionId,
  waitForTerminalOutputInNewSession,
  waitForTerminalShellReady,
  waitForTerminalViewportGeometry
} from '../support/e2eTerminal'
import { readRequiredBoundingBox } from '../support/terminalResizeE2e'
import { ensureTerminalDomRenderer } from '../support/terminalSelectionE2e'

describe('terminal workflows e2e', () => {
  let workbench: E2eWorkbench
  let electronApp: ElectronApplication
  let page: Page
  let resources: E2eScenarioResources

  beforeEach(async () => {
    resources = {}
    workbench = await createE2eWorkbench('cleancode-terminal-workflow-e2e')
    resources.workbench = workbench
    electronApp = await launchApp(workbench, {
      environment: createE2eTerminalEnvironment()
    })
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
  }, e2eTeardownTimeoutMs)

  it(
    'connects terminals and runs dependent commands as one workflow',
    { tags: 'smoke', timeout: electronScenarioTimeoutMs },
    async () => {
      const initialSessions = await createTwoRunningTerminals(page)

      await configureLaunchCommand(
        page,
        'Terminal 1',
        createE2ePrintCommand('workflow-install-complete')
      )
      await configureLaunchCommand(
        page,
        'Terminal 2',
        createE2ePrintCommand('workflow-build-complete')
      )
      await connectTerminalNodes(page)

      await page.getByRole('button', { name: 'Terminal 1 从此处运行终端流程' }).click()
      const firstTaskSession = await waitForTerminalOutputInNewSession(
        page,
        'Terminal 1',
        initialSessions.first,
        'workflow-install-complete'
      )
      const secondTaskSession = await waitForTerminalOutputInNewSession(
        page,
        'Terminal 2',
        initialSessions.second,
        'workflow-build-complete'
      )
      await page.getByText('流程运行成功').waitFor()

      expect(await readTerminalSessionId(page, 'Terminal 1')).toBe(firstTaskSession)
      expect(await readTerminalSessionId(page, 'Terminal 2')).toBe(secondTaskSession)
      await waitForVisibleXtermText(page, firstTaskSession, 'workflow-install-complete')
      await waitForVisibleXtermText(page, secondTaskSession, 'workflow-build-complete')

      const graph = await readE2eBlockGraph(workbench)

      expect(graph.connections).toHaveLength(1)
    }
  )
})

async function createTwoRunningTerminals(
  page: Page
): Promise<{ readonly first: string; readonly second: string }> {
  await expectDesktopRuntime(page)
  await page.getByRole('button', { name: '添加项目' }).click()
  await page.getByRole('button', { name: '新建终端积木' }).click()
  await page.getByRole('button', { name: '新建终端积木' }).click()
  const firstSessionId = await waitForTerminalShellReady(page, 'Terminal 1')
  const secondSessionId = await waitForTerminalShellReady(page, 'Terminal 2')

  await page.getByRole('button', { name: '适应画布' }).click()
  await waitForTerminalViewportGeometry(page, firstSessionId)
  await waitForTerminalViewportGeometry(page, secondSessionId)

  return { first: firstSessionId, second: secondSessionId }
}

async function configureLaunchCommand(
  page: Page,
  terminalName: string,
  command: string
): Promise<void> {
  await page.getByRole('button', { name: `${terminalName} 启动命令` }).click()
  const input = page.getByRole('textbox', { name: '启动命令' })
  await input.fill(command)
  await input.press('Enter')
  await input.waitFor({ state: 'detached' })
}

async function connectTerminalNodes(page: Page): Promise<void> {
  const sourceHandle = terminalNodeByTitle(page, 'Terminal 1').locator(
    '.terminal-node__handle--output'
  )
  const targetHandle = terminalNodeByTitle(page, 'Terminal 2').locator(
    '.terminal-node__handle--input'
  )
  const sourceBox = await readRequiredBoundingBox(sourceHandle)
  const targetBox = await readRequiredBoundingBox(targetHandle)
  const sourcePoint = {
    x: sourceBox.x + sourceBox.width - 1,
    y: sourceBox.y + sourceBox.height / 2
  }
  const targetPoint = {
    x: targetBox.x + 1,
    y: targetBox.y + targetBox.height / 2
  }

  await page.mouse.move(sourcePoint.x, sourcePoint.y)
  await page.mouse.down()
  await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 20 })
  await page.mouse.up()
  await page.locator('.react-flow__edge').waitFor({ state: 'attached' })
}

function terminalNodeByTitle(page: Page, terminalName: string): Locator {
  const exactTitle = page.locator('.terminal-node__title > strong').filter({
    hasText: new RegExp(`^${escapeRegularExpression(terminalName)}$`)
  })
  return page.locator('[data-terminal-block-id]').filter({ has: exactTitle })
}

async function waitForVisibleXtermText(
  page: Page,
  sessionId: string,
  expectedText: string
): Promise<void> {
  const outputTail = page.locator(
    `[data-terminal-output-tail][data-terminal-session-id="${sessionId}"]`
  )
  const terminal = page
    .locator('.terminal-output-shell')
    .filter({ has: outputTail })
    .locator('.terminal-viewport')
  await ensureTerminalDomRenderer(terminal)
  await page.waitForFunction(
    ({ expectedText, sessionId }) =>
      document
        .querySelector<HTMLElement>(
          `[data-terminal-output-tail][data-terminal-session-id="${sessionId}"]`
        )
        ?.closest('.terminal-output-shell')
        ?.querySelector<HTMLElement>('.xterm-rows')
        ?.textContent?.includes(expectedText) ?? false,
    { expectedText, sessionId }
  )
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
