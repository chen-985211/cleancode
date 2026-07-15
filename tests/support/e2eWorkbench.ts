import type { ChildProcess } from 'node:child_process'
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

export const electronLaunchTimeoutMs = 30_000
export const electronScenarioTimeoutMs = 60_000
const electronCloseTimeoutMs = 10_000
const e2eArtifactDirectory = join(process.cwd(), 'test-results', 'e2e')
const applicationDiagnostics = new WeakMap<ElectronApplication, ApplicationDiagnostics>()

export interface E2eWorkbench {
  readonly projectDirectory: string
  readonly registryDirectory: string
  readonly appStateDirectory: string
}

export interface LaunchAppOptions {
  readonly environment?: NodeJS.ProcessEnv
}

interface ApplicationDiagnostics {
  readonly processOutput: string[]
  readonly rendererOutput: string[]
  tracingActive: boolean
}

export async function createE2eWorkbench(prefix: string): Promise<E2eWorkbench> {
  const temporaryDirectory = await realpath(tmpdir())

  return {
    projectDirectory: await mkdtemp(join(temporaryDirectory, `${prefix}-project-`)),
    registryDirectory: await mkdtemp(join(temporaryDirectory, `${prefix}-registry-`)),
    appStateDirectory: await mkdtemp(join(temporaryDirectory, `${prefix}-state-`))
  }
}

export async function cleanupE2eWorkbench(workbench: E2eWorkbench): Promise<void> {
  await rm(workbench.projectDirectory, { recursive: true, force: true })
  await rm(workbench.registryDirectory, { recursive: true, force: true })
  await rm(workbench.appStateDirectory, { recursive: true, force: true })
}

export async function launchApp(
  workbench: E2eWorkbench,
  options: LaunchAppOptions = {}
): Promise<ElectronApplication> {
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
      ...options.environment
    }
  })
  const diagnostics: ApplicationDiagnostics = {
    processOutput: [],
    rendererOutput: [],
    tracingActive: false
  }

  captureProcessOutput(electronApplication.process(), diagnostics)
  applicationDiagnostics.set(electronApplication, diagnostics)
  for (const page of electronApplication.windows()) {
    captureRendererOutput(page, diagnostics)
  }
  electronApplication.on('window', (page) => captureRendererOutput(page, diagnostics))
  try {
    await electronApplication.context().tracing.start({ screenshots: true, snapshots: true })
    diagnostics.tracingActive = true
  } catch (error) {
    await closeElectronApp(electronApplication).catch(() => {
      electronApplication.process().kill('SIGKILL')
    })
    throw error
  }

  return electronApplication
}

export async function captureE2eFailureDiagnostics(input: {
  readonly electronApp: ElectronApplication
  readonly page: Page
  readonly taskName: string
  readonly workbench: E2eWorkbench
}): Promise<void> {
  await captureFailureArtifacts({
    diagnostics: requireApplicationDiagnostics(input.electronApp),
    electronApp: input.electronApp,
    page: input.page,
    taskName: input.taskName,
    workbench: input.workbench
  })
}

