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
  readOnlyJsonFile,
  waitForJsonFile,
  type E2eWorkbench
} from '../support/e2eWorkbench'
import {
  readCanvasViewportTransform,
  readXtermSelection,
  selectExactXtermText,
  setCanvasZoomFromDefault
} from '../support/terminalSelectionE2e'

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
    'selects exact Agent output on a zoomed canvas without moving the node',
    async () => {
      await expectDesktopRuntime(page)
      await page.getByRole('button', { name: '添加项目' }).click()
      await waitForAgentCount(page, 1)
      await page.getByText('Codex 会话已结束').waitFor()

      const agent = page.locator('[data-agent-console-node]').first()
      const agentId = await agent.getAttribute('data-agent-console-node')
      const selectedText = 'cleancode-agent-selection'
      const outputLine = `left-guard-${selectedText}-right-guard`

      expect(agentId).not.toBeNull()
      await electronApp.evaluate(
        ({ BrowserWindow }, event) => {
          BrowserWindow.getAllWindows()[0]?.webContents.send('cleancode:agent-pty-output', event)
        },
        {
          agentId: agentId!,
          data: `\r\n\r\n\r\n${outputLine}\r\n`,
          sessionId: 'test-agent-main'
        }
      )
      await page.waitForFunction(
        (text) =>
          Array.from(document.querySelectorAll('.agent-terminal-viewport .xterm-rows > div')).some(
            (row) => row.textContent?.includes(text)
          ),
        outputLine
      )

      const zoom = await setCanvasZoomFromDefault(page, 'in')
      const terminal = agent.locator('.agent-terminal-viewport')
      const beforeLayout = await readAgentLayout(workbench)
      const beforeViewport = await readCanvasViewportTransform(page)

      await selectExactXtermText(page, terminal, selectedText)

      expect(zoom).toBeGreaterThan(1)
      expect(await readXtermSelection(terminal)).toBe(selectedText)
      expect(await readAgentLayout(workbench)).toEqual(beforeLayout)
      expect(await readCanvasViewportTransform(page)).toBe(beforeViewport)
    },
    electronScenarioTimeoutMs
  )

  it(
    'selects an Agent from its title and resizes its unselected top-left corner',
    async () => {
      await expectDesktopRuntime(page)
      await page.getByRole('button', { name: '添加项目' }).click()
      await waitForAgentCount(page, 1)

      const agent = page.locator('[data-agent-console-node]').first()
      await waitForAgentSelectionState(page, 'unselected')
      await agent.locator('.agent-console__terminal-shell').click()
      await waitForAgentSelectionState(page, 'unselected')

      const beforeBox = await readRequiredBoundingBox(agent)
      const beforeLayout = await readAgentLayout(workbench)
      const resizeDrag = await startAgentResizeFromTopLeft(page)

      await page.mouse.move(resizeDrag.startX - 100, resizeDrag.startY - 80, { steps: 18 })
      await page.mouse.up()

      const afterLayout = await waitForAgentLayoutChange(workbench, beforeLayout)
      const afterBox = await readRequiredBoundingBox(agent)

      expect(afterLayout.position.x).toBeLessThan(beforeLayout.position.x - 60)
      expect(afterLayout.position.y).toBeLessThan(beforeLayout.position.y - 45)
      expect(afterLayout.size.width).toBeGreaterThan(beforeLayout.size.width + 60)
      expect(afterLayout.size.height).toBeGreaterThan(beforeLayout.size.height + 45)
      expect(
        Math.abs(
          afterLayout.position.x +
            afterLayout.size.width -
            (beforeLayout.position.x + beforeLayout.size.width)
        )
      ).toBeLessThan(2)
      expect(
        Math.abs(
          afterLayout.position.y +
            afterLayout.size.height -
            (beforeLayout.position.y + beforeLayout.size.height)
        )
      ).toBeLessThan(2)
      expect(afterBox.width).toBeGreaterThan(beforeBox.width + 60)
      expect(afterBox.height).toBeGreaterThan(beforeBox.height + 45)
      await waitForAgentSelectionState(page, 'unselected')

      await agent.locator('.agent-console__header').click()
      await waitForAgentSelectionState(page, 'selected')
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

async function waitForAgentSelectionState(
  page: Page,
  state: 'selected' | 'unselected'
): Promise<void> {
  await page.waitForFunction(
    (expectedState) =>
      document.querySelector('[data-agent-console-node]')?.getAttribute('data-selection-state') ===
      expectedState,
    state
  )
}

interface AgentLayout {
  readonly position: { readonly x: number; readonly y: number }
  readonly size: { readonly width: number; readonly height: number }
}

async function readAgentLayout(workbench: E2eWorkbench): Promise<AgentLayout> {
  const store = JSON.parse(
    await readOnlyJsonFile(workbench.appStateDirectory, 'agent-sessions.json')
  ) as { workspaces: Array<{ agents: Array<{ layout: AgentLayout }> }> }

  return store.workspaces[0]!.agents[0]!.layout
}

async function waitForAgentLayoutChange(
  workbench: E2eWorkbench,
  beforeLayout: AgentLayout
): Promise<AgentLayout> {
  const deadline = Date.now() + 5_000

  while (Date.now() < deadline) {
    const layout = await readAgentLayout(workbench)

    if (
      layout.position.x !== beforeLayout.position.x ||
      layout.position.y !== beforeLayout.position.y ||
      layout.size.width !== beforeLayout.size.width ||
      layout.size.height !== beforeLayout.size.height
    ) {
      return layout
    }

    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  return readAgentLayout(workbench)
}

async function startAgentResizeFromTopLeft(page: Page): Promise<{
  readonly startX: number
  readonly startY: number
}> {
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('.agent-console-node__resize-handle')).filter(
        (element) => {
          const bounds = element.getBoundingClientRect()
          return bounds.width > 0 && bounds.height > 0
        }
      ).length === 4
  )
  const handles = page.locator('.agent-console-node__resize-handle')
  const boxes = await handles.evaluateAll((elements) =>
    elements.map((element) => {
      const bounds = element.getBoundingClientRect()
      return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
      }
    })
  )
  const topLeft = boxes.sort((left, right) => left.x + left.y - (right.x + right.y))[0]

  expect(topLeft).toBeDefined()
  const startX = topLeft!.x + topLeft!.width / 2
  const startY = topLeft!.y + topLeft!.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()

  return { startX, startY }
}

async function readRequiredBoundingBox(locator: ReturnType<Page['locator']>) {
  return locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    }
  })
}

async function selectTheme(page: Page, name: '浅色' | '深色'): Promise<void> {
  await page.getByRole('button', { name: '主题设置' }).click()
  await page.getByText(name, { exact: true }).click()
  await page.getByRole('button', { name: '关闭主题设置' }).click()
}
