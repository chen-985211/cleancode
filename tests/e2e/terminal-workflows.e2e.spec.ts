// @vitest-environment node

import type { ElectronApplication, Page } from 'playwright'

import {
  createE2eWorkbench,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  launchApp,
  readOnlyJsonFile,
  teardownE2eScenario,
  type E2eScenarioResources,
  type E2eWorkbench
} from '../support/e2eWorkbench'
import { readRequiredBoundingBox } from '../support/terminalResizeE2e'

describe('terminal workflows e2e', () => {
  let workbench: E2eWorkbench
  let electronApp: ElectronApplication
  let page: Page
  let resources: E2eScenarioResources

  beforeEach(async () => {
    resources = {}
    workbench = await createE2eWorkbench('cleancode-terminal-workflow-e2e')
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
    'connects terminals and runs dependent commands as one workflow',
    async () => {
      await expectDesktopRuntime(page)
      await page.getByRole('button', { name: '添加项目' }).click()
      await page.getByRole('button', { name: '新建终端积木' }).click()
      await page.getByRole('button', { name: '新建终端积木' }).click()
      await page.getByText('运行中').first().waitFor()
      await page.getByRole('button', { name: '小地图适应' }).click()
      await page.waitForTimeout(250)

      await configureLaunchCommand(page, 'Terminal 1', 'printf "workflow-install-complete\\n"')
      await configureLaunchCommand(page, 'Terminal 2', 'printf "workflow-build-complete\\n"')
      await connectTerminalNodes(page)

      await page.getByRole('button', { name: 'Terminal 1 从此处运行终端流程' }).click()
      await waitForTerminalOutput(page, 'Terminal 1', 'workflow-install-complete')
      await waitForTerminalOutput(page, 'Terminal 2', 'workflow-build-complete')
      await page.getByText('流程成功').waitFor()

      const graph = JSON.parse(
        await readOnlyJsonFile(workbench.appStateDirectory, 'default-graph.json')
      ) as { connections: Array<{ sourceBlockId: string; targetBlockId: string }> }

      expect(graph.connections).toHaveLength(1)
    },
    electronScenarioTimeoutMs
  )
})

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
  const sourceHandle = page
    .locator('[data-terminal-block-id]')
    .filter({ hasText: 'Terminal 1' })
    .locator('.terminal-node__handle--output')
  const targetHandle = page
    .locator('[data-terminal-block-id]')
    .filter({ hasText: 'Terminal 2' })
    .locator('.terminal-node__handle--input')
  const sourceBox = await readRequiredBoundingBox(sourceHandle)
  const targetBox = await readRequiredBoundingBox(targetHandle)

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 12
  })
  await page.mouse.up()
  await page.locator('.react-flow__edge').waitFor({ state: 'attached' })
}

async function waitForTerminalOutput(
  page: Page,
  terminalName: string,
  output: string
): Promise<void> {
  await page.waitForFunction(
    ({ terminalName, output }) =>
      document
        .querySelector(`[aria-label="${terminalName} 文本输出"]`)
        ?.textContent?.includes(output) ?? false,
    { terminalName, output }
  )
}
