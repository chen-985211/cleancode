import type { IDisposable, IPty, IWindowsPtyForkOptions } from 'node-pty'

import { terminalEmulationName } from '../../application/services/TerminalCapabilityEnvironment'

export const windowsConptyWarmupTimeoutMs = 10_000

const powerShellWarmupArguments = ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', 'exit']

type WindowsConptyWarmupPhase = 'idle' | 'scheduled' | 'running' | 'finished'

export interface WindowsConptyWarmupProcess {
  readonly kill: IPty['kill']
  readonly onExit: IPty['onExit']
}

export type WindowsConptyWarmupSpawn = (
  executable: string,
  args: string[],
  options: IWindowsPtyForkOptions
) => WindowsConptyWarmupProcess

type WindowsConptyWarmupExecutableResolver = () => Promise<string>

export type WindowsConptyWarmupFailurePhase = 'resolve' | 'spawn' | 'cleanup'

export interface WindowsConptyWarmupOptions {
  readonly environment?: Readonly<Record<string, string>>
  readonly onFailure?: (phase: WindowsConptyWarmupFailurePhase, error: unknown) => void
  readonly resolvePowerShellExecutable: WindowsConptyWarmupExecutableResolver
  readonly runtimePlatform: NodeJS.Platform
  readonly spawnPty: WindowsConptyWarmupSpawn
  readonly timeoutMs?: number
  readonly workingDirectory?: string
}

export class WindowsConptyWarmup {
  private deadlineTimer: ReturnType<typeof setTimeout> | undefined
  private exitListener: IDisposable | undefined
  private killIssued = false
  private phase: WindowsConptyWarmupPhase = 'idle'
  private process: WindowsConptyWarmupProcess | undefined
  private scheduledStart: ReturnType<typeof setImmediate> | undefined
  private readonly timeoutMs: number

  constructor(private readonly options: WindowsConptyWarmupOptions) {
    this.timeoutMs = Math.max(1, options.timeoutMs ?? windowsConptyWarmupTimeoutMs)
  }

  schedule(): void {
    if (this.phase !== 'idle') return
    if (this.options.runtimePlatform !== 'win32') {
      this.phase = 'finished'
      return
    }

    this.phase = 'scheduled'
    this.scheduledStart = setImmediate(() => {
      this.scheduledStart = undefined
      this.start()
    })
    this.scheduledStart.unref()
  }

  start(): void {
    if (this.phase !== 'idle' && this.phase !== 'scheduled') return
    this.clearScheduledStart()
    if (this.options.runtimePlatform !== 'win32') {
      this.phase = 'finished'
      return
    }

    this.phase = 'running'
    void this.startProcess()
  }

  dispose(): void {
    this.finish(true)
  }

  private async startProcess(): Promise<void> {
    let powerShellExecutable: string
    try {
      powerShellExecutable = await this.options.resolvePowerShellExecutable()
    } catch (error) {
      this.reportFailure('resolve', error)
      this.finish(false)
      return
    }
    if (!this.isRunning()) return

    try {
      const process = this.options.spawnPty(powerShellExecutable, [...powerShellWarmupArguments], {
        cols: 2,
        ...(this.options.workingDirectory ? { cwd: this.options.workingDirectory } : {}),
        ...(this.options.environment ? { env: { ...this.options.environment } } : {}),
        name: terminalEmulationName,
        rows: 1,
        useConpty: true,
        useConptyDll: true
      })
      this.process = process

      const exitListener = process.onExit(() => this.finish(false))
      if (this.hasFinished()) {
        exitListener.dispose()
        return
      }
      this.exitListener = exitListener

      this.deadlineTimer = setTimeout(() => this.finish(true), this.timeoutMs)
      this.deadlineTimer.unref()
    } catch (error) {
      this.reportFailure('spawn', error)
      this.finish(true)
    }
  }

  private hasFinished(): boolean {
    return this.phase === 'finished'
  }

  private isRunning(): boolean {
    return this.phase === 'running'
  }

  private finish(shouldKill: boolean): void {
    if (this.phase === 'finished') return
    this.phase = 'finished'
    this.clearScheduledStart()
    this.clearDeadline()

    try {
      this.exitListener?.dispose()
    } catch (error) {
      this.reportFailure('cleanup', error)
    }
    this.exitListener = undefined
    const process = this.process
    this.process = undefined

    if (!shouldKill || !process || this.killIssued) return
    this.killIssued = true
    try {
      process.kill()
    } catch (error) {
      this.reportFailure('cleanup', error)
    }
  }

  private reportFailure(phase: WindowsConptyWarmupFailurePhase, error: unknown): void {
    try {
      this.options.onFailure?.(phase, error)
    } catch {
      // Warmup is best-effort and must never make the terminal runtime unavailable.
    }
  }

  private clearScheduledStart(): void {
    if (!this.scheduledStart) return

    clearImmediate(this.scheduledStart)
    this.scheduledStart = undefined
  }

  private clearDeadline(): void {
    if (!this.deadlineTimer) return

    clearTimeout(this.deadlineTimer)
    this.deadlineTimer = undefined
  }
}
