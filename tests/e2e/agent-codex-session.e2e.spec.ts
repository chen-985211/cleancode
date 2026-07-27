// @vitest-environment node

import type { ElectronApplication, Page } from 'playwright'

import {
  installFakeCodexCli,
  readFakeCodexCliReports,
  type FakeCodexCliFixture,
  type FakeCodexCliReport
} from '../fixtures/contexts/agent/fakeCodexCli'
import {
  closeElectronApp,
  createE2eWorkbench,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  launchApp,
  readOnlyJsonFile,
  teardownE2eScenario,
  type E2eScenarioResources,
  type E2eWorkbench
} from '../support/e2eWorkbench'
import { createE2eTerminalEnvironment, prependE2ePath } from '../support/e2eTerminal'

describe('Codex Agent session e2e', () => {
  let electronApp: ElectronApplication
  let fakeCodex: FakeCodexCliFixture
  let page: Page
  let resources: E2eScenarioResources
  let workbench: E2eWorkbench

  beforeEach(async () => {
    resources = {}
    workbench = await createE2eWorkbench('cleancode-codex-agent-e2e')
    resources.workbench = workbench
    fakeCodex = await installFakeCodexCli(workbench.appStateDirectory)
    electronApp = await launchApp(workbench, {
      environment: createAgentProviderEnvironment(fakeCodex)
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
    'restores a Codex session selected through /resume even when no later turn completes',
    async () => {
      await expectDesktopRuntime(page)
      await configureCodexExecutable(page, fakeCodex.executablePath)
      await page.getByRole('button', { name: '添加项目' }).click()
      await waitForAgentCount(page, 0)
      await expectAgentProviderInstalled(page, 'codex')
      await selectDefaultAgentProvider(page, 'Codex')
      await waitForAgentCount(page, 1)

      const firstLaunch = await waitForCodexLaunch(fakeCodex.reportPath, 1)
      expect(firstLaunch.sessionId).toBe(fakeCodex.sessionId)
      expect(firstLaunch.args).not.toContain('resume')
      expect(await readFakeCodexCliReports(fakeCodex.reportPath)).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'app-server' })])
      )
      if (!firstLaunch.sessionEndHookTrusted) {
        throw new Error(
          `Codex session started without its precisely trusted SessionEnd Hook: ${JSON.stringify(
            await readFakeCodexCliReports(fakeCodex.reportPath)
          )}`
        )
      }

      const codexTerminal = page
        .locator('[data-agent-console-node]')
        .filter({ has: page.getByRole('img', { name: 'Codex' }) })
        .locator('.agent-terminal-viewport')
      await codexTerminal.click()
      await page.keyboard.type('/resume')
      await page.keyboard.press('Enter')
      await waitForCodexResumeSelection(fakeCodex.reportPath, fakeCodex.switchSessionId)
      expect(
        (await readFakeCodexCliReports(fakeCodex.reportPath)).filter(
          (report) => report.kind === 'session-end-hook'
        )
      ).toHaveLength(0)
      await waitForCodexConversationBinding(workbench, fakeCodex.switchSessionId)

      await closeElectronApp(electronApp)
      resources.electronApp = undefined
      resources.page = undefined
      await waitForCodexSessionEnd(fakeCodex.reportPath, fakeCodex.switchSessionId)
      await waitForCodexConversationBinding(workbench, fakeCodex.switchSessionId)
      const shutdownReports = await readFakeCodexCliReports(fakeCodex.reportPath)
      expect(shutdownReports.filter((report) => report.kind === 'session-end-hook')).toEqual([
        expect.objectContaining({ sessionId: fakeCodex.switchSessionId }),
        expect.objectContaining({ sessionId: fakeCodex.sessionId })
      ])
      expect(shutdownReports.some((report) => report.kind === 'hook-error')).toBe(false)
      const firstExit = shutdownReports.find(
        (report) => report.kind === 'exit' && report.sessionId === fakeCodex.switchSessionId
      )
      expect(firstExit?.exitReason).toBe('quit')

      electronApp = await launchApp(workbench, {
        environment: createAgentProviderEnvironment(fakeCodex)
      })
      resources.electronApp = electronApp
      page = await electronApp.firstWindow()
      resources.page = page
      await page.waitForLoadState('domcontentloaded')
      await waitForAgentCount(page, 1)
      await waitForAgentTerminals(page, 1)

      const restoredLaunch = await waitForCodexLaunch(fakeCodex.reportPath, 2)
      expect(restoredLaunch.args).toEqual(
        expect.arrayContaining(['resume', fakeCodex.switchSessionId])
      )
      expect(restoredLaunch.sessionId).toBe(fakeCodex.switchSessionId)
    },
    electronScenarioTimeoutMs
  )
})

