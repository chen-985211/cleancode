// @vitest-environment node

import type { ElectronApplication, Locator, Page } from 'playwright'

import {
  createE2eWorkbench,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  e2eTeardownTimeoutMs,
  expectDesktopRuntime,
  launchApp,
  selectBlankCanvasAction,
  teardownE2eScenario,
  type E2eScenarioResources,
  type E2eWorkbench
} from '../support/e2eWorkbench'
import { readE2eBlockGraph } from '../support/e2eBlockGraph'
import {
  createE2ePrintCommand,
  createE2eTerminalEnvironment,
  readTerminalSessionId,
  submitTerminalMetadataForm,
  waitForTerminalOutputInNewSession,
  waitForTerminalShellReady,
  waitForTerminalViewportGeometry
} from '../support/e2eTerminal'
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
    // Compact CI geometry keeps fixed canvas controls close to terminal title actions.
    await page.setViewportSize({ width: 1024, height: 681 })
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
      await page.getByRole('button', { name: '展开小地图' }).click()
      // Keep title actions reachable regardless of the minimap's initial footprint.
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+F' : 'Control+Shift+F')
      await page.waitForFunction(() => {
        const nodes = Array.from(document.querySelectorAll('[data-terminal-block-id]'))
        if (nodes.length !== 2) return false
        const [first, second] = nodes.map((node) => node.getBoundingClientRect())
        return (
          first.right <= second.left ||
          second.right <= first.left ||
          first.bottom <= second.top ||
          second.bottom <= first.top
        )
      })
      await waitForTerminalViewportGeometry(page, initialSessions.first)
      await waitForTerminalViewportGeometry(page, initialSessions.second)

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
      await page.getByRole('button', { name: '收起小地图' }).click()
      await page.locator('.canvas-minimap__panel').waitFor({ state: 'detached' })
      await page.getByRole('button', { name: '适应画布' }).click()
      await waitForTerminalViewportGeometry(page, initialSessions.first)
      await waitForTerminalViewportGeometry(page, initialSessions.second)
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
  await selectBlankCanvasAction(page, '新建终端')
  const firstSessionId = await waitForTerminalShellReady(page, 'Terminal 1')
  // The next canvas placement must use the settled viewport, not the creation animation.
  await waitForTerminalViewportGeometry(page, firstSessionId)

  await selectBlankCanvasAction(page, '新建终端')
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
  // Overview may place compact title actions beneath the fixed workbench toolbar.
  // Minimap navigation also reaches terminals outside the current viewport.
  await page.getByRole('button', { name: `聚焦终端 ${terminalName}`, exact: true }).click()
  await waitForTerminalViewportGeometry(page, await readTerminalSessionId(page, terminalName))
  await page.getByRole('button', { name: `${terminalName} 配置启动命令` }).click()
  const input = page.getByRole('textbox', { name: '启动命令' })
  await input.fill(command)
  await submitTerminalMetadataForm(page.getByRole('form', { name: '编辑终端信息' }), terminalName)
}

async function connectTerminalNodes(page: Page): Promise<void> {
  const sourceHandle = terminalNodeByTitle(page, 'Terminal 1').locator(
    '.terminal-node__handle--output'
  )
  const targetHandle = terminalNodeByTitle(page, 'Terminal 2').locator(
    '.terminal-node__handle--input'
  )
  // Fit-to-canvas can resume after two identical geometry samples on a busy
  // runner. Let locator actionability check the live handles before dragging.
  await sourceHandle.dragTo(targetHandle, { steps: 20 })
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
