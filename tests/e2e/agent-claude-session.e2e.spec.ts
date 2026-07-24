// @vitest-environment node

import { delimiter } from 'node:path'

import type { ElectronApplication, Page } from 'playwright'

import {
  installFakeClaudeCli,
  readFakeClaudeCliReports,
  type FakeClaudeCliFixture,
  type FakeClaudeCliReport
} from '../fixtures/contexts/agent/fakeClaudeCli'
import {
  installFakeCodexCli,
  type FakeCodexCliFixture
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

describe('Claude Code Agent session e2e', () => {
  let electronApp: ElectronApplication
  let fakeClaude: FakeClaudeCliFixture
  let fakeCodex: FakeCodexCliFixture
  let page: Page
  let resources: E2eScenarioResources
  let workbench: E2eWorkbench

  beforeEach(async () => {
    resources = {}
    workbench = await createE2eWorkbench('cleancode-claude-agent-e2e')
    resources.workbench = workbench
    fakeCodex = await installFakeCodexCli(workbench.appStateDirectory)
    fakeClaude = await installFakeClaudeCli(workbench.appStateDirectory)
    electronApp = await launchApp(workbench, {
      environment: createAgentProviderEnvironment(fakeCodex, fakeClaude)
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
    'resumes only after the first user prompt confirms a durable conversation',
    async () => {
      await expectDesktopRuntime(page)
      await page.getByRole('button', { name: '添加项目' }).click()
      await waitForAgentCount(page, 1)
      await expectAgentProviderInstalled(page, 'claude-code')
      await waitForClaudeInspection(fakeClaude.reportPath)
      await selectDefaultAgentProvider(page, 'Claude Code')
      await page.getByRole('button', { name: '新建 Agent' }).click()
      await waitForAgentCount(page, 2)
      const claudeIdentity = page.getByRole('img', { name: 'Claude Code' })
      await claudeIdentity.waitFor()
      expect(await claudeIdentity.locator('.agent-console__activity-indicator').count()).toBe(0)

      const firstLaunch = await waitForClaudeLaunch(fakeClaude.reportPath, 1)
      expect(firstLaunch.args).toContain('--session-id')
      expect(firstLaunch.args).not.toContain('--resume')
      expect(await readClaudeConversationBindings(workbench)).toEqual([])

      await restartElectronApp()
      const secondLaunch = await waitForClaudeLaunch(fakeClaude.reportPath, 2)
      expect(secondLaunch.args).toContain('--session-id')
      expect(secondLaunch.args).not.toContain('--resume')
      expect(secondLaunch.sessionId).not.toBe(firstLaunch.sessionId)
      expect(await readClaudeConversationBindings(workbench)).toEqual([])

      const claudeTerminal = page
        .locator('[data-agent-console-node]')
        .filter({ has: page.getByRole('img', { name: 'Claude Code' }) })
        .locator('.agent-terminal-viewport')
      await claudeTerminal.click()
      await page.keyboard.type('confirm durable Claude conversation')
      await page.keyboard.press('Enter')
      await waitForClaudeHook(fakeClaude.reportPath)
      await waitForClaudeConversationBinding(workbench, requireSessionId(secondLaunch))

      await restartElectronApp()
      const restoredLaunch = await waitForClaudeLaunch(fakeClaude.reportPath, 3)
      expect(restoredLaunch.args).toEqual(
        expect.arrayContaining(['--resume', secondLaunch.sessionId])
      )

      async function restartElectronApp(): Promise<void> {
        await closeElectronApp(electronApp)
        resources.electronApp = undefined
        resources.page = undefined
        electronApp = await launchApp(workbench, {
          environment: createAgentProviderEnvironment(fakeCodex, fakeClaude)
        })
        resources.electronApp = electronApp
        page = await electronApp.firstWindow()
        resources.page = page
        await page.waitForLoadState('domcontentloaded')
        await waitForAgentCount(page, 2)
        await waitForAgentTerminals(page, 2)
      }
    },
    electronScenarioTimeoutMs
  )
})

function createAgentProviderEnvironment(
  fakeCodex: FakeCodexCliFixture,
  fakeClaude: FakeClaudeCliFixture
): NodeJS.ProcessEnv {
  return {
    CLEANCODE_FAKE_CLAUDE_REPORT_PATH: fakeClaude.reportPath,
    CLEANCODE_FAKE_CODEX_REPORT_PATH: fakeCodex.reportPath,
    CLEANCODE_TEST_DISABLE_AGENT_AUTOSTART: '0',
    PATH: [
      fakeCodex.binDirectory,
      fakeClaude.binDirectory,
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin'
    ].join(delimiter),
    SHELL: fakeClaude.shellPath
  }
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

async function waitForClaudeInspection(reportPath: string): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const reports = await readFakeClaudeCliReports(reportPath)
    if (reports.some((report) => report.kind === 'inspection')) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('Claude Code was reported installed without inspecting the fake CLI.')
}

async function waitForClaudeLaunch(
  reportPath: string,
  expectedCount: number
): Promise<FakeClaudeCliReport> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const launches = (await readFakeClaudeCliReports(reportPath)).filter(
      (report) => report.kind === 'session'
    )
    if (launches.length >= expectedCount) return launches[expectedCount - 1]!
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Timed out waiting for Claude launch ${expectedCount}.`)
}

async function waitForClaudeHook(reportPath: string): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const reports = await readFakeClaudeCliReports(reportPath)
    if (reports.some((report) => report.kind === 'user-prompt-hook')) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('Timed out waiting for the Claude user-prompt Hook.')
}

async function readClaudeConversationBindings(
  workbench: E2eWorkbench
): Promise<readonly ClaudeConversationBinding[]> {
  const store = JSON.parse(
    await readOnlyJsonFile(workbench.appStateDirectory, 'agent-sessions.json')
  ) as {
    workspaces: Array<{
      agents: Array<{ conversations: ClaudeConversationBinding[]; providerId: string }>
    }>
  }

  return store.workspaces.flatMap((workspace) =>
    workspace.agents
      .filter((agent) => agent.providerId === 'claude-code')
      .flatMap((agent) => agent.conversations)
  )
}

async function waitForClaudeConversationBinding(
  workbench: E2eWorkbench,
  sessionId: string
): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const bindings = await readClaudeConversationBindings(workbench)
    if (
      bindings.some(
        ({ sessionRef }) =>
          sessionRef.value === sessionId && sessionRef.metadata?.confirmedBy === 'user-prompt-hook'
      )
    ) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('Timed out waiting for a durable Claude conversation binding.')
}

function requireSessionId(report: FakeClaudeCliReport): string {
  if (!report.sessionId) throw new Error('Claude launch did not include a session id.')
  return report.sessionId
}

interface ClaudeConversationBinding {
  readonly sessionRef: {
    readonly metadata?: { readonly confirmedBy?: unknown }
    readonly value: string
  }
}
