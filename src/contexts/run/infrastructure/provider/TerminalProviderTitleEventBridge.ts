import { TerminalTitleSequenceParser } from '../terminal-model/TerminalTitleSequenceParser'

export class TerminalProviderTitleEventBridge {
  private readonly callbacks = new Map<string, (title: string) => void>()
  private readonly lastTitles = new Map<string, string>()
  private readonly parsers = new Map<string, TerminalTitleSequenceParser>()

  bind(sessionId: string, callback: ((title: string) => void) | undefined): void {
    this.forget(sessionId)
    if (!callback) return
    this.callbacks.set(sessionId, callback)
    this.parsers.set(sessionId, new TerminalTitleSequenceParser())
  }

  acceptOutput(sessionId: string, data: string): void {
    for (const title of this.parsers.get(sessionId)?.accept(data) ?? []) {
      this.acceptTitle(sessionId, title)
    }
  }

  acceptTitle(sessionId: string, title: string): void {
    if (this.lastTitles.get(sessionId) === title) return
    const callback = this.callbacks.get(sessionId)
    if (!callback) return
    this.lastTitles.set(sessionId, title)
    callback(title)
  }

  forget(sessionId: string): void {
    this.callbacks.delete(sessionId)
    this.lastTitles.delete(sessionId)
    this.parsers.delete(sessionId)
  }

  clear(): void {
    this.callbacks.clear()
    this.lastTitles.clear()
    this.parsers.clear()
  }
}
