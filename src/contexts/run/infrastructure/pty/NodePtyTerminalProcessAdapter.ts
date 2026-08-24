import { execFile } from 'node:child_process'
import { accessSync, chmodSync, constants, existsSync } from 'node:fs'
import { readlink, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { platform } from 'node:os'
import { dirname, join, win32 as pathWin32 } from 'node:path'
import { promisify } from 'node:util'

import type { IPty } from 'node-pty'
import { spawn as spawnPtyProcess } from 'node-pty'

import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type {
  LaunchForegroundJobProcessCommand,
  StartTerminalProcessCommand,
  TerminalProcessHandle,
  TerminalProcessPort
} from '../../application/ports/TerminalProcessPort'
import {
  createTerminalCapabilityEnvironment,
  terminalEmulationName
} from '../../application/services/TerminalCapabilityEnvironment'
import type { TerminalSourceTheme } from '../../domain/aggregates/TerminalSession'
import { createTerminalProcessLaunch } from './TerminalShellCommand'
import {
  acceptForegroundJobFinalOutput,
  acceptForegroundJobOutput,
  createForegroundJobProbe,
  createForegroundJobShellControl,
  disposeForegroundJobShellControl,
  supportsForegroundJobShell,
  type ForegroundJobShellControl
} from './ForegroundJobShellControl'
import { createTerminalProcessEnvironment } from './TerminalProcessEnvironment'
import {
  readPosixProcessGroupSnapshot,
  terminatePosixProcessGroup
} from './PosixProcessGroupTermination'
import type { TerminalPrivateOutputControl } from './TerminalPrivateOutputControl'
import {
  acceptTerminalPrivateOutputControl,
  applyTerminalPrivateOutputControlEnvironment,
  createTerminalPrivateOutputControlLaunch,
  flushTerminalPrivateOutputControl,
  type TerminalPrivateOutputControlLaunch
} from './TerminalPrivateOutputControlLaunch'
import { interruptWindowsForegroundJob } from './WindowsForegroundJobInterrupt'
import {
  WindowsAgentShellReadiness,
  windowsAgentShellReadyCommand,
  windowsAgentShellReadyDeadlineMs
} from './WindowsAgentShellReadiness'
import {
  quarantineAutomaticWindowsPowerShellExecutable,
  resolveInboxWindowsPowerShellExecutable,
  resolveTerminalShellExecutable,
  type TerminalShellExecutableResolutionOptions
} from './TerminalShellExecutableResolver'

const nodeRequire = createRequire(import.meta.url)
const execFileAsync = promisify(execFile)
const FOREGROUND_JOB_TERMINATION_GRACE_MS = 5_000
const TERMINATION_GRACE_MS = 500
const TERMINATION_FORCE_MS = 1_500

export interface NodePtyTerminalProcessAdapterOptions {
  readonly environment?: NodeJS.ProcessEnv
  readonly resolveShellExecutable?: (
    options?: TerminalShellExecutableResolutionOptions
  ) => Promise<string>
  readonly runtimePlatform?: NodeJS.Platform
  readonly spawnPty?: typeof spawnPtyProcess
}

export class NodePtyTerminalProcessAdapter implements TerminalProcessPort {
  private readonly processes = new Map<string, ManagedTerminalProcess>()
  private readonly environment: NodeJS.ProcessEnv | undefined
  private readonly resolveShellExecutable: (
    options?: TerminalShellExecutableResolutionOptions
  ) => Promise<string>
  private readonly runtimePlatform: NodeJS.Platform
  private readonly spawnPty: typeof spawnPtyProcess

  constructor(options: NodePtyTerminalProcessAdapterOptions = {}) {
    this.environment = options.environment
    this.resolveShellExecutable = options.resolveShellExecutable ?? resolveTerminalShellExecutable
    this.runtimePlatform = options.runtimePlatform ?? platform()
    this.spawnPty = options.spawnPty ?? spawnPtyProcess
  }
  async start(command: StartTerminalProcessCommand): Promise<TerminalProcessHandle> {
    ensureNodePtySpawnHelperIsExecutable()
    const privateOutputControlLaunch = createTerminalPrivateOutputControlLaunch(
      command,
      this.runtimePlatform
    )
    const resolutionOptions: TerminalShellExecutableResolutionOptions = {
      explicitShell: command.shell,
      platform: this.runtimePlatform,
      ...(this.environment ? { environment: this.environment } : {})
    }
    const resolvedShell = await this.resolveShellExecutable(resolutionOptions)
    const {
      process: ptyProcess,
      shell,
      shouldWaitForWindowsAgentShell
    } = this.spawnTerminalProcess(command, resolvedShell, privateOutputControlLaunch)
    let resolveExit: () => void = () => undefined
    const exited = new Promise<void>((resolve) => {
      resolveExit = resolve
    })
    const windowsAgentShellReadiness = shouldWaitForWindowsAgentShell
      ? new WindowsAgentShellReadiness({ deadlineMs: windowsAgentShellReadyDeadlineMs })
      : null
    const managedProcess: ManagedTerminalProcess = {
      foregroundJob: null,
      foregroundJobInterruptPromise: null,
      hasObservedShellOutput: false,
      outputPaused: false,
      pendingForegroundProbe: null,
      privateOutputControl: privateOutputControlLaunch?.control ?? null,
      process: ptyProcess,
      shell,
      scope: command.scope,
      terminalSourceTheme: command.terminalSourceTheme ?? 'dark',
      exited,
      stopPromise: null,
      workingDirectory: command.workingDirectory
    }
    this.processes.set(command.scope.sessionId, managedProcess)
    ptyProcess.onData((data) => {
      windowsAgentShellReadiness?.acceptOutput(data)
      managedProcess.hasObservedShellOutput = true
      const pendingForegroundProbe = managedProcess.pendingForegroundProbe
      managedProcess.pendingForegroundProbe = null
      const visibleData = acceptTerminalPrivateOutputControl(
        managedProcess.privateOutputControl,
        data
      )
      const output = managedProcess.foregroundJob
        ? acceptForegroundJobOutput(managedProcess.foregroundJob, visibleData, {
            onStarted: (identity) => managedProcess.foregroundJob?.command.onStarted(identity),
            onExit: (event) => {
              const control = managedProcess.foregroundJob
              if (!control) return
              setImmediate(() => {
                if (managedProcess.foregroundJob !== control) return
                managedProcess.foregroundJob = null
                disposeForegroundJobShellControl(control)
                control.command.onExit(event)
              })
            }
          })
        : visibleData
      if (output) {
        command.onOutput({
          scope: command.scope,
          sessionId: command.scope.sessionId,
          data: output
        })
      }
      if (pendingForegroundProbe && managedProcess.foregroundJob) {
        managedProcess.process.write(pendingForegroundProbe)
      }
    })
    ptyProcess.onExit((event) => {
      windowsAgentShellReadiness?.acceptExit()
      const visiblePendingOutput = acceptForegroundJobFinalOutput(
        managedProcess.foregroundJob,
        flushTerminalPrivateOutputControl(managedProcess.privateOutputControl)
      )
      if (visiblePendingOutput) {
        command.onOutput({
          scope: command.scope,
          sessionId: command.scope.sessionId,
          data: visiblePendingOutput
        })
      }
      if (this.processes.get(command.scope.sessionId) === managedProcess) {
        this.processes.delete(command.scope.sessionId)
      }
      resolveExit()
      const foregroundJob = managedProcess.foregroundJob
      managedProcess.foregroundJob = null
      if (foregroundJob) disposeForegroundJobShellControl(foregroundJob)
      foregroundJob?.command.onExit({
        ...foregroundJob.command,
        exitCode: null
      })
      command.onExit({
        scope: command.scope,
        sessionId: command.scope.sessionId,
        exitCode: normalizeNodePtyExitCode(event.exitCode)
      })
    })

    if (windowsAgentShellReadiness) {
      try {
        await windowsAgentShellReadiness.waitForReady()
      } catch (error) {
        await stopManagedProcess(managedProcess, this.runtimePlatform).catch(() => undefined)
        throw error
      }
    }

    return {
      processId: ptyProcess.pid
    }
  }
  write(sessionId: string, input: string): void {
    const terminalProcess = this.requireProcess(sessionId)

    if (this.runtimePlatform === 'win32' && input === '\x03' && terminalProcess.foregroundJob) {
      interruptManagedWindowsForegroundJob(terminalProcess, terminalProcess.foregroundJob)
      return
    }
    terminalProcess.process.write(input)
  }

  launchForegroundJob(command: LaunchForegroundJobProcessCommand): void {
    const terminalProcess = this.requireProcess(command.sessionId)
    if (!supportsForegroundJobShell(this.runtimePlatform, terminalProcess.shell)) {
      throw createExpectedAppError(
        'TERMINAL_SHELL_UNSUPPORTED',
        'Agent foreground jobs on Windows require PowerShell or PowerShell Core.',
        { shell: terminalProcess.shell }
      )
    }
    if (terminalProcess.foregroundJob) {
      throw createExpectedAppError(
        'TERMINAL_PROVIDER_CONTROLLER_BUSY',
        'A foreground job is already active in this terminal process.'
      )
    }
    const control = createForegroundJobShellControl(
      {
        ...command,
        environment: createTerminalCapabilityEnvironment(
          command.environment,
          terminalProcess.terminalSourceTheme
        )
      },
      {
        platform: this.runtimePlatform,
        shellExecutable: terminalProcess.shell,
        terminalSourceTheme: terminalProcess.terminalSourceTheme
      }
    )
    terminalProcess.foregroundJob = control
    const probe = createForegroundJobProbe(control)
    if (this.runtimePlatform === 'win32' && !terminalProcess.hasObservedShellOutput) {
      terminalProcess.pendingForegroundProbe = probe
    } else {
      terminalProcess.process.write(probe)
    }
  }

  resize(sessionId: string, columns: number, rows: number): void {
    const terminalProcess = this.requireProcess(sessionId)

    terminalProcess.process.resize(columns, rows)
  }

  pauseOutput(sessionId: string): void {
    const terminalProcess = this.requireProcess(sessionId)
    terminalProcess.process.pause()
    terminalProcess.outputPaused = true
  }

  resumeOutput(sessionId: string): void {
    const terminalProcess = this.requireProcess(sessionId)
    terminalProcess.process.resume()
    terminalProcess.outputPaused = false
  }

  async readWorkingDirectory(sessionId: string): Promise<string | null> {
    const terminalProcess = this.processes.get(sessionId)

    if (!terminalProcess) {
      return null
    }

    if (this.runtimePlatform === 'win32') {
      return normalizeExistingDirectory(terminalProcess.workingDirectory)
    }

    return readProcessWorkingDirectory(terminalProcess.process.pid, this.runtimePlatform)
  }

  async stop(sessionId: string): Promise<void> {
    const managedProcess = this.processes.get(sessionId)

    if (!managedProcess) {
      return
    }

    managedProcess.stopPromise ??= stopManagedProcess(managedProcess, this.runtimePlatform)
    await managedProcess.stopPromise
  }

  async disposeAll(): Promise<void> {
    const results = await Promise.allSettled(
      [...this.processes.keys()].map((sessionId) => this.stop(sessionId))
    )
    const failures = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : []
    )

    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) {
      throw new AggregateError(failures, 'Multiple terminal processes failed to stop.')
    }
  }

  private requireProcess(sessionId: string): ManagedTerminalProcess {
    const ptyProcess = this.processes.get(sessionId)

    if (!ptyProcess) {
      throw createExpectedAppError('TERMINAL_PROCESS_NOT_FOUND', 'Terminal process was not found.')
    }

    return ptyProcess
  }

  private spawnTerminalProcess(
    command: StartTerminalProcessCommand,
    resolvedShell: string,
    privateOutputControlLaunch: TerminalPrivateOutputControlLaunch | null
  ): SpawnedTerminalProcess {
    const candidates = createTerminalShellSpawnCandidates({
      environment: this.environment ?? process.env,
      explicitShell: command.shell,
      platform: this.runtimePlatform,
      resolvedShell
    })
    const failures: unknown[] = []

    for (const [index, shell] of candidates.entries()) {
      const shouldWaitForWindowsAgentShell =
        this.runtimePlatform === 'win32' &&
        command.scope.owner?.kind === 'agent' &&
        !command.launchCommand &&
        supportsForegroundJobShell('win32', shell)
      const launch = shouldWaitForWindowsAgentShell
        ? createTerminalProcessLaunch(
            shell,
            windowsAgentShellReadyCommand,
            'interactive',
            this.runtimePlatform
          )
        : createTerminalProcessLaunch(
            shell,
            command.launchCommand,
            command.launchMode,
            this.runtimePlatform
          )
      const processEnvironment = createTerminalProcessEnvironment({
        explicit: command.environment,
        inherited: process.env,
        platform: this.runtimePlatform,
        terminalSourceTheme: command.terminalSourceTheme
      })
      applyTerminalPrivateOutputControlEnvironment(
        processEnvironment,
        privateOutputControlLaunch,
        this.runtimePlatform
      )
      const spawnOptions = {
        name: terminalEmulationName,
        cols: command.columns,
        rows: command.rows,
        cwd: command.workingDirectory,
        // The bundled ConPTY preserves VT queries and mouse modes on supported Windows 10 builds.
        ...(this.runtimePlatform === 'win32' ? { useConpty: true, useConptyDll: true } : {}),
        env: processEnvironment
      }
      let ptyProcess: IPty

      try {
        ptyProcess = this.spawnPty(launch.executable, [...launch.arguments], spawnOptions)
      } catch (error) {
        failures.push(error)
        const hasFallback = index + 1 < candidates.length
        if (!hasFallback || !isAutomaticPowerShellSpawnFailure(error)) {
          if (failures.length === 1) throw error
          throw createTerminalShellSpawnAggregateError(candidates, failures)
        }
        continue
      }

      if (index > 0) {
        quarantineAutomaticWindowsPowerShellExecutable(candidates[0] ?? '')
      }
      return {
        process: ptyProcess,
        shell,
        shouldWaitForWindowsAgentShell
      }
    }

    throw new Error('Terminal process spawn candidates were unexpectedly empty.')
  }
}

