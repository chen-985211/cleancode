import type { Page } from 'playwright'

import {
  installFakeCodexCli,
  type FakeCodexCliFixture
} from '../fixtures/contexts/agent/fakeCodexCli'
import { selectAgentProviderFromCreateMenu } from './e2eCanvasMenu'
import { createE2eTerminalEnvironment, prependE2ePath } from './e2eTerminal'
import {
  createE2eWorkbench,
  launchApp,
  type E2eScenarioResources,
  type E2eWorkbench
} from './e2eWorkbench'

export async function launchWorkspaceAgentsE2e(
  resources: E2eScenarioResources,
  prefix: string
): Promise<{ workbench: E2eWorkbench; fakeCodex: FakeCodexCliFixture; page: Page }> {
  const workbench = await createE2eWorkbench(prefix)
  resources.workbench = workbench
  const fakeCodex = await installFakeCodexCli(workbench.appStateDirectory)
  const electronApp = await launchApp(workbench, {
    environment: {
      ...createE2eTerminalEnvironment(),
      CLEANCODE_FAKE_CODEX_REPORT_PATH: fakeCodex.reportPath,
      CLEANCODE_TEST_DISABLE_AGENT_AUTOSTART: '0',
      PATH: prependE2ePath(fakeCodex.binDirectory)
    }
  })
  resources.electronApp = electronApp
  const page = await electronApp.firstWindow()
  resources.page = page
  await page.waitForLoadState('domcontentloaded')
  return { workbench, fakeCodex, page }
}

export async function waitForAgentCount(page: Page, count: number): Promise<void> {
  await page.waitForFunction(
    (expectedCount) =>
      document.querySelectorAll('[data-agent-console-node]').length === expectedCount,
    count
  )
}

export async function waitForAgentCreationReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="新建 Agent"]')
    return Boolean(button && !button.disabled)
  })
}

export async function createCodexAgent(page: Page): Promise<void> {
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

export async function waitForAgentTerminals(page: Page, count: number): Promise<void> {
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
