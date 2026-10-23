// @vitest-environment node

import type { Page } from 'playwright'
import { readE2eBlockGraph } from '../support/e2eBlockGraph'
import { pollUntilState } from '../support/e2ePolling'
import {
  createE2eWorkbench,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  launchApp,
  selectBlankCanvasAction,
  teardownE2eScenario,
  type E2eScenarioResources,
  type E2eWorkbench
} from '../support/e2eWorkbench'
import { createE2eTerminalEnvironment, waitForTerminalShellReady } from '../support/e2eTerminal'

// Real keyboard dispatch, persisted disclosure, deferred xterm mounting and browser focus
// must work together; pure component tests cover request deduplication and cold/warm branches.
describe('quick execution command editing', () => {
  let resources: E2eScenarioResources
  let workbench: E2eWorkbench
  let page: Page

  beforeEach(async () => {
    resources = {}
    workbench = await createE2eWorkbench('cleancode-quick-execution-edit')
    resources.workbench = workbench
    const app = await launchApp(workbench, { environment: createE2eTerminalEnvironment() })
    resources.electronApp = app
    page = await app.firstWindow()
    resources.page = page
    await page.waitForLoadState('domcontentloaded')
  }, electronLaunchTimeoutMs)

  afterEach(async ({ task }) =>
    teardownE2eScenario({
      resources,
      taskFailed: task.result?.state === 'fail',
      taskName: task.name
    })
  )

  it(
    'edits an unconfigured folded terminal after reload and after a warm collapse',
    async () => {
      await page.getByRole('button', { name: '添加项目' }).click()
      await selectBlankCanvasAction(page, '新建终端')
      await waitForTerminalShellReady(page, 'Terminal 1')
      await page.getByRole('button', { name: '添加画布对象' }).click()
      await page
        .getByRole('dialog', { name: '选择要绑定的画布对象' })
        .getByRole('button')
        .filter({ hasText: 'Terminal 1' })
        .click()
      await pollUntilState({
        description: 'terminal shortcut binding persisted',
        observe: () => readE2eBlockGraph(workbench),
        accept: (graph) => graph.quickExecutionSlots?.[0]?.target?.type === 'terminal',
        timeoutMs: 10000
      })
      const terminal = page.locator('[data-terminal-block-id]').first()
      for (const cold of [true, false]) {
        await terminal.locator('.terminal-node__disclosure').click()
        await pollUntilState({
          description: 'collapsed terminal persisted',
          observe: () => readE2eBlockGraph(workbench),
          accept: (graph) => graph.blocks[0]?.isCollapsed === true,
          timeoutMs: 10000
        })
        if (cold) {
          await page.reload()
          await terminal.locator('.terminal-node--collapsed').waitFor()
          expect(await terminal.locator('.terminal-node__body').count()).toBe(0)
        }
        await page.getByRole('button', { name: '新建 Agent' }).focus()
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+1' : 'Control+1')
        const command = page.getByRole('textbox', { name: '启动命令', exact: true })
        await command.waitFor({ state: 'visible' })
        await page.waitForFunction(
          () => document.activeElement?.getAttribute('aria-label') === '启动命令'
        )
        expect(await command.evaluate((element) => element.closest('[inert]') === null)).toBe(true)
        await command.fill('echo quick-execution-edit')
        if (cold) {
          await page.keyboard.press('Escape')
          await page.waitForFunction(
            () => document.activeElement?.getAttribute('aria-label') === 'Terminal 1 编辑终端信息'
          )
        } else {
          await page.getByRole('button', { name: '保存终端信息' }).click()
          const saved = await pollUntilState({
            description: 'quick execution command and expanded layout persisted',
            observe: () => readE2eBlockGraph(workbench),
            accept: (graph) =>
              graph.blocks[0]?.launchCommand === 'echo quick-execution-edit' &&
              graph.blocks[0]?.isCollapsed === false,
            timeoutMs: 10000
          })
          expect(saved.quickExecutionSlots?.[0]?.target).toEqual({
            type: 'terminal',
            terminalBlockId: saved.blocks[0]!.id
          })
        }
      }
    },
    electronScenarioTimeoutMs
  )
})
