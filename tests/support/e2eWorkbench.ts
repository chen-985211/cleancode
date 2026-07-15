import type { ChildProcess } from 'node:child_process'
import { access, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { expect } from 'vitest'

import {
  captureE2eFailureDiagnostics,
  initializeE2eDiagnostics,
  startE2eTracing,
  stopE2eTracing
} from './e2eDiagnostics'
import { runE2eTeardown } from './e2eLifecycle'

export const electronLaunchTimeoutMs = 30_000
export const electronScenarioTimeoutMs = 60_000
const electronCloseTimeoutMs = 10_000
const electronWindowStateTimeoutMs = 10_000

export interface E2eWorkbench {
  readonly projectDirectory: string
  readonly registryDirectory: string
  readonly appStateDirectory: string
}

export interface E2eScenarioResources {
  electronApp?: ElectronApplication
  page?: Page
  workbench?: E2eWorkbench
}

export interface LaunchAppOptions {
  readonly environment?: NodeJS.ProcessEnv
}

export async function createE2eWorkbench(prefix: string): Promise<E2eWorkbench> {
  const temporaryDirectory = await realpath(tmpdir())

  return {
    projectDirectory: await mkdtemp(join(temporaryDirectory, `${prefix}-project-`)),
    registryDirectory: await mkdtemp(join(temporaryDirectory, `${prefix}-registry-`)),
    appStateDirectory: await mkdtemp(join(temporaryDirectory, `${prefix}-state-`))
  }
}

async function cleanupE2eWorkbench(workbench: E2eWorkbench): Promise<void> {
  await rm(workbench.projectDirectory, { recursive: true, force: true })
  await rm(workbench.registryDirectory, { recursive: true, force: true })
  await rm(workbench.appStateDirectory, { recursive: true, force: true })
}

export async function teardownE2eScenario(input: {
  readonly cleanupWorkbenchArtifacts?: (workbench: E2eWorkbench) => Promise<void>
  readonly resources: E2eScenarioResources
  readonly taskFailed: boolean
  readonly taskName: string
}): Promise<void> {
  const { electronApp, page, workbench } = input.resources

  await runE2eTeardown({
    captureFailureDiagnostics:
      input.taskFailed && electronApp && workbench
        ? () =>
            captureE2eFailureDiagnostics({
              electronApp,
              page,
              taskName: input.taskName,
              workbench
            })
        : undefined,
    cleanupScenario: workbench
      ? async () => {
          try {
            await input.cleanupWorkbenchArtifacts?.(workbench)
          } finally {
            await cleanupE2eWorkbench(workbench)
          }
        }
      : undefined,
    closeApplication: electronApp ? () => closeElectronApp(electronApp) : undefined
  })
}

export async function launchApp(
  workbench: E2eWorkbench,
  options: LaunchAppOptions = {}
): Promise<ElectronApplication> {
  const runElectronInBackground = process.env.CLEANCODE_E2E_VISIBLE !== '1'
  const electronApplication = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      CLEANCODE_TEST_DISABLE_AGENT_AUTOSTART: '1',
      CLEANCODE_TEST_PROJECT_DIRECTORY: workbench.projectDirectory,
      CLEANCODE_TEST_APP_STATE_DIRECTORY: workbench.appStateDirectory,
      CLEANCODE_TEST_PROJECT_REGISTRY_PATH: join(
        workbench.registryDirectory,
        'project-registry.json'
      ),
      ...options.environment,
      CLEANCODE_TEST_BACKGROUND_E2E: runElectronInBackground ? '1' : '0'
    }
  })
  initializeE2eDiagnostics(electronApplication)
  try {
    await startE2eTracing(electronApplication)
    if (runElectronInBackground) {
      await assertElectronRunsInBackground(electronApplication)
    }
  } catch (error) {
    const recoveryErrors: unknown[] = []

    try {
      await captureE2eFailureDiagnostics({
        electronApp: electronApplication,
        page: electronApplication.windows()[0],
        taskName: 'electron-launch-failure',
        workbench
      })
    } catch (recoveryError) {
      recoveryErrors.push(recoveryError)
    }

    try {
      await closeElectronApp(electronApplication)
    } catch (recoveryError) {
      electronApplication.process().kill('SIGKILL')
      recoveryErrors.push(recoveryError)
    }

    if (recoveryErrors.length > 0) {
      throw new AggregateError(
        [error, ...recoveryErrors],
        'Electron launch failed and its recovery was incomplete.'
      )
    }

    throw error
  }

  return electronApplication
}