export async function closeElectronApp(electronApp: ElectronApplication): Promise<void> {
  const diagnostics = applicationDiagnostics.get(electronApp)
  let tracingError: unknown

  if (diagnostics?.tracingActive) {
    try {
      await stopTracing(electronApp, diagnostics)
    } catch (error) {
      tracingError = error
    }
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

function captureProcessOutput(
  electronProcess: ChildProcess,
  diagnostics: ApplicationDiagnostics
): void {
  electronProcess.stdout?.on('data', (chunk) => {
    appendDiagnosticOutput(diagnostics.processOutput, `stdout: ${String(chunk)}`)
  })
  electronProcess.stderr?.on('data', (chunk) => {
    appendDiagnosticOutput(diagnostics.processOutput, `stderr: ${String(chunk)}`)
  })
}

function captureRendererOutput(page: Page, diagnostics: ApplicationDiagnostics): void {
  page.on('console', (message) => {
    appendDiagnosticOutput(
      diagnostics.rendererOutput,
      `console.${message.type()}: ${message.text()}`
    )
  })
  page.on('pageerror', (error) => {
    appendDiagnosticOutput(diagnostics.rendererOutput, `pageerror: ${error.stack ?? error.message}`)
  })
}

function appendDiagnosticOutput(output: string[], entry: string): void {
  output.push(entry)
  if (output.length > 200) {
    output.splice(0, output.length - 200)
  }
}

function requireApplicationDiagnostics(electronApp: ElectronApplication): ApplicationDiagnostics {
  const diagnostics = applicationDiagnostics.get(electronApp)

  if (!diagnostics) {
    throw new Error('E2E application diagnostics were not initialized.')
  }

  return diagnostics
}

async function captureFailureArtifacts(input: {
  readonly diagnostics: ApplicationDiagnostics
  readonly electronApp: ElectronApplication
  readonly page: Page
  readonly taskName: string
  readonly workbench: E2eWorkbench
}): Promise<void> {
  await mkdir(e2eArtifactDirectory, { recursive: true })
  const artifactStem = createArtifactStem(input.taskName)
  const screenshotPath = join(e2eArtifactDirectory, `${artifactStem}.png`)
  const tracePath = join(e2eArtifactDirectory, `${artifactStem}.zip`)
  const electronProcess = input.electronApp.process()
  const electronProcessState = {
    exitCode: electronProcess.exitCode,
    pid: electronProcess.pid,
    signalCode: electronProcess.signalCode
  }
  const rendererState = await readRendererState(input.page)
  const screenshotError = await captureScreenshot(input.page, screenshotPath)
  const traceError = await captureTrace(input.electronApp, input.diagnostics, tracePath)

  await writeFile(
    join(e2eArtifactDirectory, `${artifactStem}.json`),
    `${JSON.stringify(
      {
        electronProcess: electronProcessState,
        processOutput: input.diagnostics.processOutput,
        rendererOutput: input.diagnostics.rendererOutput,
        rendererState,
        screenshotError,
        traceError,
        workbench: input.workbench
      },
      null,
      2
    )}\n`,
    'utf8'
  )
}

async function readRendererState(page: Page): Promise<unknown> {
  try {
    return await page.evaluate(() => ({
      activeElement:
        document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.className,
      terminalOutputs: Array.from(
        document.querySelectorAll<HTMLElement>('[data-terminal-session-id]')
      ).map((element) => ({
        ariaLabel: element.getAttribute('aria-label'),
        sessionId: element.dataset.terminalSessionId,
        outputTail: element.textContent?.slice(-4_000) ?? ''
      })),
      url: window.location.href
    }))
  } catch (error) {
    return { error: getErrorMessage(error) }
  }
}

async function captureScreenshot(page: Page, screenshotPath: string): Promise<string | null> {
  try {
    await page.screenshot({ fullPage: true, path: screenshotPath })
    return null
  } catch (error) {
    return getErrorMessage(error)
  }
}

async function captureTrace(
  electronApp: ElectronApplication,
  diagnostics: ApplicationDiagnostics,
  tracePath: string
): Promise<string | null> {
  try {
    await stopTracing(electronApp, diagnostics, tracePath)
    return null
  } catch (error) {
    return getErrorMessage(error)
  }
}

async function stopTracing(
  electronApp: ElectronApplication,
  diagnostics: ApplicationDiagnostics,
  tracePath?: string
): Promise<void> {
  if (!diagnostics.tracingActive) {
    return
  }

  diagnostics.tracingActive = false
  await electronApp.context().tracing.stop(tracePath ? { path: tracePath } : undefined)
}

function createArtifactStem(taskName: string): string {
  const safeTaskName = taskName
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)

  return `${Date.now()}-${safeTaskName || 'e2e-failure'}`
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error)
}
