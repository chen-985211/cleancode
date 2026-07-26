import { execFile } from 'node:child_process'
import { accessSync, chmodSync, constants, existsSync } from 'node:fs'
import { readlink, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { platform } from 'node:os'
import { dirname, join } from 'node:path'
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
  acceptForegroundJobOutput,
  createForegroundJobProbe,
  createForegroundJobShellControl,
  disposeForegroundJobShellControl,
  supportsForegroundJobShell,
  type ForegroundJobShellControl
} from './ForegroundJobShellControl'
import { createTerminalProcessEnvironment } from './TerminalProcessEnvironment'
import { interruptWindowsForegroundJob } from './WindowsForegroundJobInterrupt'

const nodeRequire = createRequire(import.meta.url)
const execFileAsync = promisify(execFile)
const TERMINATION_GRACE_MS = 500
const TERMINATION_FORCE_MS = 1_500
const WINDOWS_AGENT_SHELL_READY_TIMEOUT_MS = 5_000
const WINDOWS_AGENT_SHELL_READY_MARKER = '\x1b]633;CLEANCODE_SHELL_READY\x07'
const WINDOWS_AGENT_SHELL_READY_COMMAND = [
  'function global:prompt {',
  "[Console]::Write(([char]27) + ']633;CLEANCODE_SHELL_READY' + ([char]7));",
  "return 'PS ' + $executionContext.SessionState.Path.CurrentLocation + '> '",
  '}'
].join(' ')

export class NodePtyTerminalProcessAdapter implements TerminalProcessPort {
  private readonly processes = new Map<string, ManagedTerminalProcess>()

  async start(command: StartTerminalProcessCommand): Promise<TerminalProcessHandle> {
    ensureNodePtySpawnHelperIsExecutable()

    const shell = command.shell || getDefaultShell()
    const shouldWaitForWindowsAgentShell =
      platform() === 'win32' &&
      command.scope.owner?.kind === 'agent' &&
      !command.launchCommand &&
      supportsForegroundJobShell('win32', shell)
    const launch = shouldWaitForWindowsAgentShell
      ? createTerminalProcessLaunch(shell, WINDOWS_AGENT_SHELL_READY_COMMAND, 'interactive')
      : createTerminalProcessLaunch(shell, command.launchCommand, command.launchMode)
    const ptyProcess = spawnPtyProcess(launch.executable, [...launch.arguments], {
      name: terminalEmulationName,
      cols: command.columns,
      rows: command.rows,
      cwd: command.workingDirectory,
      env: createTerminalProcessEnvironment({
        explicit: command.environment,
        inherited: process.env,
        platform: platform(),
        terminalSourceTheme: command.terminalSourceTheme
      })
    })

    let resolveExit: () => void = () => undefined
    const exited = new Promise<void>((resolve) => {
      resolveExit = resolve
    })
    let resolveWindowsAgentShellReady: () => void = () => undefined
    let rejectWindowsAgentShellReady: (error: Error) => void = () => undefined
    const windowsAgentShellReady = shouldWaitForWindowsAgentShell
      ? new Promise<void>((resolve, reject) => {
          resolveWindowsAgentShellReady = resolve
          rejectWindowsAgentShellReady = reject
        })
      : null
    let windowsAgentShellStartupOutput = ''
    let hasWindowsAgentShellBecomeReady = !shouldWaitForWindowsAgentShell
    const managedProcess: ManagedTerminalProcess = {
      foregroundJob: null,
      foregroundJobInterruptPromise: null,
      hasObservedShellOutput: false,
      pendingForegroundProbe: null,
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
      if (windowsAgentShellReady && !hasWindowsAgentShellBecomeReady) {
        const startupOutput = windowsAgentShellStartupOutput + data
        if (startupOutput.includes(WINDOWS_AGENT_SHELL_READY_MARKER)) {
          hasWindowsAgentShellBecomeReady = true
          resolveWindowsAgentShellReady()
        }
        windowsAgentShellStartupOutput = startupOutput.slice(
          -(WINDOWS_AGENT_SHELL_READY_MARKER.length - 1)
        )
      }
      managedProcess.hasObservedShellOutput = true
      const pendingForegroundProbe = managedProcess.pendingForegroundProbe
      managedProcess.pendingForegroundProbe = null
      const output = managedProcess.foregroundJob
        ? acceptForegroundJobOutput(managedProcess.foregroundJob, data, {
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
        : data
      if (output) {
        command.onOutput({ scope: command.scope, sessionId: command.scope.sessionId, data: output })
      }
      if (pendingForegroundProbe && managedProcess.foregroundJob) {
        managedProcess.process.write(pendingForegroundProbe)
      }
    })
    ptyProcess.onExit((event) => {
      if (!hasWindowsAgentShellBecomeReady) {
        rejectWindowsAgentShellReady(
          new Error('Windows Agent shell exited before its interactive prompt became ready.')
        )
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
        exitCode: event.exitCode
      })
    })

    if (windowsAgentShellReady) {
      try {
        await waitForPromise(
          windowsAgentShellReady,
          WINDOWS_AGENT_SHELL_READY_TIMEOUT_MS,
          'Windows Agent shell did not become ready for interactive input.'
        )
      } catch (error) {
        await stopManagedProcess(managedProcess).catch(() => undefined)
        throw error
      }
    }

    return {
      processId: ptyProcess.pid
    }
  }

