// @vitest-environment node

import type { ElectronApplication, Page } from 'playwright'

import {
  installFakeCodexCli,
  readFakeCodexCliReports,
  type FakeCodexCliFixture
} from '../fixtures/contexts/agent/fakeCodexCli'

import {
  createE2eWorkbench,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  launchApp,
  readOnlyJsonFile,
  selectBlankCanvasAction,
  teardownE2eScenario,
  waitForJsonFile,
  type E2eScenarioResources,
  type E2eWorkbench
} from '../support/e2eWorkbench'
import {
  asE2eTerminalInput,
  createE2ePrintCommand,
  createE2eTerminalEnvironment,
  prependE2ePath
} from '../support/e2eTerminal'
import { stopAgentLaunchForShellSetup, writeAgentTerminalInput } from '../support/e2eAgentRuntime'
import { selectAgentProviderFromCreateMenu } from '../support/e2eCanvasMenu'
import { pollUntilState } from '../support/e2ePolling'
import {
  ensureTerminalDomRenderer,
  readCanvasViewportTransform,
  readXtermSelection,
  selectExactXtermText,
  setCanvasZoomFromDefault,
  waitForTerminalDomText
} from '../support/terminalSelectionE2e'
import {
  createdWorkbenchNodeZoomUpperBound,
  readCanvasNodeGap,
  setCanvasZoomToMaximum,
  waitForCreatedWorkbenchNodeResult
} from '../support/workbenchNodeCreationE2e'

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
        ...createE2eTerminalEnvironment(),
        CLEANCODE_FAKE_CODEX_REPORT_PATH: fakeCodex.reportPath,
        CLEANCODE_TEST_DISABLE_AGENT_AUTOSTART: '0',
        PATH: prependE2ePath(fakeCodex.binDirectory)
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
      await waitForAgentTerminalSurfaces(page, 1)

      await page.getByRole('button', { name: '新建 Agent' }).click()
      await waitForAgentCount(page, 2)

      await page.getByRole('button', { name: 'Agent 2 更多操作' }).click()
      await page.getByRole('menuitem', { name: '移除' }).click()
      await waitForAgentCount(page, 1)

      const store = JSON.parse(
        await waitForJsonFile(workbench.appStateDirectory, 'agent-sessions.json')
      ) as { version: number; workspaces: Array<{ agents: unknown[] }> }
      expect(store.version).toBe(5)
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
      await page.waitForFunction(
        () =>
          document.querySelector<HTMLElement>('.agent-terminal-viewport')?.dataset
            .terminalRendererReady === 'true'
      )

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
    'keeps terminal color-query responses out of Codex input while visual output is deferred',
    async () => {
      await expectDesktopRuntime(page)
      await page.getByRole('button', { name: '添加项目' }).click()
      await createCodexAgent(page)
      await waitForAgentCount(page, 1)
      await waitForAgentTerminals(page, 1)
      const terminal = page.locator('.agent-terminal-viewport').first()
      await waitForTerminalDomText(terminal, 'CC_E2E_CODEX_READY')

      await page.getByRole('button', { name: '收起侧边栏' }).click()
      await page
        .locator('.project-sidebar__motion-surface[data-project-sidebar-motion-state="closing"]')
        .waitFor()
      await page.waitForFunction(
        () =>
          document.querySelector<HTMLElement>('[data-agent-console-node]')?.dataset
            .terminalSurfacePriority === 'visible'
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
      await stopAgentLaunchForShellSetup(page, terminal)
      await writeAgentTerminalInput(
        page,
        terminal,
        asE2eTerminalInput(createE2ePrintCommand(`\n\n\n${outputLine}`))
      )
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
          borderColor: getComputedStyle(veil).borderColor,
          borderStyle: getComputedStyle(veil).borderStyle,
          borderWidth: getComputedStyle(veil).borderWidth,
          boxShadow: getComputedStyle(veil).boxShadow,
          terminalText: element.querySelector('.xterm-rows')?.textContent ?? ''
        }
      })

      expect(selectedPresentation.backgroundColor).toBe('rgba(0, 0, 0, 0)')
      expect(selectedPresentation.borderStyle).toBe('solid')
      expect(selectedPresentation.borderWidth).toBe('2px')
      await page.locator('.react-flow__pane').click({ force: true, position: { x: 8, y: 8 } })
      await waitForAgentSelectionState(page, 'unselected')

      await agent.locator('.agent-console__header').click({ button: 'right' })
      await page.getByRole('menu').waitFor()
      expect(await agent.getAttribute('data-selection-state')).toBe('unselected')
      const contextPresentation = await agent.evaluate((element) => {
        const veil = element.querySelector<HTMLElement>('[data-workbench-node-selection]')
        if (!veil) throw new Error('Agent context-selection feedback is unavailable.')
        const style = getComputedStyle(veil)
        return {
          backgroundColor: style.backgroundColor,
          borderColor: style.borderColor,
          borderStyle: style.borderStyle,
          borderWidth: style.borderWidth,
          boxShadow: style.boxShadow
        }
      })
      expect(contextPresentation).toEqual({
        backgroundColor: selectedPresentation.backgroundColor,
        borderColor: selectedPresentation.borderColor,
        borderStyle: selectedPresentation.borderStyle,
        borderWidth: selectedPresentation.borderWidth,
        boxShadow: selectedPresentation.boxShadow
      })
      await page.keyboard.press('Escape')

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

async function waitForAgentCount(page: Page, count: number): Promise<void> {
  await page.waitForFunction(
    (expectedCount) =>
      document.querySelectorAll('[data-agent-console-node]').length === expectedCount,
    count
  )
}

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

async function waitForAgentCreationReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="新建 Agent"]')
    return Boolean(button && !button.disabled)
  })
}

async function createCodexAgent(page: Page): Promise<void> {
  const refreshed = await ensureCodexProviderInstalled(page)
  if (refreshed) {
    await page.reload({ waitUntil: 'domcontentloaded' })
  }
  await waitForAgentCreationReady(page)
  await selectAgentProviderFromCreateMenu(page, 'Codex')
}

async function ensureCodexProviderInstalled(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const api = window.cleancode
    if (!api) throw new Error('CleanCode desktop API is unavailable.')

    const discovered = await api.discoverCreatableAgentProviders()
    if (discovered.some((provider) => provider.descriptor.id === 'codex')) return false

    const availability = await api.inspectAgentProvider({ providerId: 'codex' })
    if (availability.status !== 'installed') {
      throw new Error(
        `The fake Codex Provider did not become installed: ${JSON.stringify(availability)}`
      )
    }
    return true
  })
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
