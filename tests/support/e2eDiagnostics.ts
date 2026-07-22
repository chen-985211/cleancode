import type { ChildProcess } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { ElectronApplication, Page } from 'playwright'

interface ApplicationDiagnostics {
  readonly processOutput: string[]
  readonly rendererOutput: string[]
  tracingActive: boolean
}

interface DiagnosticWorkbench {
  readonly appStateDirectory: string
  readonly projectDirectory: string
  readonly registryDirectory: string
}

const e2eArtifactDirectory = join(process.cwd(), 'test-results', 'e2e')
const applicationDiagnostics = new WeakMap<ElectronApplication, ApplicationDiagnostics>()

export function initializeE2eDiagnostics(electronApp: ElectronApplication): void {
  const diagnostics: ApplicationDiagnostics = {
    processOutput: [],
    rendererOutput: [],
    tracingActive: false
  }

  captureProcessOutput(electronApp.process(), diagnostics)
  applicationDiagnostics.set(electronApp, diagnostics)
  for (const page of electronApp.windows()) {
    captureRendererOutput(page, diagnostics)
  }
  electronApp.on('window', (page) => captureRendererOutput(page, diagnostics))
}

export function readE2eProcessOutput(electronApp: ElectronApplication): readonly string[] {
  return [...requireApplicationDiagnostics(electronApp).processOutput]
}

export async function startE2eTracing(electronApp: ElectronApplication): Promise<void> {
  const diagnostics = requireApplicationDiagnostics(electronApp)

  await electronApp.context().tracing.start({ screenshots: true, snapshots: true })
  diagnostics.tracingActive = true
}

export async function stopE2eTracing(electronApp: ElectronApplication): Promise<void> {
  const diagnostics = applicationDiagnostics.get(electronApp)

  if (diagnostics) {
    await stopTracing(electronApp, diagnostics)
  }
}

export async function captureE2eFailureDiagnostics(input: {
  readonly electronApp: ElectronApplication
  readonly page?: Page
  readonly taskName: string
  readonly workbench: DiagnosticWorkbench
}): Promise<void> {
  await captureFailureArtifacts({
    diagnostics: requireApplicationDiagnostics(input.electronApp),
    electronApp: input.electronApp,
    page: input.page,
    taskName: input.taskName,
    workbench: input.workbench
  })
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
  readonly page?: Page
  readonly taskName: string
  readonly workbench: DiagnosticWorkbench
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
  const rendererState = input.page
    ? await readRendererState(input.page)
    : { error: 'Renderer page was unavailable.' }
  const screenshotError = input.page
    ? await captureScreenshot(input.page, screenshotPath)
    : 'Renderer page was unavailable.'
  const traceError = await captureTrace(input.electronApp, input.diagnostics, tracePath)
  const providerLog = await readFile(
    join(input.workbench.appStateDirectory, 'terminal-runtime-provider', 'provider.log'),
    'utf8'
  ).catch(() => '')

  await writeFile(
    join(e2eArtifactDirectory, `${artifactStem}.json`),
    `${JSON.stringify(
      {
        electronProcess: electronProcessState,
        processOutput: input.diagnostics.processOutput,
        providerLog: providerLog.slice(-20_000),
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
      agentTerminals: Array.from(
        document.querySelectorAll<HTMLElement>('.agent-terminal-viewport')
      ).map((element) => ({
        filter: getComputedStyle(element).filter,
        bufferedOutputLength: Number(element.dataset.agentTerminalOutputLength ?? 0),
        outputTail: element.querySelector('.xterm-rows')?.textContent?.slice(-4_000) ?? '',
        processId: element.dataset.agentTerminalProcessId,
        sessionId: element.dataset.agentTerminalSessionId,
        sourceTheme: element.dataset.agentTerminalSourceTheme,
        workspaceName: element.dataset.agentTerminalWorkspaceName
      })),
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error)
}
