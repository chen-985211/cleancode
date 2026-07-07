// @vitest-environment node

import type { ElectronApplication, Page } from 'playwright'

import {
  buildElectronApp,
  cleanupE2eWorkbench,
  createE2eWorkbench,
  electronBuildTimeoutMs,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  focusSelectedTerminalViewport,
  launchApp,
  readOnlyJsonFile,
  type E2eWorkbench,
  typeTerminalCommand
} from '../support/e2eWorkbench'

describe('run terminal sessions e2e', () => {
  let workbench: E2eWorkbench
  let electronApp: ElectronApplication
  let page: Page

  beforeAll(async () => {
    await buildElectronApp()
  }, electronBuildTimeoutMs)

  beforeEach(async () => {
    workbench = await createE2eWorkbench('cleancode-run-terminal-e2e')
    electronApp = await launchApp(workbench)
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
  }, electronLaunchTimeoutMs)

  afterEach(async () => {
    await electronApp.close()
    await cleanupE2eWorkbench(workbench)
  })

  it(
    'runs shell commands from the active project workspace',
    async () => {
      await createRunningTerminal(page)

      await typeTerminalCommand(page, 'printf cleancode-e2e-ok')
      await waitForTerminalOutput(page, 'Terminal 1', 'cleancode-e2e-ok')
      await typeTerminalCommand(page, 'pwd')
      await waitForTerminalOutput(page, 'Terminal 1', workbench.projectDirectory)

      const terminalOutput = page.getByLabel('Terminal 1 文本输出')
      const graph = JSON.parse(
        await readOnlyJsonFile(workbench.appStateDirectory, 'default-graph.json')
      ) as {
        blocks: Array<{ type: string }>
      }

      expect(graph.blocks).toHaveLength(1)
      expect(graph.blocks[0]?.type).toBe('terminal')
      expect(await terminalOutput.textContent()).toContain('cleancode-e2e-ok')
      expect(await terminalOutput.textContent()).toContain(workbench.projectDirectory)
      expect(await terminalOutput.textContent()).not.toMatch(/^%\r?\n/)
      expect(await terminalOutput.textContent()).not.toMatch(/^printf %/)
    },
    electronScenarioTimeoutMs
  )

  it(
    'interrupts the active command without exiting the terminal session',
    async () => {
      await createRunningTerminal(page)

      await typeTerminalCommand(page, 'printf started-ok; sleep 30; printf finished-bad')
      await waitForTerminalOutput(page, 'Terminal 1', 'started-ok')

      await page.getByRole('button', { name: 'Terminal 1 停止当前命令' }).click()

      expect(await page.getByText('已退出').count()).toBe(0)
      await typeTerminalCommand(page, 'printf after-stop-ok')
      await waitForTerminalOutput(page, 'Terminal 1', 'after-stop-ok')
      await page.getByText('运行中').waitFor()
    },
    electronScenarioTimeoutMs
  )

  it(
    'restarts a terminal session and accepts input in the replacement session',
    async () => {
      await createRunningTerminal(page)
      const previousSessionId = await readTerminalSessionId(page)

      await page.getByRole('button', { name: 'Terminal 1 重启终端' }).click()
      await waitForTerminalSessionIdToChange(page, previousSessionId)

      await typeTerminalCommand(page, 'printf restart-ok')
      await waitForTerminalOutput(page, 'Terminal 1', 'restart-ok')
    },
    electronScenarioTimeoutMs
  )
})

async function createRunningTerminal(page: Page): Promise<void> {
  await expectDesktopRuntime(page)
  await page.getByRole('button', { name: '添加项目' }).click()
  await page.getByRole('button', { name: '新建终端积木' }).click()
  await page.getByText('运行中').waitFor()
  await focusSelectedTerminalViewport(page)
}

async function readTerminalSessionId(page: Page): Promise<string> {
  const sessionId = await page
    .locator('[data-terminal-output-tail="true"]')
    .getAttribute('data-terminal-session-id')

  expect(sessionId).toEqual(expect.any(String))
  expect(sessionId).not.toBe('')

  return sessionId!
}

async function waitForTerminalSessionIdToChange(
  page: Page,
  previousSessionId: string
): Promise<string> {
  await page.waitForFunction((previousSessionId) => {
    const nextSessionId = document
      .querySelector('[data-terminal-output-tail="true"]')
      ?.getAttribute('data-terminal-session-id')

    return Boolean(nextSessionId) && nextSessionId !== previousSessionId
  }, previousSessionId)

  return readTerminalSessionId(page)
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
