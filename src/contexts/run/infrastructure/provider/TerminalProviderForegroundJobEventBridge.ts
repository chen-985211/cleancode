import type {
  ForegroundJobProcessIdentity,
  LaunchForegroundJobProcessCommand
} from '../../application/ports/TerminalProcessPort'
import { matchesForegroundJob } from './PersistentTerminalProviderClientSupport'

export class TerminalProviderForegroundJobEventBridge {
  private readonly callbacks = new Map<string, LaunchForegroundJobProcessCommand>()

  bind(command: LaunchForegroundJobProcessCommand): void {
    this.callbacks.set(command.sessionId, command)
  }

  failLaunch(command: LaunchForegroundJobProcessCommand): boolean {
    if (this.callbacks.get(command.sessionId) !== command) return false
    this.callbacks.delete(command.sessionId)
    command.onExit({
      generation: command.generation,
      launchId: command.launchId,
      sessionId: command.sessionId,
      exitCode: null
    })
    return true
  }

  acceptStarted(started: ForegroundJobProcessIdentity): void {
    const callbacks = this.callbacks.get(started.sessionId)
    if (callbacks && matchesForegroundJob(callbacks, started)) callbacks.onStarted(started)
  }

  acceptExited(exit: ForegroundJobProcessIdentity & { readonly exitCode: number | null }): void {
    const callbacks = this.callbacks.get(exit.sessionId)
    if (!callbacks || !matchesForegroundJob(callbacks, exit)) return
    this.callbacks.delete(exit.sessionId)
    callbacks.onExit(exit)
  }

  forget(sessionId: string): void {
    this.callbacks.delete(sessionId)
  }

  clear(): void {
    this.callbacks.clear()
  }
}
