// @vitest-environment node

import type { Page } from 'playwright'

import {
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  readOnlyJsonFile,
  teardownE2eScenario,
  type E2eScenarioResources,
  type E2eWorkbench
} from '../support/e2eWorkbench'
import { asE2eTerminalInput, createE2ePrintCommand } from '../support/e2eTerminal'
import {
  agentCliReadyTimeoutMs,
  stopAgentLaunchForShellSetup,
  writeAgentTerminalInput
} from '../support/e2eAgentRuntime'
import {
  createCodexAgent,
  launchWorkspaceAgentsE2e,
  waitForAgentCount,
  waitForAgentTerminals
} from '../support/e2eWorkspaceAgents'
import {
  ensureTerminalDomRenderer,
  readCanvasViewportTransform,
  readXtermSelection,
  selectExactXtermText,
  setCanvasZoomFromDefault,
  waitForTerminalDomText
} from '../support/terminalSelectionE2e'

describe('workspace Agent selection e2e', () => {
  let workbench: E2eWorkbench
  let page: Page
  let resources: E2eScenarioResources

  beforeEach(async () => {
    resources = {}
    const scenario = await launchWorkspaceAgentsE2e(
      resources,
      'cleancode-workspace-agent-selection-e2e'
    )
    workbench = scenario.workbench
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
      // Capture the CLI screen, since shell readiness can precede its first draw.
      await waitForTerminalDomText(terminal, 'CC_E2E_CODEX_READY:', agentCliReadyTimeoutMs)
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
      const navigationModifier = process.platform === 'darwin' ? 'Meta' : 'Alt'

      await page.keyboard.press(`${navigationModifier}+${target.key}`)
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

      await page.keyboard.press(`${navigationModifier}+${nextTarget.key}`)
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
})

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
