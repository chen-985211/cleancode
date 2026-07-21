// @vitest-environment node

import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import type { ElectronApplication, Page } from 'playwright'

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
import {
  e2eShellReadyMarker,
  readTerminalSessionId,
  waitForTerminalOutput,
  waitForTerminalShellReady,
  writeTerminalCommand
} from '../support/e2eTerminal'

describe('terminal daily interactions e2e', () => {
  let workbench: E2eWorkbench
  let electronApp: ElectronApplication
  let page: Page
  let resources: E2eScenarioResources

  beforeEach(async () => {
    resources = {}
    workbench = await createE2eWorkbench('cleancode-terminal-daily-e2e')
    resources.workbench = workbench
    electronApp = await launchApp(workbench, {
      environment: { PS1: `${e2eShellReadyMarker} `, SHELL: '/bin/sh' }
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
  })

  it(
    'keeps search, Unicode, paste and renderer fallback usable in one live session',
    async () => {
      await createRunningTerminal(page)
      const originalSessionId = await readTerminalSessionId(page, 'Terminal 1')
      await writeTerminalCommand(
        page,
        'Terminal 1',
        "printf 'SEARCH_''TARGET one\\n中文，🙂，é\\nSEARCH_''TARGET two\\n'\r"
      )
      await waitForTerminalOutput(page, 'Terminal 1', 'SEARCH_TARGET two')

      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+f' : 'Control+f')
      const search = page.getByRole('searchbox', { name: '搜索终端输出' })
      await search.fill('SEARCH_TARGET')
      await page.getByText('1 / 2', { exact: true }).waitFor()

      if (process.env.CLEANCODE_CAPTURE_PHASE_TWO_VISUAL === '1') {
        const resultDirectory = join(process.cwd(), 'test-results')
        await mkdir(resultDirectory, { recursive: true })
        await page.screenshot({
          path: join(resultDirectory, 'terminal-phase-two-search.png')
        })
      }

      await search.press('Escape')
      const terminalViewport = page.locator('[data-terminal-block-id] .terminal-viewport')
      const initialRenderer = await terminalViewport.getAttribute('data-terminal-renderer')
      expect(['dom', 'webgl']).toContain(initialRenderer)
      if (initialRenderer === 'webgl') {
        await terminalViewport.evaluate((element) => {
          for (const canvas of element.querySelectorAll('canvas')) {
            canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext()
            canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
          }
        })
        await expect
          .poll(() => terminalViewport.getAttribute('data-terminal-renderer'), { timeout: 5_000 })
          .toBe('dom')
      }

      const clipboardText = "printf '__PASTE_AFTER_RENDERER_FALLBACK__\\n'\r"
      await terminalViewport.evaluate((element, text) => {
        const clipboardData = new DataTransfer()
        clipboardData.setData('text/plain', text)
        element
          .querySelector('textarea')
          ?.dispatchEvent(
            new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData })
          )
      }, clipboardText)
      await waitForTerminalOutput(page, 'Terminal 1', '__PASTE_AFTER_RENDERER_FALLBACK__')

      expect(await readTerminalSessionId(page, 'Terminal 1')).toBe(originalSessionId)
    },
    electronScenarioTimeoutMs
  )
})

async function createRunningTerminal(page: Page): Promise<void> {
  await expectDesktopRuntime(page)
  await page.getByRole('button', { name: '添加项目' }).click()
  await page.getByRole('button', { name: '新建终端积木' }).click()
  await page.getByText('运行中').waitFor()
  await readTerminalSessionId(page, 'Terminal 1')
  await waitForTerminalShellReady(page, 'Terminal 1')
  await page.waitForFunction(() =>
    document.activeElement?.classList.contains('xterm-helper-textarea')
  )
}
