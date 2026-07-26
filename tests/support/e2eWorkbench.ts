import type { ChildProcess } from 'node:child_process'
import { access, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect, type Socket } from 'node:net'
import { randomUUID } from 'node:crypto'

import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { expect } from 'vitest'

import {
  captureE2eFailureDiagnostics,
  initializeE2eDiagnostics,
  startE2eTracing,
  stopE2eTracing
} from './e2eDiagnostics'
import { runE2eTeardown, withE2eDeadline } from './e2eLifecycle'
import {
  encodeTerminalProviderFrame,
  TerminalProviderFrameDecoder,
  terminalProviderProtocolVersion
} from '../../src/contexts/run/infrastructure/provider/TerminalProviderProtocol'

export { e2eTeardownTimeoutMs } from './e2eLifecycle'

export const electronLaunchTimeoutMs = 30_000
export const electronScenarioTimeoutMs = 60_000
const electronCloseTimeoutMs = 10_000
const electronWindowStateTimeoutMs = 10_000
const terminalProviderConnectTimeoutMs = 1_500
const terminalProviderResponseTimeoutMs = 2_000

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
  await stopTerminalProvider(workbench.appStateDirectory)
  const removeOptions = {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100
  } as const
  await rm(workbench.projectDirectory, removeOptions)
  await rm(workbench.registryDirectory, removeOptions)
  await rm(workbench.appStateDirectory, removeOptions)
}

async function stopTerminalProvider(appStateDirectory: string): Promise<void> {
  const metadata = await readAuthenticatedTerminalProviderMetadata(appStateDirectory)
  if (!metadata) return
  try {
    process.kill(metadata.processId, 'SIGTERM')
  } catch {
    return
  }
  try {
    await waitForProcessIdExit(metadata.processId)
  } catch {
    try {
      process.kill(metadata.processId, 'SIGKILL')
    } catch {
      return
    }
    await waitForProcessIdExit(metadata.processId)
  }
}

export async function readAuthenticatedTerminalProviderMetadata(
  appStateDirectory: string
): Promise<{
  readonly authToken: string
  readonly endpoint: string
  readonly instanceId: string
  readonly processId: number
} | null> {
  const metadataPath = join(appStateDirectory, 'terminal-runtime-provider', 'provider.json')
  let metadata: {
    readonly authToken: string
    readonly endpoint: string
    readonly instanceId: string
    readonly processId: number
  }
  try {
    metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as typeof metadata
  } catch {
    return null
  }
  const identity = await authenticateTerminalProvider(metadata).catch(() => null)
  return identity === metadata.instanceId ? metadata : null
}

export async function waitForProcessIdExit(processId: number, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline && isProcessAlive(processId)) {
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  if (isProcessAlive(processId)) {
    throw new Error(`Process ${processId} did not exit naturally within ${timeoutMs}ms.`)
  }
}

async function authenticateTerminalProvider(metadata: {
  readonly authToken: string
  readonly endpoint: string
}): Promise<string> {
  const socket = connect(metadata.endpoint)

  try {
    await withE2eDeadline(
      waitForSocketConnect(socket),
      terminalProviderConnectTimeoutMs,
      'Terminal provider health connection'
    )
    const requestId = randomUUID()
    const response = waitForTerminalProviderHealthResponse(socket, requestId)
    socket.write(
      encodeTerminalProviderFrame({
        type: 'request',
        protocolVersion: terminalProviderProtocolVersion,
        requestId,
        authToken: metadata.authToken,
        method: 'health'
      })
    )
    return await withE2eDeadline(
      response,
      terminalProviderResponseTimeoutMs,
      'Terminal provider health response'
    )
  } finally {
    socket.destroy()
  }
}

function waitForSocketConnect(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      socket.off('close', handleClose)
      socket.off('connect', handleConnect)
      socket.off('error', handleError)
    }
    const handleClose = (): void => {
      cleanup()
      reject(new Error('Terminal provider socket closed before the health connection completed.'))
    }
    const handleConnect = (): void => {
      cleanup()
      resolve()
    }
    const handleError = (error: Error): void => {
      cleanup()
      reject(error)
    }

    socket.once('close', handleClose)
    socket.once('connect', handleConnect)
    socket.once('error', handleError)
  })
}

function waitForTerminalProviderHealthResponse(socket: Socket, requestId: string): Promise<string> {
  const decoder = new TerminalProviderFrameDecoder()

  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      socket.off('close', handleClose)
      socket.off('data', handleData)
      socket.off('error', handleError)
    }
    const handleClose = (): void => {
      cleanup()
      reject(new Error('Terminal provider socket closed before the health response arrived.'))
    }
    const handleData = (chunk: Buffer): void => {
      try {
        for (const value of decoder.push(chunk)) {
          const message = value as {
            readonly type?: string
            readonly requestId?: string
            readonly ok?: boolean
            readonly result?: { readonly instanceId?: string }
          }
          if (message.type !== 'response' || message.requestId !== requestId) continue

          cleanup()
          if (message.ok && message.result?.instanceId) {
            resolve(message.result.instanceId)
          } else {
            reject(new Error('Terminal provider authentication failed during E2E cleanup.'))
          }
          return
        }
      } catch (error) {
        cleanup()
        reject(error)
      }
    }
    const handleError = (error: Error): void => {
      cleanup()
      reject(error)
    }

    socket.once('close', handleClose)
    socket.on('data', handleData)
    socket.once('error', handleError)
  })
}

