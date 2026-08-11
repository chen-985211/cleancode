import type { TerminalRunScope } from '../../domain/value-objects/TerminalRunScope'

/** Optional cross-context observation; failures must never alter terminal lifecycle. */
export interface TerminalSessionLifecycleObserverPort {
  terminalEnded(scope: TerminalRunScope): void
}
