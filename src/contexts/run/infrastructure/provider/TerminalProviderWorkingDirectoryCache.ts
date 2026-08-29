import type { TerminalWorkingDirectoryChangedEvent } from '../../application/ports/TerminalProcessPort'
import {
  isSameTerminalRun,
  type TerminalRunScope
} from '../../domain/value-objects/TerminalRunScope'

export class TerminalProviderWorkingDirectoryCache {
  private readonly directories = new Map<string, string>()
  private readonly revisions = new Map<string, number>()

  remember(sessionId: string, workingDirectory: string): void {
    this.directories.set(sessionId, workingDirectory)
    this.revisions.set(sessionId, 0)
  }

  resetRevision(sessionId: string): void {
    this.revisions.set(sessionId, 0)
  }

  read(identity: TerminalRunScope): string {
    return this.directories.get(identity.sessionId) ?? identity.workspaceDirectory
  }

  update(sessionId: string, workingDirectory: string): void {
    this.directories.set(sessionId, workingDirectory)
  }

  captureRevision(sessionId: string): number {
    return this.revisions.get(sessionId) ?? 0
  }

  async observe(sessionId: string, read: () => Promise<string | null>): Promise<string | null> {
    const revision = this.captureRevision(sessionId)
    return this.acceptObservation(sessionId, revision, await read())
  }

  acceptObservation(
    sessionId: string,
    revisionBeforeRequest: number,
    workingDirectory: string | null
  ): string | null {
    if ((this.revisions.get(sessionId) ?? 0) !== revisionBeforeRequest) {
      return this.directories.get(sessionId) ?? null
    }
    if (workingDirectory) this.directories.set(sessionId, workingDirectory)
    return workingDirectory
  }

  acceptEvent(
    identity: TerminalRunScope | undefined,
    event: TerminalWorkingDirectoryChangedEvent
  ): boolean {
    if (!identity || !isSameTerminalRun(identity, event.scope)) return false
    if (event.revision <= (this.revisions.get(event.sessionId) ?? 0)) return false
    this.revisions.set(event.sessionId, event.revision)
    this.directories.set(event.sessionId, event.workingDirectory)
    return true
  }

  forget(sessionId: string): void {
    this.directories.delete(sessionId)
    this.revisions.delete(sessionId)
  }

  clear(): void {
    this.directories.clear()
    this.revisions.clear()
  }
}
