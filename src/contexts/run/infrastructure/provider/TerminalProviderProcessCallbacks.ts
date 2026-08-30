import type {
  TerminalExitEvent,
  TerminalProcessOutputEvent
} from '../../application/ports/TerminalProcessPort'

interface TerminalProcessCallbacks {
  readonly onOutput: (event: TerminalProcessOutputEvent) => void
  readonly onExit: (event: TerminalExitEvent) => void
}

export class TerminalProviderProcessCallbacks {
  private readonly callbacks = new Map<string, TerminalProcessCallbacks>()

  bind(sessionId: string, callbacks: TerminalProcessCallbacks): void {
    this.callbacks.set(sessionId, callbacks)
  }

  acceptOutput(event: TerminalProcessOutputEvent): void {
    this.callbacks.get(event.sessionId)?.onOutput(event)
  }

  acceptExit(event: TerminalExitEvent): void {
    this.callbacks.get(event.sessionId)?.onExit(event)
  }

  forget(sessionId: string): void {
    this.callbacks.delete(sessionId)
  }

  clear(): void {
    this.callbacks.clear()
  }
}