  write(sessionId: string, input: string): void {
    const terminalProcess = this.requireProcess(sessionId)

    if (platform() === 'win32' && input === '\x03' && terminalProcess.foregroundJob) {
      interruptManagedWindowsForegroundJob(terminalProcess, terminalProcess.foregroundJob)
      return
    }
    terminalProcess.process.write(input)
  }

  launchForegroundJob(command: LaunchForegroundJobProcessCommand): void {
    const terminalProcess = this.requireProcess(command.sessionId)
    if (!supportsForegroundJobShell(platform(), terminalProcess.shell)) {
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
        platform: platform(),
        shellExecutable: terminalProcess.shell
      }
    )
    terminalProcess.foregroundJob = control
    const probe = createForegroundJobProbe(control)
    if (platform() === 'win32' && !terminalProcess.hasObservedShellOutput) {
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
    this.requireProcess(sessionId).process.pause()
  }

  resumeOutput(sessionId: string): void {
    this.requireProcess(sessionId).process.resume()
  }

  async readWorkingDirectory(sessionId: string): Promise<string | null> {
    const terminalProcess = this.processes.get(sessionId)

    if (!terminalProcess) {
      return null
    }

    if (platform() === 'win32') {
      return normalizeExistingDirectory(terminalProcess.workingDirectory)
    }

    return readProcessWorkingDirectory(terminalProcess.process.pid)
  }

  async stop(sessionId: string): Promise<void> {
    const managedProcess = this.processes.get(sessionId)

    if (!managedProcess) {
      return
    }

    managedProcess.stopPromise ??= stopManagedProcess(managedProcess)
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
}

interface ManagedTerminalProcess {
  foregroundJob: ForegroundJobShellControl | null
  foregroundJobInterruptPromise: Promise<void> | null
  hasObservedShellOutput: boolean
  pendingForegroundProbe: string | null
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

function getDefaultShell(): string {
  return platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/sh'
}

async function stopManagedProcess(managedProcess: ManagedTerminalProcess): Promise<void> {
  if (platform() === 'win32') {
    managedProcess.process.kill()
    await waitForPromise(managedProcess.exited, TERMINATION_FORCE_MS)
    return
  }

  const processGroupId = await readProcessGroupId(managedProcess.process.pid)

  if (!processGroupId) {
    managedProcess.process.kill('SIGTERM')
    await waitForPromise(managedProcess.exited, TERMINATION_FORCE_MS)
    return
  }

  signalProcessGroup(processGroupId, 'SIGTERM')
  if (await waitForProcessGroupExit(processGroupId, TERMINATION_GRACE_MS)) {
    await waitForPromise(managedProcess.exited, TERMINATION_FORCE_MS)
    return
  }

  signalProcessGroup(processGroupId, 'SIGKILL')
  const groupExited = await waitForProcessGroupExit(processGroupId, TERMINATION_FORCE_MS)

  if (!groupExited) {
    throw new Error(`Terminal process group ${processGroupId} did not exit.`)
  }

  await waitForPromise(managedProcess.exited, TERMINATION_FORCE_MS)
}

async function readProcessGroupId(processId: number): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync('/bin/ps', ['-o', 'pgid=', '-p', String(processId)], {
      timeout: 1_000
    })
    const processGroupId = Number.parseInt(stdout.trim(), 10)
    return Number.isSafeInteger(processGroupId) && processGroupId > 1 ? processGroupId : null
  } catch {
    return null
  }
}

function signalProcessGroup(processGroupId: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-processGroupId, signal)
  } catch (error) {
    if (!isNoSuchProcessError(error)) {
      throw error
    }
  }
}

async function waitForProcessGroupExit(
  processGroupId: number,
  timeoutMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs

  while (isProcessGroupAlive(processGroupId)) {
    if (Date.now() >= deadline) {
      return false
    }
    await delay(25)
  }

  return true
}

function isProcessGroupAlive(processGroupId: number): boolean {
  try {
    process.kill(-processGroupId, 0)
    return true
  } catch (error) {
    return !isNoSuchProcessError(error)
  }
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

function isNoSuchProcessError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'ESRCH'
  )
}

async function readProcessWorkingDirectory(processId: number): Promise<string | null> {
  if (platform() === 'darwin') {
    return readDarwinProcessWorkingDirectory(processId)
  }

  if (platform() === 'linux') {
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
