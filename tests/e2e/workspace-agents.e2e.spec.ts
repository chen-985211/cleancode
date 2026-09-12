// @vitest-environment node

import type { Page } from 'playwright'

import {
  readFakeCodexCliReports,
  type FakeCodexCliFixture
} from '../fixtures/contexts/agent/fakeCodexCli'
import {
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  selectBlankCanvasAction,
  teardownE2eScenario,
  waitForJsonFile,
  type E2eScenarioResources,
  type E2eWorkbench
} from '../support/e2eWorkbench'
import { writeAgentTerminalInput } from '../support/e2eAgentRuntime'
import { panCanvasLeft } from '../support/e2eCanvasActions'
import { pollUntilState } from '../support/e2ePolling'
import {
  createCodexAgent,
  launchWorkspaceAgentsE2e,
  waitForAgentCount,
  waitForAgentCreationReady,
  waitForAgentTerminals
} from '../support/e2eWorkspaceAgents'
import { ensureTerminalDomRenderer, waitForTerminalDomText } from '../support/terminalSelectionE2e'
import {
  createdWorkbenchNodeZoomUpperBound,
  readCanvasNodeGap,
  setCanvasZoomToMaximum,
  waitForCreatedWorkbenchNodeResult
} from '../support/workbenchNodeCreationE2e'

