// @vitest-environment node

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
import {
  agentLaunchReadyTimeoutMs,
  waitForAgentLaunchReady,
  waitForAgentProviderInstalled,
  waitForAgentTerminalReady
} from '../support/e2eAgentRuntime'
import { selectAgentProviderFromCreateMenu } from '../support/e2eCanvasMenu'
import { pollUntilState } from '../support/e2ePolling'
import { createE2eTerminalEnvironment, prependE2ePath } from '../support/e2eTerminal'

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
    'restores the last Claude session selected through /resume',
    async () => {
      await expectDesktopRuntime(page)
      const firstLaunchReady = waitForAgentLaunchReady(page)
      await page.getByRole('button', { name: '添加项目' }).click()
      await waitForAgentCount(page, 0)
      await waitForAgentProviderInstalled(page, 'claude-code')
      await waitForClaudeInspection(fakeClaude.reportPath)
      await selectAgentProviderFromCreateMenu(page, 'Claude Code')
      await waitForAgentCount(page, 1)
      const claudeIdentity = page.getByRole('img', { name: 'Claude Code' })
      await claudeIdentity.waitFor()
      expect(await claudeIdentity.locator('.agent-console__activity-indicator').count()).toBe(0)
      await waitForAgentTerminals(page, 1)
      const firstLaunchRuntime = await firstLaunchReady

      const firstLaunch = await waitForClaudeLaunch(
        fakeClaude.reportPath,
        1,
        agentLaunchReadyTimeoutMs
      )
      expect(firstLaunch.args).toContain('--session-id')
      expect(firstLaunch.args).not.toContain('--resume')
      expect(
        await page
          .locator('[data-agent-console-node] .agent-terminal-viewport')
          .getAttribute('data-agent-terminal-session-id')
      ).toBe(firstLaunchRuntime.sessionId)
      await waitForClaudeSessionStart(fakeClaude.reportPath, requireSessionId(firstLaunch))
      expect(await readClaudeProviderSessionRefs(workbench)).toEqual([])

      const claudeTerminal = page
        .locator('[data-agent-console-node]')
        .filter({ has: page.getByRole('img', { name: 'Claude Code' }) })
        .locator('.agent-terminal-viewport')
      await claudeTerminal.click()
      await page.keyboard.type('/resume')
      await page.keyboard.press('Enter')
      await waitForClaudeSessionStart(fakeClaude.reportPath, fakeClaude.switchSessionId)
      await waitForClaudeConversationBinding(workbench, fakeClaude.switchSessionId)

      const restoredLaunchRuntime = await restartElectronApp()
      const restoredLaunch = await waitForClaudeLaunch(
        fakeClaude.reportPath,
        2,
        agentLaunchReadyTimeoutMs
      )
      expect(restoredLaunch.args).toEqual(
        expect.arrayContaining(['--resume', fakeClaude.switchSessionId])
      )
      expect(
        await page
          .locator('[data-agent-console-node] .agent-terminal-viewport')
          .getAttribute('data-agent-terminal-session-id')
      ).toBe(restoredLaunchRuntime.sessionId)
    },
    electronScenarioTimeoutMs
  )

  it(
    'persists a fresh Claude session only after the first user prompt',
    async () => {
      await expectDesktopRuntime(page)
      const firstLaunchReady = waitForAgentLaunchReady(page)
      await page.getByRole('button', { name: '添加项目' }).click()
      await waitForAgentCount(page, 0)
      await waitForAgentProviderInstalled(page, 'claude-code')
      await waitForClaudeInspection(fakeClaude.reportPath)
      await selectAgentProviderFromCreateMenu(page, 'Claude Code')
      await waitForAgentCount(page, 1)
      await waitForAgentTerminals(page, 1)
      await firstLaunchReady

      const firstLaunch = await waitForClaudeLaunch(
        fakeClaude.reportPath,
        1,
        agentLaunchReadyTimeoutMs
      )
      const firstSessionId = requireSessionId(firstLaunch)
      await waitForClaudeSessionStart(fakeClaude.reportPath, firstSessionId)
      expect(await readClaudeProviderSessionRefs(workbench)).toEqual([])

      await restartElectronApp()
      const secondLaunch = await waitForClaudeLaunch(
        fakeClaude.reportPath,
        2,
        agentLaunchReadyTimeoutMs
      )
      const secondSessionId = requireSessionId(secondLaunch)
      expect(secondLaunch.args).toContain('--session-id')
      expect(secondLaunch.args).not.toContain('--resume')
      expect(secondSessionId).not.toBe(firstSessionId)
      await waitForClaudeSessionStart(fakeClaude.reportPath, secondSessionId)
      expect(await readClaudeProviderSessionRefs(workbench)).toEqual([])

      const claudeTerminal = page.locator('[data-agent-console-node] .agent-terminal-viewport')
      await claudeTerminal.click()
      await page.keyboard.type('create a durable conversation')
      await page.keyboard.press('Enter')
      await waitForClaudeUserPrompt(fakeClaude.reportPath, secondSessionId)
      await waitForClaudeConversationBinding(workbench, secondSessionId)

      await restartElectronApp()
      const restoredLaunch = await waitForClaudeLaunch(
        fakeClaude.reportPath,
        3,
        agentLaunchReadyTimeoutMs
      )
      expect(restoredLaunch.args).toEqual(expect.arrayContaining(['--resume', secondSessionId]))
    },
    electronScenarioTimeoutMs
  )

  async function restartElectronApp() {
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
    await waitForAgentCount(page, 1)
    return waitForAgentTerminalReady(page)
  }
})

