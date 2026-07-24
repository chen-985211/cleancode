// @vitest-environment node

import type { ElectronApplication, Page } from 'playwright'
import { expect, vi } from 'vitest'

import {
  closeElectronApp,
  createE2eWorkbench,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  launchApp,
  readAuthenticatedTerminalProviderMetadata,
  teardownE2eScenario,
  waitForProcessIdExit,
  type E2eScenarioResources,
  type E2eWorkbench
} from '../support/e2eWorkbench'
import { readE2eProcessOutput } from '../support/e2eDiagnostics'
import {
  configureAndStartTerminalLaunchCommand,
  e2eShellReadyMarker,
  readTerminalSessionId,
  waitForTerminalOutput,
  waitForTerminalShellReady,
  writeTerminalCommand
} from '../support/e2eTerminal'

describe('terminal runtime recovery e2e', () => {
  let workbench: E2eWorkbench
  let electronApp: ElectronApplication
  let page: Page
  let resources: E2eScenarioResources

  beforeEach(async () => {
    resources = {}
    workbench = await createE2eWorkbench('cleancode-terminal-recovery-e2e')
    resources.workbench = workbench
    ;({ electronApp, page } = await launchWorkbench(workbench))
    resources.electronApp = electronApp
    resources.page = page
    await createRunningTerminal(page)
  }, electronLaunchTimeoutMs)

  afterEach(async ({ task }) => {
    await teardownE2eScenario({
      resources,
      taskFailed: task.result?.state === 'fail',
      taskName: task.name
    })
  })

  it(
    'warm-attaches the same retained PTY after a normal application restart',
    { tags: 'smoke', timeout: electronScenarioTimeoutMs },
    async () => {
      const sessionId = await retainTerminal(page)
      await writeTerminalCommand(
        page,
        'Terminal 1',
        "while :; do printf 'WARM_TICK\\n'; sleep 0.2; done\r"
      )
      await waitForTerminalOutput(page, 'Terminal 1', 'WARM_TICK')

      await restartApplication()

      expect(await readTerminalSessionId(page, 'Terminal 1')).toBe(sessionId)
      await waitForTerminalOutput(page, 'Terminal 1', 'WARM_TICK')
      await writeTerminalCommand(page, 'Terminal 1', '\u0003')
      await waitForTerminalTail(page, 'Terminal 1', e2eShellReadyMarker)
      await writeTerminalCommand(page, 'Terminal 1', "printf 'AFTER_WARM\\n'\r")
      await waitForTerminalOutput(page, 'Terminal 1', 'AFTER_WARM')
      await retireCurrentTerminal()
    }
  )

  it(
    'naturally exits Electron, PTYs, and the Provider within a bounded multi-terminal shutdown',
    async () => {
      const terminalNames = Array.from({ length: 16 }, (_, index) => `Terminal ${index + 1}`)
      for (const terminalName of terminalNames.slice(1)) {
        await page.getByRole('button', { name: '新建终端积木' }).click()
        await waitForTerminalShellReady(page, terminalName)
      }
      const sessionIds = await Promise.all(
        terminalNames.map((name) => readTerminalSessionId(page, name))
      )
      const processIds = await Promise.all(
        sessionIds.map((sessionId) => readTerminalProcessId(page, sessionId))
      )
      const provider = await readAuthenticatedTerminalProviderMetadata(workbench.appStateDirectory)
      expect(provider).not.toBeNull()
      const electronProcess = electronApp.process()
      const shutdownStartedAt = performance.now()

      await closeElectronApp(electronApp)
      const shutdownDurationMs = performance.now() - shutdownStartedAt
      resources.electronApp = undefined
      resources.page = undefined

      expect(electronProcess.exitCode).toBe(0)
      expect(electronProcess.signalCode).toBeNull()
      expect(shutdownDurationMs).toBeLessThan(8_000)
      await Promise.all(processIds.map((processId) => expectProcessToExit(processId)))
      await waitForProcessIdExit(provider!.processId, 5_000)
      expect(readE2eProcessOutput(electronApp).join('\n')).not.toContain(
        'detachDestroyedTerminalView'
      )
    },
    electronScenarioTimeoutMs
  )

  it(
    'inherits retention across a quick-launch replacement and application restart',
    async () => {
      const previousSessionId = await retainTerminal(page)

      await configureAndStartTerminalLaunchCommand(
        page,
        'Terminal 1',
        "printf 'INHERITED_LAUNCH\\n'"
      )

      const inheritedSessionId = await readTerminalSessionId(page, 'Terminal 1')
      expect(inheritedSessionId).not.toBe(previousSessionId)
      await page.getByRole('button', { name: 'Terminal 1 应用退出后不再保留此会话' }).waitFor()
      await writeTerminalCommand(
        page,
        'Terminal 1',
        "while :; do printf 'INHERITED_TICK\\n'; sleep 0.2; done\r"
      )
      await waitForTerminalOutput(page, 'Terminal 1', 'INHERITED_TICK')

      await restartApplication()

      expect(await readTerminalSessionId(page, 'Terminal 1')).toBe(inheritedSessionId)
      await waitForTerminalOutput(page, 'Terminal 1', 'INHERITED_TICK')
      await retireCurrentTerminal()
    },
    electronScenarioTimeoutMs
  )

  it(
    'reattaches the same session after the renderer crashes',
    async () => {
      const sessionId = await readTerminalSessionId(page, 'Terminal 1')
      await writeTerminalCommand(
        page,
        'Terminal 1',
        "while :; do printf 'RENDERER_TICK\\n'; sleep 0.2; done\r"
      )
      await waitForTerminalOutput(page, 'Terminal 1', 'RENDERER_TICK')
      const recoveredWindow = electronApp.waitForEvent('window')
      await electronApp.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.webContents.forcefullyCrashRenderer()
      })
      page = await recoveredWindow
      resources.page = page
      await page.waitForLoadState('domcontentloaded')
      await page.getByText('Terminal 1').waitFor()

      expect(await readTerminalSessionId(page, 'Terminal 1')).toBe(sessionId)
      await waitForTerminalOutput(page, 'Terminal 1', 'RENDERER_TICK')
    },
    electronScenarioTimeoutMs
  )

  it(
    'warm-attaches a retained session after the Electron main process crashes',
    async () => {
      const sessionId = await retainTerminal(page)
      await writeTerminalCommand(page, 'Terminal 1', "printf 'BEFORE_MAIN_CRASH\\n'\r")
      await waitForTerminalOutput(page, 'Terminal 1', 'BEFORE_MAIN_CRASH')

      const mainProcess = electronApp.process()
      mainProcess.kill('SIGKILL')
      await new Promise<void>((resolve) => mainProcess.once('exit', () => resolve()))
      resources.electronApp = undefined
      resources.page = undefined
      ;({ electronApp, page } = await launchWorkbench(workbench))
      resources.electronApp = electronApp
      resources.page = page

      expect(await readTerminalSessionId(page, 'Terminal 1')).toBe(sessionId)
      await writeTerminalCommand(page, 'Terminal 1', "printf 'AFTER_MAIN_CRASH\\n'\r")
      await waitForTerminalOutput(page, 'Terminal 1', 'AFTER_MAIN_CRASH')
      await retireCurrentTerminal()
    },
    electronScenarioTimeoutMs
  )

  it(
    'falls back to read-only normal-buffer history after the Provider crashes',
    async () => {
      const sessionId = await retainTerminal(page)
      await writeTerminalCommand(page, 'Terminal 1', "printf 'DURABLE_PROVIDER_HISTORY\\n'\r")
      await waitForTerminalOutput(page, 'Terminal 1', 'DURABLE_PROVIDER_HISTORY')
      const metadata = await readAuthenticatedTerminalProviderMetadata(workbench.appStateDirectory)
      expect(metadata).not.toBeNull()
      process.kill(metadata!.processId, 'SIGKILL')
      await waitForProcessIdExit(metadata!.processId)
      await waitForTerminalStopActionDisabled(page)

      await restartApplication()

      expect(await readTerminalSessionId(page, 'Terminal 1')).toBe(sessionId)
      await waitForTerminalOutput(page, 'Terminal 1', 'DURABLE_PROVIDER_HISTORY')
      await waitForTerminalStopActionDisabled(page)
      await retireCurrentTerminal()
    },
    electronScenarioTimeoutMs
  )

  async function restartApplication(): Promise<void> {
    await closeElectronApp(electronApp)
    resources.electronApp = undefined
    resources.page = undefined
    ;({ electronApp, page } = await launchWorkbench(workbench))
    resources.electronApp = electronApp
    resources.page = page
  }

  async function retireCurrentTerminal(): Promise<void> {
    const sessionId = await readTerminalSessionId(page, 'Terminal 1')
    await page.evaluate(
      (currentSessionId) => window.cleancode?.terminateTerminal({ sessionId: currentSessionId }),
      sessionId
    )
  }
})