function createAgentProviderEnvironment(fakeCodex: FakeCodexCliFixture): NodeJS.ProcessEnv {
  return {
    ...createE2eTerminalEnvironment(),
    CLEANCODE_FAKE_CODEX_REPORT_PATH: fakeCodex.reportPath,
    CLEANCODE_FAKE_CODEX_SESSION_ID: fakeCodex.sessionId,
    CLEANCODE_FAKE_CODEX_SWITCH_SESSION_ID: fakeCodex.switchSessionId,
    CLEANCODE_TEST_DISABLE_AGENT_AUTOSTART: '0',
    PATH: prependE2ePath(fakeCodex.binDirectory)
  }
}

async function configureCodexExecutable(page: Page, executablePath: string): Promise<void> {
  await page.evaluate(async (executable) => {
    const api = window.cleancode
    if (!api) throw new Error('CleanCode desktop API is unavailable.')
    const preferences = await api.getAgentProviderPreferences()
    await api.updateAgentProviderPreferences({
      providerOverrides: {
        ...preferences.providerOverrides,
        codex: {
          argumentsText: '',
          environment: {},
          executable
        }
      }
    })
  }, executablePath)
}

async function waitForAgentCount(page: Page, count: number): Promise<void> {
  await page.waitForFunction(
    (expectedCount) =>
      document.querySelectorAll('[data-agent-console-node]').length === expectedCount,
    count
  )
}

async function waitForAgentTerminals(page: Page, count: number): Promise<void> {
  await page.waitForFunction((expectedCount) => {
    const terminals = document.querySelectorAll('.agent-terminal-viewport')
    return (
      terminals.length === expectedCount &&
      Array.from(terminals).every((terminal) => terminal.querySelector('.xterm-helper-textarea'))
    )
  }, count)
}

async function selectDefaultAgentProvider(page: Page, providerName: string): Promise<void> {
  await page.getByRole('button', { name: '选择默认 Agent' }).click()
  const providerOption = page.getByRole('menuitemradio', { name: providerName, exact: true })

  try {
    await providerOption.waitFor({ state: 'visible', timeout: 5_000 })
  } catch {
    const visibleProviders = await page.getByRole('menuitemradio').allTextContents()
    throw new Error(
      `Provider "${providerName}" did not become selectable. Visible Providers: ${JSON.stringify(visibleProviders)}`
    )
  }

  await providerOption.click({ timeout: 1_000 })
}

async function expectAgentProviderInstalled(page: Page, providerId: string): Promise<void> {
  const availability = await page.evaluate(async (requestedProviderId) => {
    const inspect = window.cleancode?.inspectAgentProvider
    if (!inspect) throw new Error('Agent Provider inspection is unavailable.')
    return inspect({ providerId: requestedProviderId })
  }, providerId)

  expect(availability).toMatchObject({ providerId, status: 'installed' })
}

async function waitForCodexLaunch(
  reportPath: string,
  expectedCount: number
): Promise<FakeCodexCliReport> {
  return waitForCodexReport(
    reportPath,
    (reports) => {
      const launches = reports.filter((report) => report.kind === 'session')
      return launches.length >= expectedCount ? launches[expectedCount - 1] : undefined
    },
    `Codex launch ${expectedCount}`
  )
}

async function waitForCodexResumeSelection(reportPath: string, sessionId: string): Promise<void> {
  await waitForCodexReport(
    reportPath,
    (reports) =>
      reports.find((report) => report.kind === 'resume' && report.sessionId === sessionId),
    `Codex /resume selection ${sessionId}`
  )
}

async function waitForCodexSessionEnd(reportPath: string, sessionId: string): Promise<void> {
  await waitForCodexReport(
    reportPath,
    (reports) =>
      reports.find(
        (report) => report.kind === 'session-end-hook' && report.sessionId === sessionId
      ),
    `Codex SessionEnd Hook ${sessionId}`
  )
}

async function waitForCodexReport(
  reportPath: string,
  select: (reports: readonly FakeCodexCliReport[]) => FakeCodexCliReport | undefined,
  description: string
): Promise<FakeCodexCliReport> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const reports = await readFakeCodexCliReports(reportPath)
    const selected = select(reports)
    if (selected) return selected
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Timed out waiting for ${description}.`)
}

async function readCodexProviderSessionRefs(
  workbench: E2eWorkbench
): Promise<readonly CodexProviderSessionRef[]> {
  const store = JSON.parse(
    await readOnlyJsonFile(workbench.appStateDirectory, 'agent-sessions.json')
  ) as {
    workspaces: Array<{
      agents: Array<{
        providerId: string
        providerSessionRef: CodexProviderSessionRef | null
      }>
    }>
  }

  return store.workspaces.flatMap((workspace) =>
    workspace.agents
      .filter((agent) => agent.providerId === 'codex')
      .flatMap((agent) => (agent.providerSessionRef ? [agent.providerSessionRef] : []))
  )
}

async function waitForCodexConversationBinding(
  workbench: E2eWorkbench,
  sessionId: string
): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const bindings = await readCodexProviderSessionRefs(workbench)
    if (
      bindings.some(
        (sessionRef) => sessionRef.kind === 'codex-thread' && sessionRef.value === sessionId
      )
    ) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('Timed out waiting for a durable Codex conversation binding.')
}

interface CodexProviderSessionRef {
  readonly kind: string
  readonly value: string
}