function createAgentProviderEnvironment(
  fakeCodex: FakeCodexCliFixture,
  fakeClaude: FakeClaudeCliFixture
): NodeJS.ProcessEnv {
  const terminalEnvironment = createE2eTerminalEnvironment()

  return {
    ...terminalEnvironment,
    CLEANCODE_FAKE_CLAUDE_REPORT_PATH: fakeClaude.reportPath,
    CLEANCODE_FAKE_CLAUDE_SWITCH_SESSION_ID: fakeClaude.switchSessionId,
    CLEANCODE_FAKE_CODEX_REPORT_PATH: fakeCodex.reportPath,
    CLEANCODE_TEST_DISABLE_AGENT_AUTOSTART: '0',
    PATH: prependE2ePath(fakeCodex.binDirectory, fakeClaude.binDirectory),
    SHELL: process.platform === 'win32' ? terminalEnvironment.SHELL : fakeClaude.shellPath
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

async function waitForClaudeInspection(reportPath: string): Promise<void> {
  await pollUntilState({
    description: 'Claude Code fake CLI inspection',
    observe: () => readFakeClaudeCliReports(reportPath),
    accept: (reports) => reports.some((report) => report.kind === 'inspection'),
    timeoutMs: 5_000
  })
}

async function waitForClaudeLaunch(
  reportPath: string,
  expectedCount: number,
  timeoutMs = agentLaunchReadyTimeoutMs
): Promise<FakeClaudeCliReport> {
  const launch = await pollUntilState({
    description: `Claude launch ${expectedCount}`,
    observe: async () =>
      (await readFakeClaudeCliReports(reportPath)).filter((report) => report.kind === 'session')[
        expectedCount - 1
      ],
    accept: (observation) => observation !== undefined,
    timeoutMs
  })

  if (!launch) throw new Error(`The completed Claude launch ${expectedCount} was unavailable.`)
  return launch
}

async function waitForClaudeSessionStart(
  reportPath: string,
  sessionId: string,
  timeoutMs = agentLaunchReadyTimeoutMs
): Promise<void> {
  await pollUntilState({
    description: `Claude SessionStart Hook ${sessionId}`,
    observe: () => readFakeClaudeCliReports(reportPath),
    accept: (reports) =>
      reports.some(
        (report) => report.kind === 'session-start-hook' && report.sessionId === sessionId
      ),
    timeoutMs
  })
}

async function waitForClaudeUserPrompt(
  reportPath: string,
  sessionId: string,
  timeoutMs = agentLaunchReadyTimeoutMs
): Promise<void> {
  await pollUntilState({
    description: `Claude UserPromptSubmit Hook ${sessionId}`,
    observe: () => readFakeClaudeCliReports(reportPath),
    accept: (reports) =>
      reports.some(
        (report) => report.kind === 'user-prompt-hook' && report.sessionId === sessionId
      ),
    timeoutMs
  })
}

async function readClaudeProviderSessionRefs(
  workbench: E2eWorkbench
): Promise<readonly ClaudeProviderSessionRef[]> {
  const store = JSON.parse(
    await readOnlyJsonFile(workbench.appStateDirectory, 'agent-sessions.json')
  ) as {
    workspaces: Array<{
      agents: Array<{
        providerId: string
        providerSessionRef: ClaudeProviderSessionRef | null
      }>
    }>
  }

  return store.workspaces.flatMap((workspace) =>
    workspace.agents
      .filter((agent) => agent.providerId === 'claude-code')
      .flatMap((agent) => (agent.providerSessionRef ? [agent.providerSessionRef] : []))
  )
}

async function waitForClaudeConversationBinding(
  workbench: E2eWorkbench,
  sessionId: string,
  timeoutMs = agentLaunchReadyTimeoutMs
): Promise<void> {
  await pollUntilState({
    description: `durable Claude conversation binding ${sessionId}`,
    observe: () => readClaudeProviderSessionRefs(workbench),
    accept: (bindings) =>
      bindings.some(
        (sessionRef) =>
          sessionRef.value === sessionId && sessionRef.metadata?.confirmedBy === 'session-hook'
      ),
    timeoutMs
  })
}

function requireSessionId(report: FakeClaudeCliReport): string {
  if (!report.sessionId) throw new Error('Claude launch did not include a session id.')
  return report.sessionId
}

interface ClaudeProviderSessionRef {
  readonly metadata?: { readonly confirmedBy?: unknown }
  readonly value: string
}