interface SpawnedTerminalProcess {
  readonly process: IPty
  readonly shell: string
  readonly shouldWaitForWindowsAgentShell: boolean
}

interface TerminalShellSpawnCandidatesOptions {
  readonly environment: NodeJS.ProcessEnv
  readonly explicitShell?: string
  readonly platform: NodeJS.Platform
  readonly resolvedShell: string
}

function createTerminalShellSpawnCandidates(
  options: TerminalShellSpawnCandidatesOptions
): readonly string[] {
  if (
    options.platform !== 'win32' ||
    options.explicitShell ||
    pathWin32.basename(options.resolvedShell).toLowerCase() !== 'pwsh.exe'
  ) {
    return [options.resolvedShell]
  }

  const inboxPowerShell = resolveInboxWindowsPowerShellExecutable(options.environment)
  return options.resolvedShell.toLowerCase() === inboxPowerShell.toLowerCase()
    ? [options.resolvedShell]
    : [options.resolvedShell, inboxPowerShell]
}

function isAutomaticPowerShellSpawnFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  return (
    error.message.startsWith('File not found:') ||
    /^Cannot create process, error code: \d+$/u.test(error.message)
  )
}

function createTerminalShellSpawnAggregateError(
  candidates: readonly string[],
  failures: readonly unknown[]
): AggregateError {
  const attempts = candidates
    .slice(0, failures.length)
    .map((candidate, index) => `${candidate}: ${getErrorMessage(failures[index])}`)
    .join('; ')
  return new AggregateError(
    failures,
    `Unable to start an automatic PowerShell terminal. ${attempts}`
  )
}

