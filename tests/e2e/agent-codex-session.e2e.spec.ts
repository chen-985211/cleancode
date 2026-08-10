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
import {
  agentLaunchReadyTimeoutMs,
  waitForAgentLaunchReady,
  waitForAgentProviderInstalled,
  waitForAgentTerminalReady,
  stopAgentLaunchForShellSetup,
  writeAgentTerminalInput
} from '../support/e2eAgentRuntime'
import { selectAgentProviderFromCreateMenu } from '../support/e2eCanvasMenu'
import { pollUntilState } from '../support/e2ePolling'
import {
  asE2eTerminalInput,
  createE2ePrintCommand,
  createE2eTerminalEnvironment,
  prependE2ePath
} from '../support/e2eTerminal'
import {
  readWebgl2Availability,
  readXtermInkRatio,
  readXtermRasterProjection,
  readXtermRendererState
} from '../support/terminalRasterE2e'
import { setCanvasZoomToMaximum } from '../support/workbenchNodeCreationE2e'

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
    'keeps the Agent WebGL surface visible while raising its backing density',
    async () => {
      await expectDesktopRuntime(page)
      const launchReady = waitForAgentLaunchReady(page)
      await configureCodexExecutable(page, fakeCodex.executablePath)
      await page.getByRole('button', { name: '添加项目' }).click()
      await waitForAgentCount(page, 0)
      await waitForAgentProviderInstalled(page, 'codex')
      await selectAgentProviderFromCreateMenu(page, 'Codex')
      await waitForAgentCount(page, 1)
      await waitForAgentTerminals(page, 1)
      await launchReady

      const terminal = page.locator('[data-agent-console-node] .agent-terminal-viewport').first()
      await stopAgentLaunchForShellSetup(page, terminal)
      const visualMarker = Array.from(
        { length: 6 },
        (_, index) => `__AGENT_RASTER_VISIBLE_${index}__ ${'MW'.repeat(18)}`
      ).join('\n')
      await writeAgentTerminalInput(
        page,
        terminal,
        asE2eTerminalInput(createE2ePrintCommand(visualMarker))
      )
      const rendererState = await pollUntilState({
        description: 'Agent terminal renderer activation',
        observe: () => readXtermRendererState(terminal),
        accept: (state) => state.ready && ['dom', 'webgl'].includes(state.renderer),
        intervalMs: 50,
        timeoutMs: 10_000
      })
      const webgl2Available = await readWebgl2Availability(page)
      if (rendererState.renderer !== 'webgl' && webgl2Available) {
        throw new Error(`Expected Agent WebGL renderer, received ${rendererState.renderer}.`)
      }
      const initialProjection =
        rendererState.renderer === 'webgl'
          ? await pollUntilState({
              description: 'Agent baseline WebGL backing store',
              observe: () => readXtermRasterProjection(terminal),
              accept: (projection) =>
                projection !== null &&
                projection.renderer === 'webgl' &&
                projection.rasterScale === 1,
              intervalMs: 50,
              timeoutMs: 10_000
            })
          : null
      await pollUntilState({
        description: 'visible Agent terminal pixels before canvas zoom',
        observe: () => readXtermInkRatio(page, terminal),
        accept: (ratio) => ratio > 0.02,
        intervalMs: 50,
        retryObservationErrors: true,
        timeoutMs: 10_000
      })

      expect(await setCanvasZoomToMaximum(page, workbench.projectDirectory)).toBeCloseTo(1.6, 2)
      const zoomedProjection =
        rendererState.renderer === 'webgl'
          ? await pollUntilState({
              description: 'Agent high-density WebGL backing store',
              observe: () => readXtermRasterProjection(terminal),
              accept: (projection) =>
                projection !== null &&
                projection.renderer === 'webgl' &&
                projection.rasterScale === 1.75 &&
                projection.zoom >= 1.599,
              intervalMs: 50,
              timeoutMs: 10_000
            })
          : null
      const afterInkRatio = await pollUntilState({
        description: 'visible Agent terminal pixels after canvas zoom',
        observe: () => readXtermInkRatio(page, terminal),
        accept: (ratio) => ratio > 0.02,
        intervalMs: 50,
        retryObservationErrors: true,
        timeoutMs: 10_000
      })

      if (rendererState.renderer === 'webgl') {
        expect(initialProjection).not.toBeNull()
        expect(zoomedProjection).not.toBeNull()
        expect(zoomedProjection!.backingDensity).toBeGreaterThanOrEqual(
          zoomedProjection!.devicePixelRatio * 0.98
        )
      } else {
        expect(rendererState.renderer).toBe('dom')
        expect(webgl2Available).toBe(false)
      }
      expect(afterInkRatio).toBeGreaterThan(0.02)
    },
    electronScenarioTimeoutMs
  )

  it(
    'restores a Codex session selected through /resume even when no later turn completes',
    async () => {
      await expectDesktopRuntime(page)
      const firstLaunchReady = waitForAgentLaunchReady(page)
      await configureCodexExecutable(page, fakeCodex.executablePath)
      await page.getByRole('button', { name: '添加项目' }).click()
      await waitForAgentCount(page, 0)
      await waitForAgentProviderInstalled(page, 'codex')
      await selectAgentProviderFromCreateMenu(page, 'Codex')
      await waitForAgentCount(page, 1)
      await waitForAgentTerminals(page, 1)
      const firstLaunchRuntime = await firstLaunchReady

      const firstLaunch = await waitForCodexLaunch(
        fakeCodex.reportPath,
        1,
        agentLaunchReadyTimeoutMs
      )
      expect(firstLaunch.sessionId).toBe(fakeCodex.sessionId)
      expect(firstLaunch.args).not.toContain('resume')
      expect(
        await page
          .locator('[data-agent-console-node] .agent-terminal-viewport')
          .getAttribute('data-agent-terminal-session-id')
      ).toBe(firstLaunchRuntime.sessionId)
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
      await enterCodexResumeCommand(electronApp, page)
      await page.keyboard.press('Enter')
      await waitForCodexResumeSelection(fakeCodex.reportPath, fakeCodex.switchSessionId)
      await waitForCodexReport(
        fakeCodex.reportPath,
        (reports) => reports.find((report) => report.kind === 'app-server'),
        'Codex app-server thread resolution'
      )
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

      const restoredLaunchRuntime = await launchRestoredElectronApp()
      const restoredLaunch = await waitForCodexLaunch(
        fakeCodex.reportPath,
        2,
        agentLaunchReadyTimeoutMs
      )
      expect(restoredLaunch.args).toEqual(
        expect.arrayContaining(['resume', fakeCodex.switchSessionId])
      )
      expect(restoredLaunch.sessionId).toBe(fakeCodex.switchSessionId)
      expect(
        await page
          .locator('[data-agent-console-node] .agent-terminal-viewport')
          .getAttribute('data-agent-terminal-session-id')
      ).toBe(restoredLaunchRuntime.sessionId)

      async function launchRestoredElectronApp() {
        electronApp = await launchApp(workbench, {
          environment: createAgentProviderEnvironment(fakeCodex)
        })
        resources.electronApp = electronApp
        page = await electronApp.firstWindow()
        resources.page = page
        await page.waitForLoadState('domcontentloaded')
        await waitForAgentCount(page, 1)
        return waitForAgentTerminalReady(page)
      }
    },
    electronScenarioTimeoutMs
  )
})

