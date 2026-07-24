// @vitest-environment node

import { delimiter } from 'node:path'

import type { ElectronApplication, Locator, Page } from 'playwright'

import {
  installFakeCodexCli,
  type FakeCodexCliFixture
} from '../fixtures/contexts/agent/fakeCodexCli'

import {
  createE2eWorkbench,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  launchApp,
  readOnlyJsonFile,
  teardownE2eScenario,
  waitForJsonFile,
  type E2eScenarioResources,
  type E2eWorkbench
} from '../support/e2eWorkbench'
import {
  ensureTerminalDomRenderer,
  readCanvasViewportTransform,
  readXtermSelection,
  selectExactXtermText,
  setCanvasZoomFromDefault
} from '../support/terminalSelectionE2e'

describe('workspace Agents e2e', () => {
  let workbench: E2eWorkbench
  let electronApp: ElectronApplication
  let fakeCodex: FakeCodexCliFixture
  let page: Page
  let resources: E2eScenarioResources

  beforeEach(async () => {
    resources = {}
    workbench = await createE2eWorkbench('cleancode-workspace-agents-e2e')
    resources.workbench = workbench
    fakeCodex = await installFakeCodexCli(workbench.appStateDirectory)
    electronApp = await launchApp(workbench, {
      environment: {
        CLEANCODE_FAKE_CODEX_REPORT_PATH: fakeCodex.reportPath,
        CLEANCODE_TEST_DISABLE_AGENT_AUTOSTART: '0',
        PATH: [fakeCodex.binDirectory, '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(delimiter),
        SHELL: '/bin/sh'
      }
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
    'creates and removes Agent canvas nodes and persists the remaining set',
    { tags: 'smoke', timeout: electronScenarioTimeoutMs },
    async () => {
      await expectDesktopRuntime(page)
      await page.getByRole('button', { name: '添加项目' }).click()
      await waitForAgentCreationReady(page)
      await waitForAgentCount(page, 0)

      await createCodexAgent(page)
      await waitForAgentCount(page, 1)
      await waitForAgentTerminals(page, 1)

      await page.getByRole('button', { name: '新建 Agent' }).click()
      await waitForAgentCount(page, 2)

      await page.getByRole('button', { name: 'Agent 2 更多操作' }).click()
      await page.getByRole('menuitem', { name: '移除' }).click()
      await waitForAgentCount(page, 1)

      const store = JSON.parse(
        await waitForJsonFile(workbench.appStateDirectory, 'agent-sessions.json')
      ) as { version: number; workspaces: Array<{ agents: unknown[] }> }
      expect(store.version).toBe(4)
      expect(store.workspaces[0]?.agents).toHaveLength(1)
    }
  )

  it(
    'keeps the Agent terminal scrollbar on the right edge of its content frame',
    async () => {
      await expectDesktopRuntime(page)
      await page.getByRole('button', { name: '添加项目' }).click()
      await createCodexAgent(page)
      await waitForAgentCount(page, 1)
      await waitForAgentTerminals(page, 1)

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
      await createCodexAgent(page)
      await waitForAgentCount(page, 1)
      await waitForAgentTerminals(page, 1)

      const agent = page.locator('[data-agent-console-node]').first()
      const selectedText = 'cleancode-agent-selection'
      const outputLine = `left-guard-${selectedText}-right-guard`
      const terminal = agent.locator('.agent-terminal-viewport')

      await ensureTerminalDomRenderer(terminal)
      await waitForTerminalDomText(terminal, 'CC_E2E_CODEX_READY')
      await terminal.click()
      await page.keyboard.press('Control+C')
      await page.getByText('Codex 会话已结束').waitFor()
      await terminal.click()
      await page.keyboard.type(`printf '\\n\\n\\n${outputLine}\\n'`)
      await page.keyboard.press('Enter')
      await waitForTerminalDomText(terminal, outputLine)

      const zoom = await setCanvasZoomFromDefault(page, 'in')
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
    'keeps Agent terminal content visually stable when the canvas clears selection',
    async () => {
      await expectDesktopRuntime(page)
      await page.getByRole('button', { name: '添加项目' }).click()
      await createCodexAgent(page)
      await waitForAgentCount(page, 1)
      await waitForAgentTerminals(page, 1)

      const agent = page.locator('[data-agent-console-node]').first()
      const terminal = agent.locator('.agent-terminal-viewport')
      await ensureTerminalDomRenderer(terminal)
      await agent.locator('.agent-console-actions__title').click()
      await waitForAgentSelectionState(page, 'selected')
      await terminal.locator('.xterm').evaluate((element) => {
        element.setAttribute('data-selection-stability-token', 'stable-xterm-surface')
      })

      const selectedPresentation = await agent.evaluate((element) => {
        const veil = element.querySelector<HTMLElement>('[data-workbench-node-selection]')
        if (!veil) throw new Error('Agent selection feedback is unavailable.')

        return {
          backgroundColor: getComputedStyle(veil).backgroundColor,
          terminalText: element.querySelector('.xterm-rows')?.textContent ?? ''
        }
      })

      expect(selectedPresentation.backgroundColor).toBe('rgba(0, 0, 0, 0)')
      await page.locator('.react-flow__pane').click({ force: true, position: { x: 8, y: 8 } })
      await waitForAgentSelectionState(page, 'unselected')

      expect(
        await terminal
          .locator('.xterm[data-selection-stability-token="stable-xterm-surface"]')
          .count()
      ).toBe(1)
      expect(await terminal.locator('.xterm-rows').textContent()).toBe(
        selectedPresentation.terminalText
      )
    },
    electronScenarioTimeoutMs
  )

  it(
    'selects and activates Agents continuously with a spatial shortcut from xterm',
    async () => {
      await expectDesktopRuntime(page)
      await page.getByRole('button', { name: '添加项目' }).click()
      await createCodexAgent(page)
      await waitForAgentCount(page, 1)
      await page.getByRole('button', { name: '新建 Agent' }).click()
      await waitForAgentCount(page, 2)
      await waitForAgentTerminals(page, 2)
      await page.locator('.react-flow__pane').click({ force: true, position: { x: 8, y: 8 } })
      await waitForAllAgentsUnselected(page)

      const agents = page.locator('[data-agent-console-node]')
      const target = await agents.evaluateAll((elements) => {
        const canvas = document.querySelector('.react-flow')
        if (!canvas) throw new Error('Canvas is unavailable.')

        const canvasBounds = canvas.getBoundingClientRect()
        const candidates = elements.map((element, index) => {
          const bounds = element.getBoundingClientRect()
          const horizontalDelta =
            bounds.x + bounds.width / 2 - (canvasBounds.x + canvasBounds.width / 2)
          const verticalDelta =
            bounds.y + bounds.height / 2 - (canvasBounds.y + canvasBounds.height / 2)

          if (Math.abs(horizontalDelta) >= Math.abs(verticalDelta)) {
            return {
              distance: Math.abs(horizontalDelta),
              index,
              key: horizontalDelta >= 0 ? 'ArrowRight' : 'ArrowLeft'
            }
          }
          return {
            distance: Math.abs(verticalDelta),
            index,
            key: verticalDelta >= 0 ? 'ArrowDown' : 'ArrowUp'
          }
        })

        return candidates.sort((left, right) => right.distance - left.distance)[0]!
      })
      const primaryModifier = process.platform === 'darwin' ? 'Meta' : 'Control'

      await page.keyboard.press(`${primaryModifier}+${target.key}`)
      await page.waitForFunction(() =>
        Array.from(document.querySelectorAll('[data-agent-console-node]')).some(
          (agent) => agent.getAttribute('data-selection-state') === 'selected'
        )
      )
      const selectedAgent = page.locator('[data-selection-state="selected"]').first()
      const selectedAgentId = await selectedAgent.getAttribute('data-agent-console-node')
      if (!selectedAgentId) throw new Error('Selected Agent id is unavailable.')
      await page.waitForFunction((agentId) => {
        const element = document.querySelector(`[data-agent-console-node="${agentId}"]`)
        const canvas = document.querySelector('.react-flow')
        if (!element || !canvas) return false

        const agentBounds = element.getBoundingClientRect()
        const canvasBounds = canvas.getBoundingClientRect()
        return (
          Math.abs(
            agentBounds.x + agentBounds.width / 2 - (canvasBounds.x + canvasBounds.width / 2)
          ) <= 2 &&
          Math.abs(
            agentBounds.y + agentBounds.height / 2 - (canvasBounds.y + canvasBounds.height / 2)
          ) <= 2
        )
      }, selectedAgentId)
      const centerOffset = await selectedAgent.evaluate((element) => {
        const canvas = document.querySelector('.react-flow')
        if (!canvas) throw new Error('Canvas is unavailable.')

        const agentBounds = element.getBoundingClientRect()
        const canvasBounds = canvas.getBoundingClientRect()
        return {
          x: agentBounds.x + agentBounds.width / 2 - (canvasBounds.x + canvasBounds.width / 2),
          y: agentBounds.y + agentBounds.height / 2 - (canvasBounds.y + canvasBounds.height / 2)
        }
      })

      expect(Math.abs(centerOffset.x)).toBeLessThanOrEqual(2)
      expect(Math.abs(centerOffset.y)).toBeLessThanOrEqual(2)

      await page.waitForFunction(
        (agentId) =>
          document.activeElement?.matches('.xterm-helper-textarea') === true &&
          document.activeElement
            .closest('[data-agent-console-node]')
            ?.getAttribute('data-agent-console-node') === agentId,
        selectedAgentId
      )
      const nextTarget = await agents.evaluateAll((elements, currentAgentId) => {
        const current = elements.find(
          (element) => element.getAttribute('data-agent-console-node') === currentAgentId
        )
        const other = elements.find(
          (element) => element.getAttribute('data-agent-console-node') !== currentAgentId
        )
        if (!current || !other) throw new Error('Agent navigation pair is unavailable.')

        const currentBounds = current.getBoundingClientRect()
        const otherBounds = other.getBoundingClientRect()
        const horizontalDelta =
          otherBounds.x + otherBounds.width / 2 - (currentBounds.x + currentBounds.width / 2)
        const verticalDelta =
          otherBounds.y + otherBounds.height / 2 - (currentBounds.y + currentBounds.height / 2)

        return {
          agentId: other.getAttribute('data-agent-console-node'),
          key:
            Math.abs(horizontalDelta) >= Math.abs(verticalDelta)
              ? horizontalDelta >= 0
                ? 'ArrowRight'
                : 'ArrowLeft'
              : verticalDelta >= 0
                ? 'ArrowDown'
                : 'ArrowUp'
        }
      }, selectedAgentId)
      if (!nextTarget.agentId) throw new Error('Next Agent id is unavailable.')

      await page.keyboard.press(`${primaryModifier}+${nextTarget.key}`)
      await page.waitForFunction(
        (agentId) =>
          document
            .querySelector(`[data-agent-console-node="${agentId}"]`)
            ?.getAttribute('data-selection-state') === 'selected' &&
          document.activeElement?.matches('.xterm-helper-textarea') === true &&
          document.activeElement
            .closest('[data-agent-console-node]')
            ?.getAttribute('data-agent-console-node') === agentId,
        nextTarget.agentId
      )
    },
    electronScenarioTimeoutMs
  )

  it(
    'keeps full-width punctuation at a stable Agent terminal cell width',
    async () => {
      await expectDesktopRuntime(page)
      await page.getByRole('button', { name: '添加项目' }).click()
      await createCodexAgent(page)
      await waitForAgentCount(page, 1)
      await waitForAgentTerminals(page, 1)

      const terminal = page.locator('.agent-terminal-viewport').first()
      await ensureTerminalDomRenderer(terminal)
      const punctuationWidths = await terminal.evaluate((element) => {
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

async function waitForAgentCreationReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="新建 Agent"]')
    return Boolean(button && !button.disabled)
  })
}

async function createCodexAgent(page: Page): Promise<void> {
  await page.getByRole('button', { name: '选择默认 Agent' }).click()
  await page.getByRole('menuitemradio', { name: 'Codex', exact: true }).click()
  await page.getByRole('button', { name: '新建 Agent' }).click()
}

async function waitForAgentTerminals(page: Page, count: number): Promise<void> {
  await page.waitForFunction((expectedCount) => {
    const terminals = Array.from(document.querySelectorAll<HTMLElement>('.agent-terminal-viewport'))
    return (
      terminals.length === expectedCount &&
      terminals.every(
        (terminal) =>
          terminal.querySelector('.xterm-helper-textarea') &&
          terminal.dataset.agentTerminalProcessId &&
          terminal.dataset.agentTerminalSessionId &&
          (terminal.dataset.agentTerminalSourceTheme === 'light' ||
            terminal.dataset.agentTerminalSourceTheme === 'dark')
      )
    )
  }, count)
}

async function waitForTerminalDomText(terminal: Locator, text: string): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    await ensureTerminalDomRenderer(terminal)
    const contents = await terminal
      .locator('.xterm-rows')
      .textContent()
      .catch(() => '')
    if (contents?.includes(text)) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Timed out waiting for Agent terminal output: ${text}`)
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

async function waitForAllAgentsUnselected(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('[data-agent-console-node]')).every(
      (agent) => agent.getAttribute('data-selection-state') === 'unselected'
    )
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
