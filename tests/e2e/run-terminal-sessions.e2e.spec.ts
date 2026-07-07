// @vitest-environment node

import type { ElectronApplication, Page } from 'playwright'

import {
  buildElectronApp,
  cleanupE2eWorkbench,
  clickLocatorCenter,
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

      await clickLocatorCenter(page, page.getByRole('button', { name: 'Terminal 1 停止当前命令' }))

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

      await clickLocatorCenter(page, page.getByRole('button', { name: 'Terminal 1 重启终端' }))
      await waitForTerminalSessionIdToChange(page, previousSessionId)

      await typeTerminalCommand(page, 'printf restart-ok')
      await waitForTerminalOutput(page, 'Terminal 1', 'restart-ok')
    },
    electronScenarioTimeoutMs
  )

  it(
    'configures and quick launches one command in a replacement terminal session',
    async () => {
      await createRunningTerminal(page)
      const previousSessionId = await readTerminalSessionId(page)
      const launchOutput = 'quick-launch-e2e-once'
      const launchCommand =
        'printf "\\x71\\x75\\x69\\x63\\x6b\\x2d\\x6c\\x61\\x75\\x6e\\x63\\x68\\x2d\\x65\\x32\\x65\\x2d\\x6f\\x6e\\x63\\x65"'

      await clickLocatorCenter(page, page.getByRole('button', { name: 'Terminal 1 快速启动' }))
      const launchCommandInput = page.getByLabel('启动命令')

      await launchCommandInput.fill(launchCommand)
      await waitForLaunchCommandInputValue(page, launchCommand)
      await launchCommandInput.press('Enter')
      await waitForQuickLaunchState(page, 'configured')
      await clickLocatorCenter(page, page.getByRole('button', { name: 'Terminal 1 快速启动' }))
      await waitForTerminalSessionIdToChange(page, previousSessionId)
      await waitForTerminalOutput(page, 'Terminal 1', launchOutput)

      const graph = JSON.parse(
        await readOnlyJsonFile(workbench.appStateDirectory, 'default-graph.json')
      ) as {
        blocks: Array<{ launchCommand: string }>
      }
      const terminalOutput = await page.getByLabel('Terminal 1 文本输出').textContent()

      expect(graph.blocks[0]?.launchCommand).toBe(launchCommand)
      expect(countOccurrences(terminalOutput ?? '', launchOutput)).toBe(1)
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

async function waitForQuickLaunchState(
  page: Page,
  state: 'configured' | 'unconfigured'
): Promise<void> {
  await page.waitForFunction(
    (state) =>
      document
        .querySelector('[aria-label="Terminal 1 快速启动"]')
        ?.getAttribute('data-launch-command-state') === state,
    state
  )
}

async function waitForLaunchCommandInputValue(page: Page, value: string): Promise<void> {
  await page.waitForFunction((value) => {
    const input = document.querySelector('[aria-label="启动命令"]')

    return input instanceof HTMLInputElement && input.value === value
  }, value)
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

function countOccurrences(text: string, pattern: string): number {
  return text.split(pattern).length - 1
}
