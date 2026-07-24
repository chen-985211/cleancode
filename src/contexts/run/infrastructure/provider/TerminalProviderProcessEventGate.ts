import type { TerminalProviderEvent } from './TerminalProviderProtocol'

export class TerminalProviderProcessEventGate {
  private readonly pendingStarts = new Set<string>()
  private readonly deferredEvents = new Map<string, TerminalProviderEvent[]>()

  begin(sessionId: string): void {
    this.pendingStarts.add(sessionId)
  }

  defer(event: TerminalProviderEvent): boolean {
    if (event.event !== 'terminal-output' && event.event !== 'terminal-exit') return false
    const sessionId = (event.payload as { readonly sessionId?: unknown }).sessionId
    if (typeof sessionId !== 'string' || !this.pendingStarts.has(sessionId)) return false

    const events = this.deferredEvents.get(sessionId) ?? []
    events.push(event)
    this.deferredEvents.set(sessionId, events)
    return true
  }

  release(sessionId: string): readonly TerminalProviderEvent[] {
    this.pendingStarts.delete(sessionId)
    const events = this.deferredEvents.get(sessionId) ?? []
    this.deferredEvents.delete(sessionId)
    return events
  }

  forget(sessionId: string): void {
    this.pendingStarts.delete(sessionId)
    this.deferredEvents.delete(sessionId)
  }

  isPending(sessionId: string): boolean {
    return this.pendingStarts.has(sessionId)
  }

  clear(): void {
    this.pendingStarts.clear()
    this.deferredEvents.clear()
  }
}
