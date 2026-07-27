import type { TerminalRunOwner } from '../../domain/value-objects/TerminalRunScope'
import {
  createExpectedAppError,
  isAppError
} from '../../../../shared-kernel/application/errors/AppError'
import type { TerminalModelPort } from '../ports/TerminalModelPort'
import type { TerminalModelDiagnosticsSnapshot } from '../dto/TerminalModelSnapshot'
import type { TerminalLinkIdentity } from '../dto/TerminalLink'
import type { TerminalSession } from '../../domain/aggregates/TerminalSession'
import { resolveTerminalOwnerRef } from '../../domain/value-objects/TerminalRunScope'
import type { TerminalSessionSnapshot } from '../dto/TerminalSessionSnapshot'

export interface TerminalSessionTerminationOperation {
  readonly promise: Promise<TerminalSessionSnapshot>
  readonly preserveHistory: boolean
}

export function enqueueTerminalSlotOperation<T>(
  tails: Map<string, Promise<void>>,
  slotKey: string,
  operation: () => Promise<T>
): Promise<T> {
  const previous = tails.get(slotKey) ?? Promise.resolve()
  const result = previous.catch(() => undefined).then(operation)
  const tail = result.then(
    () => undefined,
    () => undefined
  )
  tails.set(slotKey, tail)
  void tail.finally(() => {
    if (tails.get(slotKey) === tail) tails.delete(slotKey)
  })
  return result
}

export function getTerminalSessionErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function throwTerminalSessionCleanupFailures(
  results: readonly PromiseSettledResult<void>[]
): void {
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : []
  )
  if (failures.length === 0) return
  if (failures.length === 1) throw failures[0]
  throw new AggregateError(failures, 'Multiple terminal session resources failed to dispose.')
}

export async function settleTerminalViewRelease(operation: () => Promise<void>): Promise<void> {
  try {
    await operation()
  } catch (error) {
    if (
      isAppError(error) &&
      (error.code === 'RUN_SCOPE_STALE' || error.code === 'TERMINAL_SESSION_NOT_FOUND')
    ) {
      return
    }
    throw error
  }
}

export function requireTerminalModelPort(port: TerminalModelPort | undefined): TerminalModelPort {
  if (!port) {
    throw createExpectedAppError('TERMINAL_MODEL_NOT_FOUND', 'Terminal model was not found.')
  }
  return port
}

export function readTerminalModelDiagnostics(
  port: TerminalModelPort | undefined
): TerminalModelDiagnosticsSnapshot {
  return (
    port?.getDiagnostics() ?? {
      modelCount: 0,
      attachedViewCount: 0,
      pendingOutputBytes: 0,
      lastRestoreDurationMs: 0
    }
  )
}

export function createTerminalSessionOwner(command: {
  readonly projectId: string
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly workspaceDirectory: string
  readonly gitBranch: string | null
  readonly terminalBlockId: string
  readonly owner?: TerminalRunOwner['owner']
}): TerminalRunOwner {
  return {
    projectId: command.projectId,
    projectDirectory: command.projectDirectory,
    workspaceId: command.workspaceId,
    workspaceDirectory: command.workspaceDirectory,
    gitBranch: command.gitBranch,
    blockId: command.terminalBlockId,
    owner: command.owner ?? { id: command.terminalBlockId, kind: 'block' }
  }
}

export function createTerminalSessionId(prefix: string): string {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random()}`
}

export function assertCurrentTerminalViewIdentity(
  command: TerminalLinkIdentity,
  session: TerminalSession,
  state: {
    readonly currentSessionId: string | undefined
    readonly latestGeneration: number | undefined
    readonly restorableSessionId: string | undefined
  }
): void {
  const commandOwner = command.owner ?? { id: command.blockId, kind: 'block' as const }
  const sessionOwner = resolveTerminalOwnerRef(session.scope)
  const matchesIdentity =
    session.scope.projectId === command.projectId &&
    session.scope.workspaceId === command.workspaceId &&
    session.scope.blockId === command.blockId &&
    session.scope.sessionId === command.sessionId &&
    session.scope.runId === command.runId &&
    session.scope.generation === command.generation
  const isCurrentOrNaturallyExited =
    state.currentSessionId === session.id ||
    (state.currentSessionId === undefined &&
      session.status === 'exited' &&
      state.restorableSessionId === session.id)

  if (
    !matchesIdentity ||
    commandOwner.kind !== sessionOwner.kind ||
    commandOwner.id !== sessionOwner.id ||
    state.latestGeneration !== command.generation ||
    !isCurrentOrNaturallyExited ||
    (session.status !== 'running' && session.status !== 'exited')
  ) {
    throw createExpectedAppError(
      'RUN_SCOPE_STALE',
      'Terminal view no longer matches the current runtime scope.'
    )
  }
}
