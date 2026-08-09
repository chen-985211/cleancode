import type { TerminalModelDiagnosticsSnapshot } from '../../application/dto/TerminalModelSnapshot'
import type { ForegroundJobProcessIdentity } from '../../application/ports/TerminalProcessPort'

export function matchesForegroundJob(
  expected: ForegroundJobProcessIdentity,
  actual: ForegroundJobProcessIdentity
): boolean {
  return (
    expected.sessionId === actual.sessionId &&
    expected.launchId === actual.launchId &&
    expected.generation === actual.generation
  )
}

export function isApplicationDetachReceipt(
  value: unknown
): value is { readonly releaseId: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'releaseId' in value &&
    typeof value.releaseId === 'string' &&
    value.releaseId.length > 0
  )
}

export function createProviderDiagnostics(
  modelCount: number,
  attachedViewCount: number
): TerminalModelDiagnosticsSnapshot {
  return { attachedViewCount, lastRestoreDurationMs: 0, modelCount, pendingOutputBytes: 0 }
}