async function enterCodexResumeCommand(
  electronApp: ElectronApplication,
  page: Page
): Promise<void> {
  if (process.platform !== 'win32') {
    await page.keyboard.type('/resume')
    return
  }

  const originalClipboard = await electronApp.evaluate(({ clipboard }) => clipboard.readText())
  try {
    await electronApp.evaluate(({ clipboard }) => clipboard.writeText('/resume'))
    await page.keyboard.press('Control+V')
  } finally {
    await electronApp.evaluate(
      ({ clipboard }, text) => clipboard.writeText(text),
      originalClipboard
    )
  }
}

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

async function waitForCodexLaunch(
  reportPath: string,
  expectedCount: number,
  timeoutMs = agentLaunchReadyTimeoutMs
): Promise<FakeCodexCliReport> {
  return waitForCodexReport(
    reportPath,
    (reports) => {
      const launches = reports.filter((report) => report.kind === 'session')
      return launches.length >= expectedCount ? launches[expectedCount - 1] : undefined
    },
    `Codex launch ${expectedCount}`,
    timeoutMs
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
  description: string,
  timeoutMs = agentLaunchReadyTimeoutMs
): Promise<FakeCodexCliReport> {
  const report = await pollUntilState({
    description,
    observe: async () => select(await readFakeCodexCliReports(reportPath)),
    accept: (observation) => observation !== undefined,
    timeoutMs
  })

  if (!report) throw new Error(`The completed ${description} observation was unavailable.`)
  return report
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
  sessionId: string,
  timeoutMs = agentLaunchReadyTimeoutMs
): Promise<void> {
  await pollUntilState({
    description: `durable Codex conversation binding ${sessionId}`,
    observe: () => readCodexProviderSessionRefs(workbench),
    accept: (bindings) =>
      bindings.some(
        (sessionRef) => sessionRef.kind === 'codex-thread' && sessionRef.value === sessionId
      ),
    timeoutMs
  })
}

interface CodexProviderSessionRef {
  readonly kind: string
  readonly value: string
}