interface ManagedTerminalProcess {
  foregroundJob: ForegroundJobShellControl | null
  foregroundJobInterruptPromise: Promise<void> | null
  hasObservedShellOutput: boolean
  outputPaused: boolean
  pendingForegroundProbe: string | null
  readonly privateOutputControl: TerminalPrivateOutputControl | null
  readonly process: IPty
  readonly shell: string
  readonly scope: StartTerminalProcessCommand['scope']
  readonly terminalSourceTheme: TerminalSourceTheme
  readonly exited: Promise<void>
  stopPromise: Promise<void> | null
  readonly workingDirectory: string
}

function interruptManagedWindowsForegroundJob(
  managedProcess: ManagedTerminalProcess,
  control: ForegroundJobShellControl
): void {
  managedProcess.foregroundJobInterruptPromise ??= interruptWindowsForegroundJob(
    managedProcess.process.pid,
    control.scriptPath
  )
    .catch(async () => {
      managedProcess.process.write('\x03')
      await delay(500)
    })
    .then(() => {
      if (managedProcess.foregroundJob !== control) return
      managedProcess.foregroundJob = null
      disposeForegroundJobShellControl(control)
      control.command.onExit({ ...control.command, exitCode: 130 })
    })
    .finally(() => {
      managedProcess.foregroundJobInterruptPromise = null
    })
}

