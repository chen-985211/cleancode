// @vitest-environment node

import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

import type { ElectronApplication, Page } from 'playwright'
import { expect } from 'vitest'

import {
  closeElectronApp,
  createE2eWorkbench,
  electronLaunchTimeoutMs,
  electronScenarioTimeoutMs,
  expectDesktopRuntime,
  launchApp,
  readAuthenticatedTerminalProviderMetadata,
  selectBlankCanvasAction,
  teardownE2eScenario,
  waitForProcessIdExit,
  type E2eScenarioResources,
  type E2eWorkbench
} from '../support/e2eWorkbench'
import { readE2eProcessOutput } from '../support/e2eDiagnostics'
import { pollUntilState } from '../support/e2ePolling'
import {
  asE2eTerminalInput,
  configureAndStartTerminalLaunchCommand,
  createE2ePrintCommand,
  createE2eStreamingCommand,
  createE2eTerminalEnvironment,
  e2eShellReadyMarker,
  readTerminalSessionId,
  waitForTerminalOutput,
  waitForTerminalShellPrompt,
  writeTerminalCommand
} from '../support/e2eTerminal'

const electronCrashRecoveryTimeoutMs =
  process.platform === 'win32' ? 90_000 : electronScenarioTimeoutMs

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
        asE2eTerminalInput(createE2eStreamingCommand('WARM_TICK', 200))
      )
      await waitForTerminalOutput(page, 'Terminal 1', 'WARM_TICK')

      await restartApplication()

      expect(await readTerminalSessionId(page, 'Terminal 1')).toBe(sessionId)
      await waitForTerminalOutput(page, 'Terminal 1', 'WARM_TICK')
      await writeTerminalCommand(page, 'Terminal 1', '\u0003')
      await waitForTerminalShellPrompt(page, 'Terminal 1')
      await writeTerminalCommand(
        page,
        'Terminal 1',
        asE2eTerminalInput(createE2ePrintCommand('AFTER_WARM'))
      )
      await waitForTerminalOutput(page, 'Terminal 1', 'AFTER_WARM')
      await retireCurrentTerminal()
    }
  )

  it(
    'naturally exits Electron, PTYs, and the Provider within a bounded multi-terminal shutdown',
    async () => {
      const terminalNames = Array.from({ length: 16 }, (_, index) => `Terminal ${index + 1}`)
      for (const terminalName of terminalNames.slice(1)) {
        await selectBlankCanvasAction(page, '新建终端积木')
        await ensureTerminalShellStarted(page, terminalName)
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
        createE2ePrintCommand('INHERITED_LAUNCH')
      )

      const inheritedSessionId = await readTerminalSessionId(page, 'Terminal 1')
      expect(inheritedSessionId).not.toBe(previousSessionId)
      await page.getByRole('button', { name: 'Terminal 1 应用退出后不再保留此会话' }).waitFor()
      await writeTerminalCommand(
        page,
        'Terminal 1',
        asE2eTerminalInput(createE2eStreamingCommand('INHERITED_TICK', 200))
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
        asE2eTerminalInput(createE2eStreamingCommand('RENDERER_TICK', 200))
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
      await writeTerminalCommand(
        page,
        'Terminal 1',
        asE2eTerminalInput(createE2ePrintCommand('BEFORE_MAIN_CRASH'))
      )
      await waitForTerminalOutput(page, 'Terminal 1', 'BEFORE_MAIN_CRASH')

      await crashElectronMainProcess(electronApp)
      resources.electronApp = undefined
      resources.page = undefined
      ;({ electronApp, page } = await launchWorkbench(workbench))
      resources.electronApp = electronApp
      resources.page = page

      expect(await readTerminalSessionId(page, 'Terminal 1')).toBe(sessionId)
      await writeTerminalCommand(
        page,
        'Terminal 1',
        asE2eTerminalInput(createE2ePrintCommand('AFTER_MAIN_CRASH'))
      )
      await waitForTerminalOutput(page, 'Terminal 1', 'AFTER_MAIN_CRASH')
      await retireCurrentTerminal()
    },
    electronCrashRecoveryTimeoutMs
  )

  it(
    'falls back to read-only normal-buffer history after the Provider crashes',
    async () => {
      const sessionId = await retainTerminal(page)
      await writeTerminalCommand(
        page,
        'Terminal 1',
        asE2eTerminalInput(createE2ePrintCommand('DURABLE_PROVIDER_HISTORY'))
      )
      await waitForTerminalOutput(page, 'Terminal 1', 'DURABLE_PROVIDER_HISTORY')
      await waitForPersistedTerminalHistory(workbench, 'DURABLE_PROVIDER_HISTORY')
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

async function waitForPersistedTerminalHistory(
  workbench: E2eWorkbench,
  expectedText: string
): Promise<void> {
  const recoveryDirectory = join(
    workbench.appStateDirectory,
    'terminal-runtime-provider',
    'recovery'
  )

  await pollUntilState({
    description: `persisted terminal history to contain ${expectedText}`,
    observe: async () => {
      const entries = await readdir(recoveryDirectory, { recursive: true }).catch(() => [])

      for (const entry of entries) {
        const contents = await readFile(join(recoveryDirectory, entry), 'utf8').catch(() => '')
        if (contents.includes(expectedText)) return true
      }
      return false
    },
    accept: Boolean,
    intervalMs: 100,
    timeoutMs: 10_000
  })
}

async function launchWorkbench(workbench: E2eWorkbench) {
  let electronApp: ElectronApplication | undefined

  try {
    electronApp = await launchApp(workbench, {
      environment: createE2eTerminalEnvironment()
    })
    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await expectDesktopRuntime(page)
    await waitForTerminalRuntimeReady(page)
    return { electronApp, page }
  } catch (error) {
    if (electronApp) {
      await closeElectronApp(electronApp).catch(() => undefined)
    }
    throw new Error('Electron failed to relaunch after the terminal Provider handoff.', {
      cause: error
    })
  }
}

async function waitForTerminalRuntimeReady(page: Page): Promise<void> {
  const phase = await pollUntilState({
    description: 'terminal runtime availability to become ready',
    observe: () =>
      page.evaluate(async () => {
        const availability = await window.cleancode?.getTerminalRuntimeAvailability()
        if (availability?.phase === 'unavailable' && availability.retryable) {
          return (await window.cleancode?.retryTerminalRuntime())?.phase ?? 'missing'
        }
        return availability?.phase ?? 'missing'
      }),
    accept: (currentPhase) => currentPhase === 'ready',
    intervalMs: 250,
    timeoutMs: process.platform === 'win32' ? 10_000 : 5_000
  })

  expect(phase).toBe('ready')
}

async function createRunningTerminal(page: Page): Promise<void> {
  await page.getByRole('button', { name: '添加项目' }).click()
  await selectBlankCanvasAction(page, '新建终端积木')
  await ensureTerminalShellStarted(page, 'Terminal 1')
}

async function ensureTerminalShellStarted(page: Page, terminalName: string): Promise<void> {
  const outcome = await waitForTerminalShellOutcome(page, terminalName)
  if (outcome.phase === 'ready') return

  throw new Error(`${terminalName} did not start: ${outcome.failureReason}`)
}

async function waitForTerminalShellOutcome(
  page: Page,
  terminalName: string
): Promise<
  { readonly phase: 'failed'; readonly failureReason: string } | { readonly phase: 'ready' }
> {
  const outcome = await pollUntilState({
    description: `${terminalName} shell to become ready or fail`,
    observe: () =>
      page.evaluate(
        async ({ marker, terminalName, windows }) => {
          const output = Array.from(
            document.querySelectorAll<HTMLElement>('[data-terminal-session-id]')
          ).find((element) => element.getAttribute('aria-label') === `${terminalName} 文本输出`)
          const sessionId = output?.dataset.terminalSessionId
          if (!sessionId) return null

          const terminalText = output.textContent?.trimEnd() ?? ''
          const promptReady = windows
            ? terminalText.endsWith('>') && terminalText.slice(-512).includes('PS ')
            : terminalText.endsWith(marker)
          if (promptReady) return { phase: 'ready' as const }

          const sessions = await window.cleancode?.listTerminalSessions({
            sessionIds: [sessionId]
          })
          const session = sessions?.[0]
          if (session?.status !== 'failed' && session?.status !== 'exited') return null

          return {
            phase: 'failed' as const,
            failureReason: session.failureReason ?? `terminal entered ${session.status} state`
          }
        },
        {
          marker: e2eShellReadyMarker,
          terminalName,
          windows: process.platform === 'win32'
        }
      ),
    accept: (currentOutcome) => currentOutcome !== null,
    intervalMs: 50,
    timeoutMs: 30_000
  })

  if (!outcome) throw new Error(`${terminalName} shell outcome was unavailable.`)
  return outcome
}

async function crashElectronMainProcess(electronApp: ElectronApplication): Promise<void> {
  const mainProcessId = await electronApp.evaluate(() => process.pid)
  const launcherProcess = electronApp.process()
  const launcherProcessId = launcherProcess.pid

  await electronApp
    .evaluate(() => {
      setImmediate(() => process.kill(process.pid, 'SIGKILL'))
    })
    .catch(() => undefined)
  await waitForProcessIdExit(mainProcessId, 10_000)

  if (launcherProcessId && launcherProcessId !== mainProcessId) {
    launcherProcess.kill('SIGKILL')
    await waitForProcessIdExit(launcherProcessId, 10_000)
  }
}

async function waitForTerminalStopActionDisabled(page: Page): Promise<void> {
  const stopAction = page.getByRole('button', { name: 'Terminal 1 停止当前命令' })
  await pollUntilState({
    description: 'terminal stop action to become disabled',
    observe: () => stopAction.isDisabled(),
    accept: Boolean,
    timeoutMs: 5_000
  })
}

async function retainTerminal(page: Page): Promise<string> {
  const sessionId = await readTerminalSessionId(page, 'Terminal 1')
  await page.getByRole('button', { name: 'Terminal 1 应用退出后继续运行此会话' }).click()
  await page.getByRole('button', { name: 'Terminal 1 应用退出后不再保留此会话' }).waitFor()
  return sessionId
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