function isProcessAlive(processId: number): boolean {
  try {
    process.kill(processId, 0)
    return true
  } catch {
    return false
  }
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
  const packagedExecutablePath = process.env.CLEANCODE_E2E_EXECUTABLE_PATH?.trim()
  const electronApplication = await electron.launch({
    args: [
      ...(packagedExecutablePath ? [] : ['.']),
      '--lang=zh-CN',
      `--user-data-dir=${join(workbench.appStateDirectory, 'electron-user-data')}`
    ],
    cwd: process.cwd(),
    env: mergeE2eProcessEnvironment(
      {
        ...process.env,
        CLEANCODE_TEST_DISABLE_AGENT_AUTOSTART: '1',
        CLEANCODE_TEST_DISABLE_SINGLE_INSTANCE_LOCK: '1',
        CLEANCODE_TEST_PROJECT_DIRECTORY: workbench.projectDirectory,
        CLEANCODE_TEST_APP_STATE_DIRECTORY: workbench.appStateDirectory,
        CLEANCODE_TEST_PROJECT_REGISTRY_PATH: join(
          workbench.registryDirectory,
          'project-registry.json'
        )
      },
      {
        ...options.environment,
        CLEANCODE_TEST_BACKGROUND_E2E: runElectronInBackground ? '1' : '0'
      }
    ),
    ...(packagedExecutablePath ? { executablePath: packagedExecutablePath } : {})
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

export function mergeE2eProcessEnvironment(
  baseEnvironment: NodeJS.ProcessEnv,
  overrides: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform
): Record<string, string> {
  const environment = Object.fromEntries(
    Object.entries({ ...baseEnvironment, ...overrides }).filter(
      (entry): entry is [string, string] => entry[1] !== undefined
    )
  )
  for (const name of Object.keys(environment)) {
    if (name.toLowerCase() === 'electron_run_as_node') delete environment[name]
  }
  if (platform !== 'win32') return environment

  const path =
    readCaseInsensitiveEnvironmentValue(overrides, 'PATH') ??
    readCaseInsensitiveEnvironmentValue(baseEnvironment, 'PATH')
  for (const name of Object.keys(environment)) {
    if (name.toLowerCase() === 'path') delete environment[name]
  }
  if (path !== undefined) environment.Path = path

  return environment
}

function readCaseInsensitiveEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  expectedName: string
): string | undefined {
  const name = Object.keys(environment).find(
    (candidate) => candidate.toLowerCase() === expectedName.toLowerCase()
  )

  return name ? environment[name] : undefined
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
    const processExit = waitForProcessExit(electronProcess, electronCloseTimeoutMs)
    await withE2eDeadline(
      Promise.race([electronApp.close(), processExit]),
      electronCloseTimeoutMs,
      'Electron application close'
    )
    await processExit
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

export interface WaitForTextFileOptions {
  readonly intervalMs?: number
  readonly isComplete?: (contents: string) => boolean
  readonly timeoutMs?: number
}

export async function waitForTextFile(
  filePath: string,
  options: WaitForTextFileOptions = {}
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 5_000
  const intervalMs = Math.max(1, options.intervalMs ?? 50)
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  let previousContents: string | undefined

  do {
    try {
      const contents = await readFile(filePath, 'utf8')
      let isComplete = true

      try {
        isComplete = options.isComplete?.(contents) ?? true
      } catch (error) {
        isComplete = false
        lastError = error
      }

      if (!isComplete) {
        previousContents = undefined
        lastError ??= new Error('Text file content did not pass readiness validation.')
      } else if (contents === previousContents) {
        return contents
      } else {
        previousContents = contents
        lastError = new Error(
          `Text file content had not settled yet (last length: ${contents.length}).`
        )
      }
    } catch (error) {
      if (!isTransientTextFileReadError(error)) {
        throw error
      }
      previousContents = undefined
      lastError = error
    }

    const remainingMs = deadline - Date.now()
    if (remainingMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, remainingMs)))
    }
  } while (Date.now() < deadline)

  throw new Error(
    `Text file ${filePath} did not become complete and stable within ${timeoutMs}ms. Last observation: ${describeError(lastError)}`,
    { cause: lastError }
  )
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

  await withE2eDeadline(
    new Promise<void>((resolve) => electronProcess.once('exit', () => resolve())),
    timeoutMs,
    'Electron process exit'
  )
}

function isTransientTextFileReadError(error: unknown): error is NodeJS.ErrnoException {
  const code = (error as NodeJS.ErrnoException | null)?.code

  return code === 'EACCES' || code === 'EBUSY' || code === 'ENOENT' || code === 'EPERM'
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code
    return code ? `${code}: ${error.message}` : error.message
  }

  return String(error)
}
