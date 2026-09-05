// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { installFakeClaudeCli } from '../fixtures/contexts/agent/fakeClaudeCli'
import { installFakeCodexCli } from '../fixtures/contexts/agent/fakeCodexCli'
import {
  createE2eWorkbench,
  launchApp,
  teardownE2eScenario,
  electronScenarioTimeoutMs,
  type E2eScenarioResources
} from '../support/e2eWorkbench'
import { createE2eTerminalEnvironment, prependE2ePath } from '../support/e2eTerminal'
import { waitForAgentProviderInstalled } from '../support/e2eAgentRuntime'
import { selectAgentProviderFromCreateMenu } from '../support/e2eCanvasMenu'
import { pollUntilState } from '../support/e2ePolling'

// The fixture CLI requests a peer through real MCP. UI node identity and a correlated
// response prove renderer placement, persisted creation, native launch, and messaging agree.
// Each case owns its Electron profile, workspace, CLI processes, and report; teardown is unconditional.
describe('Native Agent collaboration on the canvas', () => {
  let resources: E2eScenarioResources = {}
  afterEach(async ({ task }) => {
    await teardownE2eScenario({
      resources,
      taskFailed: task.result?.state === 'fail',
      taskName: task.name
    })
  })

  it.each(['claude-code', 'codex'] as const)(
    'creates a peer from %s, receives its result, and shows both native consoles',
    async (source) => {
      resources = {}
      const workbench = await createE2eWorkbench('cleancode-peer-agents')
      resources.workbench = workbench
      const codex = await installFakeCodexCli(workbench.appStateDirectory)
      const claude = await installFakeClaudeCli(workbench.appStateDirectory)
      const report = join(workbench.appStateDirectory, 'peer-result.json')
      const environment = createE2eTerminalEnvironment()
      const app = await launchApp(workbench, {
        environment: {
          ...environment,
          PATH: prependE2ePath(codex.binDirectory, claude.binDirectory),
          SHELL: process.platform === 'win32' ? environment.SHELL : claude.shellPath,
          CLEANCODE_TEST_DISABLE_AGENT_AUTOSTART: '0',
          CLEANCODE_FAKE_CODEX_REPORT_PATH: codex.reportPath,
          CLEANCODE_FAKE_CODEX_SESSION_ID: codex.sessionId,
          CLEANCODE_FAKE_CODEX_SWITCH_SESSION_ID: codex.switchSessionId,
          CLEANCODE_FAKE_CLAUDE_REPORT_PATH: claude.reportPath,
          CLEANCODE_FAKE_CLAUDE_SWITCH_SESSION_ID: claude.switchSessionId,
          CLEANCODE_FAKE_PEER_MODULE: new URL(
            '../fixtures/contexts/agent/peerCliScenario.mjs',
            import.meta.url
          ).href,
          CLEANCODE_FAKE_PEER_SOURCE: source,
          CLEANCODE_FAKE_PEER_REPORT: report
        }
      })
      resources.electronApp = app
      const page = await app.firstWindow()
      resources.page = page
      await page.getByRole('button', { name: '添加项目' }).click()
      await waitForAgentProviderInstalled(page, source)
      await selectAgentProviderFromCreateMenu(page, source === 'codex' ? 'Codex' : 'Claude Code')
      const result = await pollUntilState({
        description: 'peer reply returned to the originating native CLI',
        observe: async () => {
          try {
            return JSON.parse(await readFile(report, 'utf8'))
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
            throw error
          }
        },
        accept: (value) => value !== null,
        timeoutMs: 30_000
      })
      expect(result, JSON.stringify(result)).toMatchObject({
        status: 'completed',
        source,
        replyToMessageId: 'initial:peer-reviewer'
      })
      await page.waitForFunction(
        () => document.querySelectorAll('[data-agent-console-node]').length === 2
      )
      expect(await page.locator('[data-agent-console-node]').count()).toBe(2)
    },
    electronScenarioTimeoutMs
  )
})