describe('workspace Agents e2e', () => {
  let workbench: E2eWorkbench
  let fakeCodex: FakeCodexCliFixture
  let page: Page
  let resources: E2eScenarioResources

  beforeEach(async () => {
    resources = {}
    const scenario = await launchWorkspaceAgentsE2e(resources, 'cleancode-workspace-agents-e2e')
    workbench = scenario.workbench
    fakeCodex = scenario.fakeCodex
    page = scenario.page
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
      await waitForAgentTerminalSurfaces(page, 1)

      await page.getByRole('button', { name: '新建 Agent' }).click()
      await waitForAgentCount(page, 2)

      await page.getByRole('button', { name: 'Agent 2 更多操作' }).click()
      await page.getByRole('menuitem', { name: '移除' }).click()
      await waitForAgentCount(page, 1)

      const store = JSON.parse(
        await waitForJsonFile(workbench.appStateDirectory, 'agent-sessions.json')
      ) as { version: number; workspaces: Array<{ agents: unknown[] }> }
      expect(store.version).toBe(6)
      expect(store.workspaces[0]?.agents).toHaveLength(1)
    }
  )

  it(
    'normalizes terminal and Agent creation into the same safe result from maximum zoom',
    async () => {
      await expectDesktopRuntime(page)
      await page.getByRole('button', { name: '添加项目' }).click()
      await waitForAgentCreationReady(page)
      await waitForAgentCount(page, 0)

      expect(await setCanvasZoomToMaximum(page, workbench.projectDirectory)).toBeCloseTo(1.6, 2)
      await selectBlankCanvasAction(page, '新建终端积木')
      const terminalSelector = '[data-terminal-block-id]'
      await page.locator(terminalSelector).first().waitFor()
      const terminalResult = await waitForCreatedWorkbenchNodeResult(page, terminalSelector)

      expect(terminalResult.zoom).toBeLessThanOrEqual(createdWorkbenchNodeZoomUpperBound)
      expect(Object.values(terminalResult.insets).every((inset) => inset >= -1)).toBe(true)
      await waitForCreatedNodeActivation(page, terminalSelector, 'terminal')

      expect(await setCanvasZoomToMaximum(page, workbench.projectDirectory)).toBeCloseTo(1.6, 2)
      await createCodexAgent(page)
      await waitForAgentCount(page, 1)
      const agentSelector = '[data-agent-console-node]'
      const agentResult = await waitForCreatedWorkbenchNodeResult(page, agentSelector)

      expect(agentResult.zoom).toBeLessThanOrEqual(createdWorkbenchNodeZoomUpperBound)
      expect(Object.values(agentResult.insets).every((inset) => inset >= -1)).toBe(true)
      expect(await readCanvasNodeGap(page, terminalSelector, agentSelector)).toBeGreaterThanOrEqual(
        63
      )
      await waitForCreatedNodeActivation(page, agentSelector, 'agent')
    },
    electronScenarioTimeoutMs
  )

  it(
    'keeps the Agent terminal grid and scrollbar aligned with its content frame',
    async () => {
      await expectDesktopRuntime(page)
      await page.getByRole('button', { name: '添加项目' }).click()
      await createCodexAgent(page)
      await waitForAgentCount(page, 1)
      await waitForAgentTerminals(page, 1)
      const terminal = page.locator('.agent-terminal-viewport').first()
      await page.waitForFunction(() => {
        const viewport = document.querySelector<HTMLElement>('.agent-terminal-viewport')
        const cellWidth = viewport
          ?.querySelector('.xterm-helper-textarea')
          ?.getBoundingClientRect().width
        // Renderer activation can finish before xterm paints its first cell geometry.
        return viewport?.dataset.terminalRendererReady === 'true' && (cellWidth ?? 0) > 0
      })

      const rightInsets = await terminal.evaluate((element) => {
        const terminalElement = element as HTMLElement
        const terminalShell = terminalElement.closest('.agent-console__terminal-shell')
        const scrollbarViewport = terminalElement.querySelector('.xterm-viewport')
        const terminalScreen = terminalElement.querySelector('.xterm-screen')
        const helperTextarea = terminalElement.querySelector('.xterm-helper-textarea')

        if (!terminalShell || !scrollbarViewport || !terminalScreen || !helperTextarea) {
          throw new Error('Agent terminal layout is incomplete.')
        }

        const shellRight = terminalShell.getBoundingClientRect().right
        const terminalBounds = terminalElement.getBoundingClientRect()
        const presentationScale = terminalBounds.width / terminalElement.offsetWidth
        const cellWidth = helperTextarea.getBoundingClientRect().width
        const xtermDefaultScrollbarWidth = 15
        const fitScrollbarReservation = xtermDefaultScrollbarWidth * presentationScale

        if (!Number.isFinite(cellWidth) || cellWidth <= 0) {
          throw new Error('Agent terminal cell geometry is invalid.')
        }

        return {
          maximumScreen: cellWidth + fitScrollbarReservation + 1,
          screen: shellRight - terminalScreen.getBoundingClientRect().right,
          scrollbar: shellRight - scrollbarViewport.getBoundingClientRect().right,
          terminal: shellRight - terminalBounds.right,
          thumbBorder: Number.parseFloat(
            getComputedStyle(scrollbarViewport, '::-webkit-scrollbar-thumb').borderRightWidth
          )
        }
      })

      expect(rightInsets.terminal).toBeLessThanOrEqual(1)
      expect(rightInsets.scrollbar).toBeLessThanOrEqual(1)
      expect(rightInsets.screen).toBeLessThanOrEqual(rightInsets.maximumScreen)
      expect(rightInsets.thumbBorder).toBe(0)
    },
    electronScenarioTimeoutMs
  )

  it(
    'keeps terminal color-query responses out of Codex input while its view is offscreen',
    async () => {
      await expectDesktopRuntime(page)
      await page.getByRole('button', { name: '添加项目' }).click()
      await createCodexAgent(page)
      await waitForAgentCount(page, 1)
      await waitForAgentTerminals(page, 1)
      const terminal = page.locator('.agent-terminal-viewport').first()
      await waitForTerminalDomText(terminal, 'CC_E2E_CODEX_READY')

      // Keep the view hidden for the whole query instead of racing a short animation.
      await panCanvasLeft(page)
      await page.waitForFunction(
        () =>
          document.querySelector<HTMLElement>('[data-agent-console-node]')?.dataset
            .terminalSurfacePriority === 'hidden'
      )
      await writeAgentTerminalInput(page, terminal, '/color-query\r')

      const reports = await pollUntilState({
        description: 'fake Codex color query to reach a terminal response state',
        observe: () => readFakeCodexCliReports(fakeCodex.reportPath),
        accept: (currentReports) =>
          currentReports.some(
            (report) =>
              report.kind === 'color-query-response' || report.kind === 'color-query-timeout'
          ),
        timeoutMs: 10_000
      })

      expect(reports.some((report) => report.kind === 'color-query-response')).toBe(true)
      expect(reports.some((report) => report.kind === 'color-query-timeout')).toBe(false)
      expect(reports.some((report) => report.kind === 'unexpected-color-response-input')).toBe(
        false
      )
      expect(
        await page
          .locator('[data-agent-console-node]')
          .getAttribute('data-terminal-surface-priority')
      ).toBe('hidden')
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
          const width = sample.getBoundingClientRect().width
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

async function waitForCreatedNodeActivation(
  page: Page,
  selector: string,
  kind: 'agent' | 'terminal'
): Promise<void> {
  await page.waitForFunction(
    ({ kind, selector }) => {
      const node = document.querySelector(selector)

      return kind === 'terminal'
        ? node?.classList.contains('terminal-node--selected') === true
        : node?.getAttribute('data-selection-state') === 'selected'
    },
    { kind, selector }
  )

  await page.waitForFunction(
    ({ kind, selector }) => {
      const node = document.querySelector(selector)
      const viewport = node?.querySelector<HTMLElement>(
        kind === 'terminal' ? '.terminal-viewport' : '.agent-terminal-viewport'
      )
      const sessionId =
        kind === 'terminal'
          ? node
              ?.querySelector<HTMLElement>('[data-terminal-output-tail="true"]')
              ?.getAttribute('data-terminal-session-id')
          : viewport?.getAttribute('data-agent-terminal-view-session-id')

      const input = viewport?.querySelector('.xterm-helper-textarea')

      return (
        Boolean(sessionId) &&
        viewport?.getAttribute('data-terminal-attached-session-id') === sessionId &&
        document.activeElement === input
      )
    },
    { kind, selector }
  )
}

async function waitForAgentTerminalSurfaces(page: Page, count: number): Promise<void> {
  await page.waitForFunction((expectedCount) => {
    const terminals = Array.from(document.querySelectorAll<HTMLElement>('.agent-terminal-viewport'))
    return (
      terminals.length === expectedCount &&
      terminals.every(
        (terminal) =>
          terminal.querySelector('.xterm-helper-textarea') &&
          terminal.dataset.agentTerminalSessionId &&
          (terminal.dataset.agentTerminalSourceTheme === 'light' ||
            terminal.dataset.agentTerminalSourceTheme === 'dark')
      )
    )
  }, count)
}