async function launchWorkbench(workbench: E2eWorkbench) {
  const electronApp = await launchApp(workbench, {
    environment: { PS1: `${e2eShellReadyMarker} `, SHELL: '/bin/sh' }
  })
  const page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await expectDesktopRuntime(page)
  return { electronApp, page }
}

async function createRunningTerminal(page: Page): Promise<void> {
  await page.getByRole('button', { name: '添加项目' }).click()
  await page.getByRole('button', { name: '新建终端积木' }).click()
  await waitForTerminalShellReady(page, 'Terminal 1')
}

async function waitForTerminalStopActionDisabled(page: Page): Promise<void> {
  const stopAction = page.getByRole('button', { name: 'Terminal 1 停止当前命令' })
  await expect.poll(() => stopAction.isDisabled(), { timeout: 5_000 }).toBe(true)
}

async function retainTerminal(page: Page): Promise<string> {
  const sessionId = await readTerminalSessionId(page, 'Terminal 1')
  await page.getByRole('button', { name: 'Terminal 1 应用退出后继续运行此会话' }).click()
  await page.getByRole('button', { name: 'Terminal 1 应用退出后不再保留此会话' }).waitFor()
  return sessionId
}

async function waitForTerminalTail(page: Page, terminalName: string, tail: string): Promise<void> {
  const sessionId = await readTerminalSessionId(page, terminalName)
  await page.waitForFunction(
    ({ sessionId, tail }) =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-terminal-session-id]'))
        .find((element) => element.dataset.terminalSessionId === sessionId)
        ?.textContent?.trimEnd()
        .endsWith(tail) ?? false,
    { sessionId, tail }
  )
}

async function readTerminalProcessId(page: Page, sessionId: string): Promise<number> {
  const processId = await page.evaluate(async (currentSessionId) => {
    const sessions = await window.cleancode?.listTerminalSessions({
      sessionIds: [currentSessionId]
    })
    return sessions?.[0]?.processId ?? null
  }, sessionId)
  expect(processId).not.toBeNull()
  return processId!
}

async function expectProcessToExit(processId: number): Promise<void> {
  await vi.waitFor(
    () => {
      expect(isProcessAlive(processId)).toBe(false)
    },
    { timeout: 5_000, interval: 25 }
  )
}

function isProcessAlive(processId: number): boolean {
  try {
    process.kill(processId, 0)
    return true
  } catch {
    return false
  }
}