async function stopManagedProcess(
  managedProcess: ManagedTerminalProcess,
  runtimePlatform: NodeJS.Platform
): Promise<void> {
  if (managedProcess.outputPaused) {
    managedProcess.process.resume()
    managedProcess.outputPaused = false
  }
  if (runtimePlatform === 'win32') {
    managedProcess.process.kill()
    await waitForPromise(managedProcess.exited, TERMINATION_FORCE_MS)
    return
  }
  const processGroupSnapshot = await readPosixProcessGroupSnapshot(managedProcess.process.pid)
  const terminalProcessGroupId = processGroupSnapshot?.processGroupId ?? null
  const foregroundProcessGroupId = managedProcess.foregroundJob
    ? (processGroupSnapshot?.foregroundProcessGroupId ?? terminalProcessGroupId)
    : null
  const failures: unknown[] = []
  if (foregroundProcessGroupId) {
    try {
      await terminatePosixProcessGroup(
        foregroundProcessGroupId,
        FOREGROUND_JOB_TERMINATION_GRACE_MS,
        TERMINATION_FORCE_MS
      )
    } catch (error) {
      failures.push(error)
    }
  }
  try {
    if (terminalProcessGroupId && terminalProcessGroupId !== foregroundProcessGroupId) {
      await terminatePosixProcessGroup(
        terminalProcessGroupId,
        TERMINATION_GRACE_MS,
        TERMINATION_FORCE_MS
      )
    } else if (!terminalProcessGroupId) {
      managedProcess.process.kill('SIGTERM')
    }
    await waitForPromise(managedProcess.exited, TERMINATION_FORCE_MS)
  } catch (error) {
    failures.push(error)
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) throw new AggregateError(failures, 'Unable to stop terminal process.')
}

