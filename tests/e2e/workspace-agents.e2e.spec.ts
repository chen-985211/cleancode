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
  launchApp,
  waitForJsonFile,
  type E2eWorkbench
} from '../support/e2eWorkbench'

describe('workspace Agents e2e', () => {
  let workbench: E2eWorkbench
  let electronApp: ElectronApplication
  let page: Page

  beforeAll(async () => {
    await buildElectronApp()
  }, electronBuildTimeoutMs)

  beforeEach(async () => {
    workbench = await createE2eWorkbench('cleancode-workspace-agents-e2e')
    electronApp = await launchApp(workbench)
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
  }, electronLaunchTimeoutMs)

  afterEach(async () => {
    await electronApp.close()
    await cleanupE2eWorkbench(workbench)
  })

  it(
    'creates and removes independent Agent canvas nodes and persists the remaining set',
    async () => {
      await expectDesktopRuntime(page)
      await selectTheme(page, '浅色')
      await page.getByRole('button', { name: '添加项目' }).click()
      await waitForAgentCount(page, 1)

      const agentTerminal = page.locator('.agent-terminal-viewport').first()
      await agentTerminal.waitFor()
      expect(await agentTerminal.getAttribute('data-agent-terminal-source-theme')).toBe('light')
      await selectTheme(page, '深色')
      expect(await agentTerminal.evaluate((element) => getComputedStyle(element).filter)).not.toBe(
        'none'
      )
      expect(await agentTerminal.getAttribute('data-agent-terminal-source-theme')).toBe('light')

      page.once('dialog', (dialog) => dialog.accept())
      await page.getByRole('button', { name: '新建 Agent' }).click()
      await waitForAgentCount(page, 2)
      expect(await page.locator('[data-minimap-node-id^="agent:"]').count()).toBe(2)

      await page.getByRole('button', { name: '聚焦 Agent Agent 2' }).click()
      await page.getByRole('button', { name: 'Agent 2 更多操作' }).click()
      await page.getByRole('menuitem', { name: '移除 Agent' }).click()
      await page
        .getByRole('dialog', { name: '移除 Agent' })
        .getByRole('button', { name: '移除' })
        .click()
      await waitForAgentCount(page, 1)

      const store = JSON.parse(
        await waitForJsonFile(workbench.appStateDirectory, 'agent-sessions.json')
      ) as { version: number; workspaces: Array<{ agents: unknown[] }> }
      expect(store.version).toBe(2)
      expect(store.workspaces[0]?.agents).toHaveLength(1)
    },
    electronScenarioTimeoutMs
  )

  it(
    'keeps the Agent terminal scrollbar on the right edge of its content frame',
    async () => {
      await expectDesktopRuntime(page)
      await page.getByRole('button', { name: '添加项目' }).click()
      await waitForAgentCount(page, 1)

      const rightInsets = await page
        .locator('.agent-terminal-viewport')
        .first()
        .evaluate((element) => {
          const terminalShell = element.closest('.agent-console__terminal-shell')
          const scrollbarViewport = element.querySelector('.xterm-viewport')

          if (!terminalShell || !scrollbarViewport) {
            throw new Error('Agent terminal layout is incomplete.')
          }

          const shellRight = terminalShell.getBoundingClientRect().right

          return {
            scrollbar: shellRight - scrollbarViewport.getBoundingClientRect().right,
            terminal: shellRight - element.getBoundingClientRect().right,
            thumbBorder: Number.parseFloat(
              getComputedStyle(scrollbarViewport, '::-webkit-scrollbar-thumb').borderRightWidth
            )
          }
        })

      expect(rightInsets.terminal).toBeLessThanOrEqual(1)
      expect(rightInsets.scrollbar).toBeLessThanOrEqual(1)
      expect(rightInsets.thumbBorder).toBe(0)
    },
    electronScenarioTimeoutMs
  )

  it(
    'keeps full-width punctuation at a stable Agent terminal cell width',
    async () => {
      await expectDesktopRuntime(page)
      await page.getByRole('button', { name: '添加项目' }).click()
      await waitForAgentCount(page, 1)

      const punctuationWidths = await page
        .locator('.agent-terminal-viewport')
        .first()
        .evaluate((element) => {
          const helperContainer = element.querySelector('.xterm-helpers')
          const rows = element.querySelector('.xterm-rows')

          if (!helperContainer || !rows) {
            throw new Error('Agent terminal text metrics are unavailable.')
          }

          const rowStyle = getComputedStyle(rows)
          const measure = (text: string): number => {
            const sample = document.createElement('span')
            sample.textContent = text
            sample.style.display = 'inline-block'
            sample.style.fontFamily = rowStyle.fontFamily
            sample.style.fontKerning = 'none'
            sample.style.fontSize = rowStyle.fontSize
            sample.style.fontWeight = rowStyle.fontWeight
            sample.style.position = 'absolute'
            sample.style.visibility = 'hidden'
            sample.style.whiteSpace = 'pre'
            helperContainer.append(sample)
            const width = sample.offsetWidth
            sample.remove()
            return width
          }

          return {
            repeated: measure('，'.repeat(32)) / 32,
            single: measure('，')
          }
        })

      expect(Math.abs(punctuationWidths.repeated - punctuationWidths.single)).toBeLessThanOrEqual(
        0.1
      )
    },
    electronScenarioTimeoutMs
  )
})

async function waitForAgentCount(page: Page, count: number): Promise<void> {
  await page.waitForFunction(
    (expectedCount) =>
      document.querySelectorAll('[data-agent-console-node]').length === expectedCount,
    count
  )
}

async function selectTheme(page: Page, name: '浅色' | '深色'): Promise<void> {
  await page.getByRole('button', { name: '主题设置' }).click()
  await page.getByText(name, { exact: true }).click()
  await page.getByRole('button', { name: '关闭主题设置' }).click()
}