async function assertElectronRunsInBackground(
  electronApplication: ElectronApplication
): Promise<void> {
  await electronApplication.firstWindow()

  await expect
    .poll(
      () =>
        electronApplication.evaluate(({ BrowserWindow, screen }) => {
          const mainWindow = BrowserWindow.getAllWindows()[0]
          const bounds = mainWindow?.getBounds() ?? null
          const intersectsDisplay = bounds
            ? screen.getAllDisplays().some(({ bounds: displayBounds }) => {
                return (
                  bounds.x < displayBounds.x + displayBounds.width &&
                  bounds.x + bounds.width > displayBounds.x &&
                  bounds.y < displayBounds.y + displayBounds.height &&
                  bounds.y + bounds.height > displayBounds.y
                )
              })
            : false

          return {
            bounds,
            focused: mainWindow?.isFocused() ?? false,
            found: Boolean(mainWindow),
            intersectsDisplay,
            visible: mainWindow?.isVisible() ?? false
          }
        }),
      {
        interval: 50,
        message: 'Background Electron E2E window should be visible, unfocused, and offscreen',
        timeout: electronWindowStateTimeoutMs
      }
    )
    .toMatchObject({
      focused: false,
      found: true,
      intersectsDisplay: false,
      visible: true
    })
}

export async function closeElectronApp(
  electronApp: ElectronApplication | undefined
): Promise<void> {
  if (!electronApp) {
    return
  }

  let tracingError: unknown

  try {
    await stopE2eTracing(electronApp)
  } catch (error) {
    tracingError = error
  }

  const electronProcess = electronApp.process()

  if (electronProcess.exitCode !== null || electronProcess.signalCode !== null) {
    if (tracingError) {
      throw tracingError
    }
    return
  }

  try {
    await withTimeout(electronApp.close(), electronCloseTimeoutMs, 'Electron application close')
    await waitForProcessExit(electronProcess, electronCloseTimeoutMs)
  } catch (error) {
    electronProcess.kill('SIGKILL')
    await waitForProcessExit(electronProcess, electronCloseTimeoutMs).catch(() => undefined)
    throw error
  }

  if (tracingError) {
    throw tracingError
  }
}

export async function readOnlyJsonFile(directory: string, fileName: string): Promise<string> {
  const matches = await findFilesNamed(directory, fileName)

  expect(matches).toHaveLength(1)

  return readFile(matches[0]!, 'utf8')
}

export async function waitForJsonFile(directory: string, fileName: string): Promise<string> {
  const deadline = Date.now() + 5_000

  while (Date.now() < deadline) {
    const matches = await findFilesNamed(directory, fileName)

    if (matches.length === 1) {
      return readFile(matches[0]!, 'utf8')
    }

    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  return readOnlyJsonFile(directory, fileName)
}

export async function waitForTextFile(filePath: string): Promise<string> {
  const deadline = Date.now() + 5_000

  while (Date.now() < deadline) {
    try {
      return await readFile(filePath, 'utf8')
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  return readFile(filePath, 'utf8')
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function expectDesktopRuntime(page: Page): Promise<void> {
  const runtimeState = await page.evaluate(() => ({
    hasCleancodeApi: Boolean(window.cleancode),
    hasPreviewWarning: document.body.textContent?.includes('浏览器预览模式') ?? false
  }))

  expect(runtimeState).toEqual({
    hasCleancodeApi: true,
    hasPreviewWarning: false
  })
}

async function findFilesNamed(directory: string, fileName: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const matches: string[] = []

  for (const entry of entries) {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      matches.push(...(await findFilesNamed(path, fileName)))
      continue
    }

    if (entry.isFile() && entry.name === fileName) {
      matches.push(path)
    }
  }

  return matches
}

async function waitForProcessExit(electronProcess: ChildProcess, timeoutMs: number): Promise<void> {
  if (electronProcess.exitCode !== null || electronProcess.signalCode !== null) {
    return
  }

  await withTimeout(
    new Promise<void>((resolve) => electronProcess.once('exit', () => resolve())),
    timeoutMs,
    'Electron process exit'
  )
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`${operation} timed out after ${timeoutMs}ms.`)),
          timeoutMs
        )
      })
    ])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}