async function waitForPromise(
  promise: Promise<void>,
  timeoutMs: number,
  timeoutMessage = 'Terminal process did not report its exit.'
): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
      })
    ])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs))
}

async function readProcessWorkingDirectory(
  processId: number,
  runtimePlatform: NodeJS.Platform
): Promise<string | null> {
  if (runtimePlatform === 'darwin') {
    return readDarwinProcessWorkingDirectory(processId)
  }

  if (runtimePlatform === 'linux') {
    return normalizeExistingDirectory(await readLinuxProcessWorkingDirectory(processId))
  }

  return null
}

async function readDarwinProcessWorkingDirectory(processId: number): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'lsof',
      ['-a', '-p', String(processId), '-d', 'cwd', '-Fn'],
      { timeout: 1000 }
    )
    const directory = stdout
      .split('\n')
      .find((line) => line.startsWith('n'))
      ?.slice(1)

    return normalizeExistingDirectory(directory ?? null)
  } catch {
    return null
  }
}

async function readLinuxProcessWorkingDirectory(processId: number): Promise<string | null> {
  try {
    return await readlink(`/proc/${processId}/cwd`)
  } catch {
    return null
  }
}

async function normalizeExistingDirectory(directory: string | null): Promise<string | null> {
  if (!directory) {
    return null
  }

  try {
    return await realpath(directory)
  } catch {
    return directory
  }
}

function ensureNodePtySpawnHelperIsExecutable(): void {
  const helperPath = resolveNodePtySpawnHelperPath()

  if (!helperPath || !existsSync(helperPath)) {
    return
  }

  try {
    accessSync(helperPath, constants.X_OK)
    return
  } catch {
    // pnpm can preserve node-pty's macOS helper without the executable bit.
  }

  try {
    chmodSync(helperPath, 0o755)
    accessSync(helperPath, constants.X_OK)
  } catch (error) {
    throw new Error(
      `Unable to prepare node-pty spawn helper at ${helperPath}: ${getErrorMessage(error)}`
    )
  }
}

function resolveNodePtySpawnHelperPath(): string | null {
  try {
    const nodePtyEntryPath = nodeRequire.resolve('node-pty')
    const nodePtyPackageDirectory = dirname(dirname(nodePtyEntryPath))

    return join(
      nodePtyPackageDirectory,
      'prebuilds',
      `${process.platform}-${process.arch}`,
      'spawn-helper'
    )
      .replace('app.asar', 'app.asar.unpacked')
      .replace('node_modules.asar', 'node_modules.asar.unpacked')
  } catch {
    return null
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function normalizeNodePtyExitCode(exitCode: unknown): number | null {
  return typeof exitCode === 'number' && Number.isSafeInteger(exitCode) ? exitCode : null
}
