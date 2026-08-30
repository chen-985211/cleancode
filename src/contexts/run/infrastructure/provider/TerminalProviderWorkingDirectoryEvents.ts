import type { TerminalWorkingDirectoryChangedEvent } from '../../application/ports/TerminalProcessPort'
import type { TerminalRunScope } from '../../domain/value-objects/TerminalRunScope'

export class TerminalProviderWorkingDirectoryEvents {
  private readonly observations = new Map<
    string,
    { readonly revision: number; readonly workingDirectory: string }
  >()

  accept(
    scope: TerminalRunScope,
    workingDirectory: string
  ): TerminalWorkingDirectoryChangedEvent | null {
    const current = this.observations.get(scope.sessionId)
    if (current?.workingDirectory === workingDirectory) return null

    const revision = (current?.revision ?? 0) + 1
    this.observations.set(scope.sessionId, { revision, workingDirectory })
    return { revision, scope, sessionId: scope.sessionId, workingDirectory }
  }

  forget(sessionId: string): void {
    this.observations.delete(sessionId)
  }

  clear(): void {
    this.observations.clear()
  }
}
